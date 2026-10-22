-- Search across people, posts, jobs and companies, and the knowledge base the
-- help assistant retrieves from.
--
-- Strictly additive: an extension, helper functions, expression indexes, one new
-- table and the search functions. No existing column, row or policy changes, so
-- nothing is rewritten (expression indexes instead of generated columns on the
-- existing tables for exactly that reason).
--
-- The search functions run as the caller (security invoker) and are executable
-- by the service role only: the app calls them from the server after checking
-- the session, and none of them can return a contact column because none of
-- them select one.

create extension if not exists pg_trgm with schema extensions;

/* ---- Helpers ------------------------------------------------------------ */

-- array_to_string is only STABLE, which an index expression cannot use. Joining
-- a text[] with a space has no locale or setting dependency, so IMMUTABLE holds.
create or replace function public.search_join(arr text[]) returns text
language sql immutable parallel safe as $$
  select coalesce(pg_catalog.array_to_string(arr, ' '), '')
$$;

create or replace function public.post_search_doc(body text, hashtags text[]) returns tsvector
language sql immutable parallel safe as $$
  select pg_catalog.setweight(pg_catalog.to_tsvector('english'::regconfig, public.search_join(hashtags)), 'A')
      || pg_catalog.setweight(pg_catalog.to_tsvector('english'::regconfig, coalesce(body, '')), 'B')
$$;

create or replace function public.opportunity_search_doc(
  title text, description text, location text, eligibility text, skills text[]
) returns tsvector
language sql immutable parallel safe as $$
  select pg_catalog.setweight(pg_catalog.to_tsvector('english'::regconfig, coalesce(title, '') || ' ' || public.search_join(skills)), 'A')
      || pg_catalog.setweight(pg_catalog.to_tsvector('english'::regconfig, coalesce(description, '')), 'B')
      || pg_catalog.setweight(pg_catalog.to_tsvector('english'::regconfig, coalesce(location, '') || ' ' || coalesce(eligibility, '')), 'C')
$$;

create or replace function public.company_search_doc(name text, industry text) returns tsvector
language sql immutable parallel safe as $$
  select pg_catalog.setweight(pg_catalog.to_tsvector('english'::regconfig, coalesce(name, '')), 'A')
      || pg_catalog.setweight(pg_catalog.to_tsvector('english'::regconfig, coalesce(industry, '')), 'C')
$$;

-- What a person types into a search box: every word must match, the last one
-- as a prefix so results appear while typing. Quotes, "or" and -exclusions
-- switch to websearch syntax instead. Tokens are cut to letters and digits
-- before they reach to_tsquery, so no input can be a tsquery syntax error.
create or replace function public.search_query(q text) returns tsquery
language sql immutable parallel safe as $$
  select case
    when q ~ '"|(^|\s)-\S|\s[oO][rR]\s' then pg_catalog.websearch_to_tsquery('english'::regconfig, q)
    else coalesce(
      (select pg_catalog.to_tsquery('english'::regconfig, string_agg(t || ':*', ' & '))
         from regexp_split_to_table(lower(regexp_replace(coalesce(q, ''), '[^[:alnum:]]+', ' ', 'g')), '\s+') t
        where t <> ''),
      ''::tsquery)
  end
$$;

-- A natural-language question: any content word may match, and ts_rank rewards
-- documents that match more of them. Used by the assistant's retrieval, where
-- requiring every word of "how do I cancel a session" would find nothing.
create or replace function public.search_any_query(q text) returns tsquery
language sql immutable parallel safe as $$
  select coalesce(
    (select string_agg('''' || l || '''', ' | ')::tsquery
       from (select regexp_replace(lex, '[^[:alnum:]]', '', 'g') l
               from unnest(pg_catalog.tsvector_to_array(pg_catalog.to_tsvector('english'::regconfig, coalesce(q, '')))) lex) x
      where l <> ''),
    ''::tsquery)
$$;

/* ---- Indexes ------------------------------------------------------------ */

create index if not exists posts_search_doc on posts
  using gin (public.post_search_doc(body, hashtags));
create index if not exists opportunities_search_doc on opportunities
  using gin (public.opportunity_search_doc(title, description, location, eligibility, target_skills));
create index if not exists companies_search_doc on companies
  using gin (public.company_search_doc(name, industry));
create index if not exists companies_name_trgm on companies using gin (name extensions.gin_trgm_ops);
create index if not exists users_full_name_trgm on users using gin (full_name extensions.gin_trgm_ops);

/* ---- Knowledge base ----------------------------------------------------- */

-- Written by scripts/seed-knowledge.mjs (service key); read by the assistant.
-- `id` is a stable slug so re-seeding updates in place. `url` may hold {role},
-- filled in per reader. Empty `roles` means every role.
create table if not exists knowledge_docs (
  id          text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,80}$'),
  title       text not null check (char_length(title) between 3 and 200),
  body        text not null check (char_length(body) between 10 and 4000),
  source      text not null default 'guide' check (source in ('faq', 'guide', 'policy')),
  url         text check (char_length(url) <= 300),
  roles       text[] not null default '{}',
  keywords    text[] not null default '{}',
  updated_at  timestamptz not null default now(),
  tsv         tsvector generated always as (
                pg_catalog.setweight(pg_catalog.to_tsvector('english'::regconfig, title), 'A')
             || pg_catalog.setweight(pg_catalog.to_tsvector('english'::regconfig, public.search_join(keywords)), 'B')
             || pg_catalog.setweight(pg_catalog.to_tsvector('english'::regconfig, body), 'C')
              ) stored
);

