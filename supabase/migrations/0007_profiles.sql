-- Richer, LinkedIn-style profiles: a photo and a cover image, work and
-- education entries members write themselves, skill endorsements from other
-- members, and a record of who viewed a profile.
--
-- Photos live in the public `avatars` bucket under <user id>/<uuid>.<ext>; only
-- the server uploads or deletes. The college's institutional record is untouched:
-- entries here are what members say about themselves.

alter table users
  add column if not exists avatar_path text check (char_length(avatar_path) <= 300),
  add column if not exists cover_path  text check (char_length(cover_path) <= 300);

-- Students get an About section too; alumni already have alumni_profiles.bio.
alter table student_profiles add column if not exists bio text check (char_length(bio) <= 2000);

create table member_experience (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  kind          text not null check (kind in ('work', 'education')),
  title         text not null check (char_length(btrim(title)) between 1 and 120),        -- role, or degree
  organisation  text not null check (char_length(btrim(organisation)) between 1 and 120), -- company, or institution
  location      text check (char_length(location) <= 120),
  start_date    date not null,
  end_date      date,                                                                       -- null: present
  description   text check (char_length(description) <= 1000),
  created_at    timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create index on member_experience (user_id, kind, start_date desc);

alter table member_experience enable row level security;

create policy "members read experience" on member_experience
  for select to authenticated using (true);
create policy "members manage their own experience" on member_experience
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table skill_endorsements (
  endorsee_id  uuid not null references users(id) on delete cascade,
  skill        text not null check (char_length(skill) between 1 and 60),
  endorser_id  uuid not null references users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (endorsee_id, skill, endorser_id),
  check (endorsee_id <> endorser_id)
);

create index on skill_endorsements (endorser_id);

alter table skill_endorsements enable row level security;

create policy "members read endorsements" on skill_endorsements
  for select to authenticated using (true);
create policy "members endorse as themselves" on skill_endorsements
  for insert to authenticated with check (endorser_id = auth.uid());
create policy "endorsers take endorsements back" on skill_endorsements
  for delete to authenticated using (endorser_id = auth.uid());

-- One row per viewer, profile and day, so repeat visits on one day count once.
create table profile_views (
  viewer_id  uuid not null references users(id) on delete cascade,
  viewed_id  uuid not null references users(id) on delete cascade,
  viewed_on  date not null default current_date,
  primary key (viewer_id, viewed_id, viewed_on),
  check (viewer_id <> viewed_id)
);

create index on profile_views (viewed_id, viewed_on desc);

alter table profile_views enable row level security;

-- Members see who viewed their own profile; writes go through the server.
create policy "members read views of their profile" on profile_views
  for select to authenticated using (viewed_id = auth.uid());

create or replace function public.notify_endorsement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, actor_id, type, data)
  values (new.endorsee_id, new.endorser_id, 'endorsement', jsonb_build_object('skill', new.skill));
  return new;
end $$;

create trigger skill_endorsements_notify after insert on skill_endorsements
  for each row execute function public.notify_endorsement();

revoke all on function public.notify_endorsement() from public;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
