-- Posts and articles alumni bring over from their own LinkedIn data export.
--
-- The alumnus uploads LinkedIn's "Get a copy of your data" zip on
-- /alumni/profile/import. Shares.csv (their posts) and the Articles folder are
-- read in their browser, nothing is selected by default, and only the items
-- they tick are sent here. We never fetch anything from LinkedIn ourselves.
--
-- Visibility: an alumnus always sees their own posts. Everyone else signed in
-- sees a post only once its author's institutional record is verified, so an
-- unverified claim cannot publish into the network feed. The alumni_feed view
-- at the end serves the feed itself.

create table alumni_posts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  kind          text not null check (kind in ('post', 'article')),
  -- Where the post came from. Only LinkedIn exports today; new sources extend the check.
  source        text not null default 'linkedin_export' check (source in ('linkedin_export')),
  -- Stable id from the export (the post or article URL), so importing the same
  -- archive again updates posts instead of duplicating them.
  external_id   text not null check (char_length(external_id) between 1 and 500),
  title         text check (char_length(title) <= 300),
  body          text not null default '' check (char_length(body) <= 10000),
  linkedin_url  text check (char_length(linkedin_url) <= 500),
  shared_url    text check (char_length(shared_url) <= 500),
  has_media     boolean not null default false,
  posted_at     timestamptz not null,
  imported_at   timestamptz not null default now(),
  unique (user_id, external_id)
);

-- The feed reads newest first; a profile reads one author's newest first.
create index on alumni_posts (posted_at desc);
create index on alumni_posts (user_id, posted_at desc);

-- Is this user an alumnus whose record an administrator has verified?
-- Security definer, like is_admin() in 0001, so the policy below does not
-- depend on what the caller may read from alumni_profiles or alumni_records.
create or replace function public.is_verified_alumnus(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.alumni_profiles p
    join public.alumni_records r on r.id = p.record_id
    where p.user_id = uid and r.claim_status = 'verified'
  );
$$;

revoke all on function public.is_verified_alumnus(uuid) from public;
grant execute on function public.is_verified_alumnus(uuid) to authenticated;

alter table alumni_posts enable row level security;

create policy "members read verified alumni posts, owners read their own" on alumni_posts
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin() or public.is_verified_alumnus(user_id));

-- Only an alumnus with a claimed profile can add posts, and only as themselves.
create policy "alumni insert their own posts" on alumni_posts
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.alumni_profiles where user_id = auth.uid())
  );

create policy "alumni update their own posts" on alumni_posts
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Owners remove their posts; administrators can take a post down.
create policy "owners and admins delete posts" on alumni_posts
  for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- The network feed: verified authors only, with the public details the
-- directory already shows. Read by the server with the service role after it
-- has checked the viewer's role, so signed-in clients get no direct access.
create view alumni_feed as
  select
    p.id,
    p.user_id,
    p.kind,
    p.title,
    p.body,
    p.linkedin_url,
    p.shared_url,
    p.has_media,
    p.posted_at,
    r.id as record_id,
    r.full_name,
    r.branch,
    r.batch_year,
    pr.designation,
    c.name as company_name
  from alumni_posts p
  join alumni_profiles pr on pr.user_id = p.user_id
  join alumni_records r on r.id = pr.record_id
  left join companies c on c.id = pr.current_company_id
  where r.claim_status = 'verified';

revoke all on alumni_feed from anon, authenticated;