create index if not exists knowledge_docs_tsv on knowledge_docs using gin (tsv);

alter table knowledge_docs enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'knowledge_docs'
                 and policyname = 'members read the knowledge base') then
    create policy "members read the knowledge base" on knowledge_docs
      for select to authenticated using (true);
  end if;
end $$;

/* ---- Search functions --------------------------------------------------- */

-- Members (students and alumni with accounts) by name, headline, skills and
-- bio. The document spans five tables, so it is built per row rather than
-- indexed; at a few thousand members that is still a millisecond-scale scan.
-- Names also match by trigram word similarity, which tolerates typos.
create or replace function public.search_people(
  q text, p_role text default null, p_branch text default null, p_batch int default null,
  p_any boolean default false, p_limit int default 20, p_offset int default 0
) returns table (id uuid, rank real, total bigint)
language sql stable security invoker set search_path = public, extensions, pg_temp as $$
  with input as (
    select case when p_any then public.search_any_query(q) else public.search_query(q) end as tsq,
           btrim(coalesce(q, '')) as raw
  )
  select u.id,
         (ts_rank(d.doc, i.tsq) + case when p_any then 0 else 2 * word_similarity(i.raw, u.full_name) end)::real as rank,
         count(*) over () as total
    from users u
   cross join input i
    left join alumni_profiles ap on ap.user_id = u.id
    left join alumni_records r on r.id = ap.record_id
    left join companies c on c.id = ap.current_company_id
    left join student_profiles sp on sp.user_id = u.id
   cross join lateral (
     select setweight(to_tsvector('english', concat_ws(' ', u.full_name, ap.designation, c.name, sp.target_role)), 'A')
         || setweight(to_tsvector('english', concat_ws(' ', public.search_join(ap.skills), public.search_join(sp.skills),
                                                         ap.industry, sp.target_company, sp.target_industry)), 'B')
         || setweight(to_tsvector('english', concat_ws(' ', ap.location, r.city, sp.location_pref,
                                                         coalesce(r.branch, sp.branch))), 'C')
         || setweight(to_tsvector('english', concat_ws(' ', ap.bio, sp.bio)), 'D') as doc
   ) d
   where u.role in ('student', 'alumni')
     and (p_role is null or u.role::text = p_role)
     and (p_branch is null or coalesce(r.branch, sp.branch) = p_branch)
     and (p_batch is null or coalesce(r.batch_year, sp.batch_year) = p_batch)
     and (d.doc @@ i.tsq or (not p_any and char_length(i.raw) >= 3 and word_similarity(i.raw, u.full_name) >= 0.45))
   order by rank desc, u.full_name, u.id
   limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

-- Posts by text and hashtags. Relevance first, decayed by age: a post loses
-- half its recency bonus at two weeks, so an exact old match still beats a
-- vague new one.
create or replace function public.search_posts(
  q text, p_author uuid default null, p_since timestamptz default null,
  p_any boolean default false, p_limit int default 20, p_offset int default 0
) returns table (id uuid, rank real, total bigint)
language sql stable security invoker set search_path = public, extensions, pg_temp as $$
  with input as (
    select case when p_any then public.search_any_query(q) else public.search_query(q) end as tsq
  )
  select p.id,
         (ts_rank(public.post_search_doc(p.body, p.hashtags), i.tsq)
           * (0.5 + 0.5 / (1 + extract(epoch from (now() - p.created_at)) / 86400 / 14)))::real as rank,
         count(*) over () as total
    from posts p
   cross join input i
   where public.post_search_doc(p.body, p.hashtags) @@ i.tsq
     and (p_author is null or p.author_id = p_author)
     and (p_since is null or p.created_at >= p_since)
   order by rank desc, p.created_at desc, p.id
   limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

