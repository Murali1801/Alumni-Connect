-- Learning hub: courses and training programmes alumni write for students,
-- the progress students make through them, and live workshops with RSVPs.
--
-- A course has ordered modules; a module has ordered lessons. A lesson is one
-- of four kinds: text (plain text with light markup, never HTML), video (a
-- YouTube or Vimeo link), link (an outside resource) or quiz (multiple choice,
-- one correct option per question, stored as jsonb on the lesson).
--
-- The app reads and writes through the service key after its own checks; the
-- policies below are the backstop for anything that uses the anon key.
--
-- Strictly additive: new tables only, nothing existing is changed.

create table if not exists courses (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null references users(id) on delete cascade,
  title         text not null check (char_length(btrim(title)) between 3 and 120),
  summary       text not null default '' check (char_length(summary) <= 800),
  -- A colour token from the app's palette, never a raw colour or gradient.
  cover         text not null default 'primary'
                check (cover in ('primary', 'chart-2', 'chart-3', 'chart-4', 'success', 'warning', 'info', 'destructive')),
  level         text not null default 'beginner' check (level in ('beginner', 'intermediate', 'advanced')),
  topics        text[] not null default '{}',
  skills        text[] not null default '{}',
  est_hours     numeric(5,1) not null default 1 check (est_hours > 0 and est_hours <= 500),
  published     boolean not null default false,
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists courses_author on courses (author_id);
create index if not exists courses_published on courses (published_at desc) where published;
create index if not exists courses_topics on courses using gin (topics);
create index if not exists courses_skills on courses using gin (skills);

create table if not exists course_modules (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references courses(id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 1 and 120),
  position    int not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists course_modules_course on course_modules (course_id, position);

create table if not exists course_lessons (
  id            uuid primary key default gen_random_uuid(),
  module_id     uuid not null references course_modules(id) on delete cascade,
  -- Denormalised so progress and analytics read one course without a join.
  course_id     uuid not null references courses(id) on delete cascade,
  title         text not null check (char_length(btrim(title)) between 1 and 120),
  kind          text not null check (kind in ('text', 'video', 'link', 'quiz')),
  position      int not null default 0,
  body          text not null default '' check (char_length(body) <= 20000),
  url           text check (url is null or (char_length(url) <= 500 and url ~* '^https://')),
  -- [{ "prompt": "...", "options": ["..."], "correct": 0, "explanation": "..." }]
  quiz          jsonb not null default '[]' check (jsonb_typeof(quiz) = 'array'),
  duration_min  int not null default 5 check (duration_min between 1 and 600),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists course_lessons_module on course_lessons (module_id, position);
create index if not exists course_lessons_course on course_lessons (course_id);

create table if not exists course_enrolments (
  course_id       uuid not null references courses(id) on delete cascade,
  user_id         uuid not null references users(id) on delete cascade,
  enrolled_at     timestamptz not null default now(),
  last_lesson_id  uuid references course_lessons(id) on delete set null,
  last_seen_at    timestamptz not null default now(),
  -- The completion record: set once every lesson is done, kept afterwards.
  completed_at    timestamptz,
  score           int check (score between 0 and 100),
  primary key (course_id, user_id)
);

create index if not exists course_enrolments_user on course_enrolments (user_id, last_seen_at desc);

create table if not exists lesson_progress (
  user_id       uuid not null references users(id) on delete cascade,
  lesson_id     uuid not null references course_lessons(id) on delete cascade,
  course_id     uuid not null references courses(id) on delete cascade,
  completed_at  timestamptz,
  quiz_score    int check (quiz_score between 0 and 100),
  quiz_answers  jsonb,
  attempts      int not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create index if not exists lesson_progress_course on lesson_progress (course_id, user_id);

create table if not exists workshops (
  id            uuid primary key default gen_random_uuid(),
  host_id       uuid not null references users(id) on delete cascade,
  course_id     uuid references courses(id) on delete set null,
  title         text not null check (char_length(btrim(title)) between 3 and 120),
  description   text not null default '' check (char_length(description) <= 2000),
  starts_at     timestamptz not null,
  duration_min  int not null default 60 check (duration_min between 15 and 480),
  capacity      int not null default 50 check (capacity between 1 and 1000),
  location      text not null default 'Online' check (char_length(location) <= 120),
  -- An in-app video room path or an https meeting link, shown to attendees only.
  room_path     text check (room_path is null or room_path ~ '^/call/[A-Za-z0-9_-]{4,80}$' or (room_path ~* '^https://' and char_length(room_path) <= 500)),
  topics        text[] not null default '{}',
  cancelled_at  timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists workshops_starts on workshops (starts_at);
create index if not exists workshops_host on workshops (host_id, starts_at desc);

create table if not exists workshop_rsvps (
  workshop_id  uuid not null references workshops(id) on delete cascade,
  user_id      uuid not null references users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (workshop_id, user_id)
);

create index if not exists workshop_rsvps_user on workshop_rsvps (user_id);

/* ------------------------------------------------------------------ */
/* Capacity: enforced in the database so two last-seat RSVPs cannot     */
/* both land.                                                           */
/* ------------------------------------------------------------------ */

create or replace function public.workshop_rsvp_capacity() returns trigger
language plpgsql security definer set search_path = public as $$
declare cap int; taken int; gone timestamptz;
begin
  -- Locking the workshop row serialises RSVPs for the same session.
  select capacity, cancelled_at into cap, gone from workshops where id = new.workshop_id for update;
  if gone is not null then
    raise exception 'workshop_cancelled' using errcode = 'P0001';
  end if;
  select count(*) into taken from workshop_rsvps where workshop_id = new.workshop_id;
  if taken >= cap then
    raise exception 'workshop_full' using errcode = 'P0001';
  end if;
  return new;
end $$;

revoke all on function public.workshop_rsvp_capacity() from public;

drop trigger if exists workshop_rsvps_capacity on workshop_rsvps;
create trigger workshop_rsvps_capacity before insert on workshop_rsvps
  for each row execute function public.workshop_rsvp_capacity();

/* ------------------------------------------------------------------ */
/* Row level security                                                  */
/* ------------------------------------------------------------------ */

alter table courses enable row level security;
alter table course_modules enable row level security;
alter table course_lessons enable row level security;
alter table course_enrolments enable row level security;
alter table lesson_progress enable row level security;
alter table workshops enable row level security;
alter table workshop_rsvps enable row level security;

-- Security definer so the child-table policies can ask about a course without
-- recursing through the courses policy.
create or replace function public.can_read_course(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from courses c where c.id = cid and (c.published or c.author_id = auth.uid()))
      or public.is_admin();
$$;

create or replace function public.owns_course(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from courses c where c.id = cid and c.author_id = auth.uid());
$$;

revoke all on function public.can_read_course(uuid) from public;
revoke all on function public.owns_course(uuid) from public;
grant execute on function public.can_read_course(uuid) to authenticated;
grant execute on function public.owns_course(uuid) to authenticated;

drop policy if exists "members read published courses" on courses;
create policy "members read published courses" on courses
  for select to authenticated using (published or author_id = auth.uid() or public.is_admin());
drop policy if exists "alumni create courses as themselves" on courses;
create policy "alumni create courses as themselves" on courses
  for insert to authenticated with check (
    author_id = auth.uid() and exists (select 1 from users u where u.id = auth.uid() and u.role = 'alumni'));
drop policy if exists "authors edit their courses" on courses;
create policy "authors edit their courses" on courses
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
drop policy if exists "authors delete their courses" on courses;
create policy "authors delete their courses" on courses
  for delete to authenticated using (author_id = auth.uid());

drop policy if exists "members read modules of readable courses" on course_modules;
create policy "members read modules of readable courses" on course_modules
  for select to authenticated using (public.can_read_course(course_id));
drop policy if exists "authors manage modules" on course_modules;
create policy "authors manage modules" on course_modules
  for all to authenticated using (public.owns_course(course_id)) with check (public.owns_course(course_id));

drop policy if exists "members read lessons of readable courses" on course_lessons;
create policy "members read lessons of readable courses" on course_lessons
  for select to authenticated using (public.can_read_course(course_id));
drop policy if exists "authors manage lessons" on course_lessons;
create policy "authors manage lessons" on course_lessons
  for all to authenticated using (public.owns_course(course_id)) with check (public.owns_course(course_id));

drop policy if exists "learners and authors read enrolments" on course_enrolments;
create policy "learners and authors read enrolments" on course_enrolments
  for select to authenticated using (user_id = auth.uid() or public.owns_course(course_id) or public.is_admin());
drop policy if exists "students enrol as themselves" on course_enrolments;
create policy "students enrol as themselves" on course_enrolments
  for insert to authenticated with check (user_id = auth.uid() and public.can_read_course(course_id));
drop policy if exists "learners update their enrolment" on course_enrolments;
create policy "learners update their enrolment" on course_enrolments
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "learners leave a course" on course_enrolments;
create policy "learners leave a course" on course_enrolments
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "learners and authors read progress" on lesson_progress;
create policy "learners and authors read progress" on lesson_progress
  for select to authenticated using (user_id = auth.uid() or public.owns_course(course_id) or public.is_admin());
drop policy if exists "learners record their progress" on lesson_progress;
create policy "learners record their progress" on lesson_progress
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "learners update their progress" on lesson_progress;
create policy "learners update their progress" on lesson_progress
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "members read workshops" on workshops;
create policy "members read workshops" on workshops
  for select to authenticated using (true);
drop policy if exists "alumni host workshops as themselves" on workshops;
create policy "alumni host workshops as themselves" on workshops
  for insert to authenticated with check (
    host_id = auth.uid() and exists (select 1 from users u where u.id = auth.uid() and u.role = 'alumni'));
drop policy if exists "hosts edit their workshops" on workshops;
create policy "hosts edit their workshops" on workshops
  for update to authenticated using (host_id = auth.uid()) with check (host_id = auth.uid());
drop policy if exists "hosts delete their workshops" on workshops;
create policy "hosts delete their workshops" on workshops
  for delete to authenticated using (host_id = auth.uid());

drop policy if exists "attendees and hosts read rsvps" on workshop_rsvps;
create policy "attendees and hosts read rsvps" on workshop_rsvps
  for select to authenticated using (
    user_id = auth.uid()
    or exists (select 1 from workshops w where w.id = workshop_id and w.host_id = auth.uid())
    or public.is_admin());
drop policy if exists "members rsvp as themselves" on workshop_rsvps;
create policy "members rsvp as themselves" on workshop_rsvps
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "members cancel their rsvp" on workshop_rsvps;
create policy "members cancel their rsvp" on workshop_rsvps
  for delete to authenticated using (user_id = auth.uid());
