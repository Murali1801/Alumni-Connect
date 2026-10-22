-- The feed grows up: opportunity posts (jobs, internships, placement drives,
-- referrals) backed by real opportunity listings, reactions beyond Like,
-- reposts, saved posts, hashtags and @mentions.
--
-- An opportunity post is a post with `opportunity_id` set. The listing lives in
-- `opportunities`, so it also appears on the Jobs page, can be closed from My
-- Postings, and students answer it through the existing request flow.

alter type opportunity_type add value if not exists 'placement';
alter type opportunity_type add value if not exists 'referral';

alter table opportunities
  add column if not exists work_mode    text check (work_mode in ('onsite', 'hybrid', 'remote')),
  add column if not exists experience   text check (char_length(experience) <= 60),
  add column if not exists compensation text check (char_length(compensation) <= 60),
  add column if not exists duration     text check (char_length(duration) <= 60),
  add column if not exists deadline     date,
  add column if not exists eligibility  text check (char_length(eligibility) <= 300),
  -- How to respond: an external link, a referral request, or a message to the poster.
  add column if not exists apply_via    text not null default 'link' check (apply_via in ('link', 'request', 'message'));

alter table posts
  add column if not exists opportunity_id uuid references opportunities(id) on delete set null,
  add column if not exists repost_of      uuid references posts(id) on delete cascade,
  add column if not exists hashtags       text[] not null default '{}',
  add column if not exists mentions       uuid[] not null default '{}';

-- A repost may have no text of its own, so the "says or shows something" rule
-- from 0005 makes way for one that also accepts reposts and opportunities.
alter table posts drop constraint if exists posts_check;
alter table posts add constraint posts_has_content
  check (char_length(btrim(body)) > 0 or image_path is not null or repost_of is not null or opportunity_id is not null);

create index if not exists posts_opportunity on posts (opportunity_id) where opportunity_id is not null;
create index if not exists posts_repost_of on posts (repost_of) where repost_of is not null;
create index if not exists posts_hashtags on posts using gin (hashtags);

alter table post_comments add column if not exists mentions uuid[] not null default '{}';

-- Reactions: the like row now says which one.
alter table post_likes
  add column if not exists reaction text not null default 'like'
  check (reaction in ('like', 'celebrate', 'support', 'insightful', 'curious'));

create table saved_posts (
  user_id     uuid not null references users(id) on delete cascade,
  post_id     uuid not null references posts(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, post_id)
);

alter table saved_posts enable row level security;

create policy "members read their saved posts" on saved_posts
  for select to authenticated using (user_id = auth.uid());
create policy "members save as themselves" on saved_posts
  for insert to authenticated with check (user_id = auth.uid());
create policy "members unsave their own" on saved_posts
  for delete to authenticated using (user_id = auth.uid());

-- The feed view, now with opportunity details, reactions and reposts.
drop view if exists post_feed;
create view post_feed with (security_invoker = true) as
  select
    p.id,
    p.author_id,
    p.body,
    p.image_path,
    p.created_at,
    p.updated_at,
    p.repost_of,
    p.hashtags,
    p.opportunity_id,
    u.full_name,
    u.role,
    u.avatar_path,
    coalesce(r.branch, sp.branch) as branch,
    coalesce(r.batch_year, sp.batch_year) as batch_year,
    r.id as record_id,
    ap.designation,
    c.name as company_name,
    o.type::text as opportunity_type,
    o.title as opportunity_title,
    oc.name as opportunity_company,
    o.location as opportunity_location,
    o.work_mode,
    o.experience,
    o.compensation,
    o.duration,
    o.deadline,
    o.eligibility,
    o.apply_via,
    o.application_link,
    o.target_skills,
    o.is_open as opportunity_open,
    (select count(*) from post_likes l where l.post_id = p.id)::int as like_count,
    (select coalesce(jsonb_object_agg(x.reaction, x.n), '{}'::jsonb)
       from (select reaction, count(*) n from post_likes l where l.post_id = p.id group by reaction) x) as reaction_counts,
    (select count(*) from post_comments pc where pc.post_id = p.id)::int as comment_count,
    (select count(*) from posts rp where rp.repost_of = p.id)::int as repost_count
  from posts p
  join users u on u.id = p.author_id
  left join alumni_profiles ap on ap.user_id = p.author_id
  left join alumni_records r on r.id = ap.record_id
  left join companies c on c.id = ap.current_company_id
  left join student_profiles sp on sp.user_id = p.author_id
  left join opportunities o on o.id = p.opportunity_id
  left join companies oc on oc.id = o.company_id;

/* Mentions and reposts notify the people they involve. */

create or replace function public.notify_post_mentions() returns trigger
language plpgsql security definer set search_path = public as $$
declare target uuid; original_author uuid;
begin
  foreach target in array new.mentions loop
    if target <> new.author_id then
      insert into notifications (user_id, actor_id, type, post_id) values (target, new.author_id, 'mention', new.id);
    end if;
  end loop;
  if new.repost_of is not null then
    select author_id into original_author from posts where id = new.repost_of;
    if original_author is not null and original_author <> new.author_id then
      insert into notifications (user_id, actor_id, type, post_id) values (original_author, new.author_id, 'repost', new.repost_of);
    end if;
  end if;
  return new;
end $$;

create trigger posts_notify after insert on posts
  for each row execute function public.notify_post_mentions();

create or replace function public.notify_comment_mentions() returns trigger
language plpgsql security definer set search_path = public as $$
declare target uuid;
begin
  foreach target in array new.mentions loop
    if target <> new.author_id then
      insert into notifications (user_id, actor_id, type, post_id, comment_id)
      values (target, new.author_id, 'mention', new.post_id, new.id);
    end if;
  end loop;
  return new;
end $$;

create trigger post_comments_mentions_notify after insert on post_comments
  for each row execute function public.notify_comment_mentions();

revoke all on function public.notify_post_mentions() from public;
revoke all on function public.notify_comment_mentions() from public;
