-- The Home feed: posts that students and alumni write on AlumniBridge, with an
-- optional photo, likes and comments.
--
-- Every signed-in member reads the whole feed. Members write, edit and delete
-- only their own posts, likes and comments; administrators can take any post or
-- comment down. The app reads and writes through the server (service key) after
-- checking the session, so these policies are the second line, not the first.
--
-- Photos live in the public `post-images` bucket under <author id>/<uuid>.<ext>.
-- The object name is unguessable, and only the server uploads or deletes.

create table posts (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references users(id) on delete cascade,
  body        text not null default '' check (char_length(body) <= 3000),
  image_path  text check (char_length(image_path) <= 300),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- A post says something, shows something, or both.
  check (char_length(btrim(body)) > 0 or image_path is not null)
);

-- The feed reads newest first with (created_at, id) as the cursor.
create index on posts (created_at desc, id desc);
create index on posts (author_id, created_at desc);

create table post_likes (
  post_id     uuid not null references posts(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index on post_likes (user_id);

create table post_comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references posts(id) on delete cascade,
  author_id   uuid not null references users(id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at  timestamptz not null default now()
);

create index on post_comments (post_id, created_at);

alter table posts enable row level security;
alter table post_likes enable row level security;
alter table post_comments enable row level security;

create policy "members read posts" on posts
  for select to authenticated using (true);
create policy "members write their own posts" on posts
  for insert to authenticated with check (author_id = auth.uid());
create policy "authors edit their own posts" on posts
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "authors and admins delete posts" on posts
  for delete to authenticated using (author_id = auth.uid() or public.is_admin());

create policy "members read likes" on post_likes
  for select to authenticated using (true);
create policy "members like as themselves" on post_likes
  for insert to authenticated with check (user_id = auth.uid());
create policy "members unlike their own likes" on post_likes
  for delete to authenticated using (user_id = auth.uid());

create policy "members read comments" on post_comments
  for select to authenticated using (true);
create policy "members comment as themselves" on post_comments
  for insert to authenticated with check (author_id = auth.uid());
create policy "authors and admins delete comments" on post_comments
  for delete to authenticated using (author_id = auth.uid() or public.is_admin());

-- One row per post with its author's headline and the counts the feed shows.
-- security_invoker, so reading the view applies the policies above.
create view post_feed with (security_invoker = true) as
  select
    p.id,
    p.author_id,
    p.body,
    p.image_path,
    p.created_at,
    p.updated_at,
    u.full_name,
    u.role,
    coalesce(r.branch, sp.branch) as branch,
    coalesce(r.batch_year, sp.batch_year) as batch_year,
    r.id as record_id,
    ap.designation,
    c.name as company_name,
    (select count(*) from post_likes l where l.post_id = p.id)::int as like_count,
    (select count(*) from post_comments pc where pc.post_id = p.id)::int as comment_count
  from posts p
  join users u on u.id = p.author_id
  left join alumni_profiles ap on ap.user_id = p.author_id
  left join alumni_records r on r.id = ap.record_id
  left join companies c on c.id = ap.current_company_id
  left join student_profiles sp on sp.user_id = p.author_id;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-images', 'post-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;