-- Openings by title, skills, description, location and company. Open-only (the
-- default) also drops listings whose deadline has passed.
create or replace function public.search_jobs(
  q text, p_type text default null, p_open_only boolean default true,
  p_any boolean default false, p_limit int default 20, p_offset int default 0
) returns table (id uuid, rank real, total bigint)
language sql stable security invoker set search_path = public, extensions, pg_temp as $$
  with input as (
    select case when p_any then public.search_any_query(q) else public.search_query(q) end as tsq,
           btrim(coalesce(q, '')) as raw
  ),
  co as (
    select c.id
      from companies c, input i
     where public.company_search_doc(c.name, c.industry) @@ i.tsq
        or (not p_any and char_length(i.raw) >= 3 and word_similarity(i.raw, c.name) >= 0.6)
  )
  select o.id,
         ((ts_rank(public.opportunity_search_doc(o.title, o.description, o.location, o.eligibility, o.target_skills), i.tsq)
            + case when o.company_id in (select co.id from co) then 0.3 else 0 end)
           * (0.6 + 0.4 / (1 + extract(epoch from (now() - o.created_at)) / 86400 / 30)))::real as rank,
         count(*) over () as total
    from opportunities o
   cross join input i
   where (public.opportunity_search_doc(o.title, o.description, o.location, o.eligibility, o.target_skills) @@ i.tsq
          or o.company_id in (select co.id from co))
     and (p_type is null or o.type::text = p_type)
     and (not coalesce(p_open_only, true) or (o.is_open and (o.deadline is null or o.deadline >= current_date)))
   order by rank desc, o.created_at desc, o.id
   limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

-- Companies by name (typo-tolerant) and industry, with how present each is on
-- the network: alumni working there now and open listings.
create or replace function public.search_companies(q text, p_limit int default 20, p_offset int default 0)
returns table (id uuid, name text, industry text, alumni_count int, open_jobs int, rank real, total bigint)
language sql stable security invoker set search_path = public, extensions, pg_temp as $$
  with input as (select public.search_query(q) as tsq, btrim(coalesce(q, '')) as raw),
  hits as (
    select c.id, c.name, c.industry,
           (ts_rank(public.company_search_doc(c.name, c.industry), i.tsq) + 2 * word_similarity(i.raw, c.name))::real as rank
      from companies c, input i
     where public.company_search_doc(c.name, c.industry) @@ i.tsq
        or (char_length(i.raw) >= 3 and word_similarity(i.raw, c.name) >= 0.5)
  )
  select h.id, h.name, h.industry,
         (select count(*) from alumni_profiles ap where ap.current_company_id = h.id)::int as alumni_count,
         (select count(*) from opportunities o where o.company_id = h.id and o.is_open)::int as open_jobs,
         h.rank,
         count(*) over () as total
    from hits h
   order by h.rank desc, alumni_count desc, h.name
   limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

-- Knowledge docs for a question, filtered to the reader's role. Rank is
-- normalised by document length so a long guide does not win on volume alone.
create or replace function public.search_knowledge(q text, p_role text default null, p_limit int default 6)
returns table (id text, title text, body text, source text, url text, rank real)
language sql stable security invoker set search_path = public, extensions, pg_temp as $$
  with input as (select public.search_any_query(q) as tsq)
  select k.id, k.title, k.body, k.source, k.url,
         (ts_rank(k.tsv, i.tsq, 1) + 0.2 * word_similarity(coalesce(q, ''), k.title))::real as rank
    from knowledge_docs k
   cross join input i
   where k.tsv @@ i.tsq
     and (k.roles = '{}' or p_role = any (k.roles))
   order by rank desc, k.id
   limit least(greatest(coalesce(p_limit, 6), 1), 20)
$$;

revoke all on function public.search_people(text, text, text, int, boolean, int, int) from public, anon, authenticated;
revoke all on function public.search_posts(text, uuid, timestamptz, boolean, int, int) from public, anon, authenticated;
revoke all on function public.search_jobs(text, text, boolean, boolean, int, int) from public, anon, authenticated;
revoke all on function public.search_companies(text, int, int) from public, anon, authenticated;
revoke all on function public.search_knowledge(text, text, int) from public, anon, authenticated;

grant execute on function public.search_people(text, text, text, int, boolean, int, int) to service_role;
grant execute on function public.search_posts(text, uuid, timestamptz, boolean, int, int) to service_role;
grant execute on function public.search_jobs(text, text, boolean, boolean, int, int) to service_role;
grant execute on function public.search_companies(text, int, int) to service_role;
grant execute on function public.search_knowledge(text, text, int) to service_role;

notify pgrst, 'reload schema';
