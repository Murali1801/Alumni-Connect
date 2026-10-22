-- Interview pipelines: an alumnus (interviewer or recruiter) runs a candidate
-- through rounds — video, coding or MCQ — each with a schedule, an outcome and
-- scorecards. Rounds can be proctored in the candidate's browser; what that
-- produces is a log of events, never video.
--
-- Strictly additive. Reads and writes go through the app's server routes with
-- the service key; the policies below are the floor for anything that reaches
-- these tables with a member's own key.

create table if not exists interviews (
  id                    uuid primary key default gen_random_uuid(),
  candidate_id          uuid not null references users(id) on delete cascade,
  -- The alumnus who owns the pipeline. Rounds may name other interviewers.
  interviewer_id        uuid not null references users(id) on delete cascade,
  title                 text not null check (char_length(title) between 3 and 120),
  company               text check (char_length(company) <= 120),
  description           text check (char_length(description) <= 2000),
  opportunity_id        uuid references opportunities(id) on delete set null,
  request_id            uuid references requests(id) on delete set null,
  status                text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  decision              text not null default 'pending' check (decision in ('pending', 'selected', 'rejected', 'on_hold')),
  decision_note         text check (char_length(decision_note) <= 1000),
  -- The candidate sees the decision only once this is set.
  decision_released_at  timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (candidate_id <> interviewer_id)
);

create index if not exists interviews_candidate on interviews (candidate_id, created_at desc);
create index if not exists interviews_interviewer on interviews (interviewer_id, created_at desc);

create table if not exists interview_rounds (
  id                  uuid primary key default gen_random_uuid(),
  interview_id        uuid not null references interviews(id) on delete cascade,
  position            int not null default 1,
  title               text not null check (char_length(title) between 2 and 80),
  kind                text not null check (kind in ('video', 'coding', 'mcq')),
  scheduled_at        timestamptz not null,
  duration_min        int not null default 45 check (duration_min between 10 and 240),
  interviewer_id      uuid not null references users(id) on delete cascade,
  status              text not null default 'scheduled'
                      check (status in ('scheduled', 'in_progress', 'completed', 'cancelled', 'no_show')),
  outcome             text not null default 'pending' check (outcome in ('pending', 'passed', 'failed')),
  candidate_response  text not null default 'pending'
                      check (candidate_response in ('pending', 'accepted', 'reschedule_requested')),
  reschedule_note     text check (char_length(reschedule_note) <= 500),
  proctored           boolean not null default true,
  -- Coding: { problem, language, starter }. MCQ: { questions: [{ id, prompt, options, answer }] }.
  -- Holds the MCQ answer key, which is why candidates get no direct select below.
  content             jsonb not null default '{}',
  -- The video room for this round; the call stack keys its channel on it.
  room_id             uuid not null default gen_random_uuid() unique,
  started_at          timestamptz,
  ended_at            timestamptz,
  -- Outcome and feedback reach the candidate only once released.
  released_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (jsonb_typeof(content) = 'object')
);

create index if not exists interview_rounds_interview on interview_rounds (interview_id, position);
create index if not exists interview_rounds_interviewer on interview_rounds (interviewer_id, scheduled_at);

create table if not exists interview_scorecards (
  id              uuid primary key default gen_random_uuid(),
  round_id        uuid not null references interview_rounds(id) on delete cascade,
  reviewer_id     uuid not null references users(id) on delete cascade,
  -- { "Problem solving": 4, "Communication": 5, ... }, each 1–5; checked by the app.
  ratings         jsonb not null default '{}' check (jsonb_typeof(ratings) = 'object'),
  recommendation  text check (recommendation in ('strong_yes', 'yes', 'no', 'strong_no')),
  notes           text check (char_length(notes) <= 4000),
  -- Shared with the candidate when the round is released. Private notes stay private.
  feedback        text check (char_length(feedback) <= 2000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (round_id, reviewer_id)
);

create table if not exists interview_submissions (
  id            uuid primary key default gen_random_uuid(),
  round_id      uuid not null references interview_rounds(id) on delete cascade,
  candidate_id  uuid not null references users(id) on delete cascade,
  code          text check (char_length(code) <= 100000),
  language      text check (char_length(language) <= 40),
  -- MCQ: { question_id: option_index }.
  answers       jsonb not null default '{}' check (jsonb_typeof(answers) = 'object'),
  score         int,
  max_score     int,
  -- Null while the candidate is still working (autosave); set on submit.
  submitted_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (round_id, candidate_id)
);

create table if not exists proctor_events (
  id            uuid primary key default gen_random_uuid(),
  round_id      uuid not null references interview_rounds(id) on delete cascade,
  interview_id  uuid not null references interviews(id) on delete cascade,
  candidate_id  uuid not null references users(id) on delete cascade,
  type          text not null check (type in (
                  'consent_given', 'consent_declined', 'session_start', 'session_end',
                  'tab_hidden', 'tab_visible', 'window_blur', 'window_focus',
                  'fullscreen_exit', 'fullscreen_enter',
                  'copy', 'cut', 'paste', 'context_menu',
                  'multiple_displays',
                  'camera_off', 'camera_on', 'camera_blocked',
                  'no_person', 'multiple_people', 'phone_detected', 'vision_unavailable')),
  -- When it happened in the candidate's browser; received_at is when it arrived.
  occurred_at   timestamptz not null,
  -- How long a state lasted, on the event that ends it (e.g. tab_visible).
  duration_ms   int check (duration_ms >= 0),
  detail        jsonb not null default '{}' check (jsonb_typeof(detail) = 'object'),
  received_at   timestamptz not null default now()
);

create index if not exists proctor_events_round on proctor_events (round_id, occurred_at);
create index if not exists proctor_events_interview on proctor_events (interview_id);

/* ------------------------------------------------------------------ */
/* Who may see what                                                    */
/* ------------------------------------------------------------------ */

-- Security definer so the policies can look across the two tables without
-- recursing through each other's RLS.
create or replace function public.is_interview_staff(iid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from interviews i where i.id = iid and i.interviewer_id = auth.uid())
      or exists (select 1 from interview_rounds r where r.interview_id = iid and r.interviewer_id = auth.uid())
$$;

create or replace function public.is_interview_candidate(iid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from interviews i where i.id = iid and i.candidate_id = auth.uid())
$$;

revoke all on function public.is_interview_staff(uuid) from public;
revoke all on function public.is_interview_candidate(uuid) from public;
grant execute on function public.is_interview_staff(uuid) to authenticated;
grant execute on function public.is_interview_candidate(uuid) to authenticated;

alter table interviews enable row level security;
alter table interview_rounds enable row level security;
alter table interview_scorecards enable row level security;
alter table interview_submissions enable row level security;
alter table proctor_events enable row level security;

drop policy if exists "participants read their interviews" on interviews;
create policy "participants read their interviews" on interviews
  for select to authenticated
  using (candidate_id = auth.uid() or public.is_interview_staff(id) or public.is_admin());
drop policy if exists "alumni create interviews as themselves" on interviews;
create policy "alumni create interviews as themselves" on interviews
  for insert to authenticated with check (interviewer_id = auth.uid());
drop policy if exists "owners update their interviews" on interviews;
create policy "owners update their interviews" on interviews
  for update to authenticated using (interviewer_id = auth.uid()) with check (interviewer_id = auth.uid());
drop policy if exists "owners delete their interviews" on interviews;
create policy "owners delete their interviews" on interviews
  for delete to authenticated using (interviewer_id = auth.uid());

-- Candidates read rounds through the server, which strips the answer key.
drop policy if exists "staff read rounds" on interview_rounds;
create policy "staff read rounds" on interview_rounds
  for select to authenticated using (public.is_interview_staff(interview_id) or public.is_admin());
drop policy if exists "staff manage rounds" on interview_rounds;
create policy "staff manage rounds" on interview_rounds
  for all to authenticated using (public.is_interview_staff(interview_id)) with check (public.is_interview_staff(interview_id));

drop policy if exists "staff read scorecards" on interview_scorecards;
create policy "staff read scorecards" on interview_scorecards
  for select to authenticated
  using (exists (select 1 from interview_rounds r where r.id = round_id and (public.is_interview_staff(r.interview_id) or public.is_admin())));
drop policy if exists "reviewers write their scorecards" on interview_scorecards;
create policy "reviewers write their scorecards" on interview_scorecards
  for all to authenticated
  using (reviewer_id = auth.uid())
  with check (reviewer_id = auth.uid() and exists (select 1 from interview_rounds r where r.id = round_id and public.is_interview_staff(r.interview_id)));

drop policy if exists "candidate and staff read submissions" on interview_submissions;
create policy "candidate and staff read submissions" on interview_submissions
  for select to authenticated
  using (candidate_id = auth.uid()
         or exists (select 1 from interview_rounds r where r.id = round_id and (public.is_interview_staff(r.interview_id) or public.is_admin())));
drop policy if exists "candidates write their submissions" on interview_submissions;
create policy "candidates write their submissions" on interview_submissions
  for all to authenticated
  using (candidate_id = auth.uid() and submitted_at is null)
  with check (candidate_id = auth.uid() and exists (
    select 1 from interview_rounds r where r.id = round_id and public.is_interview_candidate(r.interview_id)));

drop policy if exists "candidate and staff read proctor events" on proctor_events;
create policy "candidate and staff read proctor events" on proctor_events
  for select to authenticated
  using (candidate_id = auth.uid() or public.is_interview_staff(interview_id) or public.is_admin());
drop policy if exists "candidates log their own proctor events" on proctor_events;
create policy "candidates log their own proctor events" on proctor_events
  for insert to authenticated
  with check (candidate_id = auth.uid() and public.is_interview_candidate(interview_id));

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

-- The full list from 0006 plus the interview types.
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check check (type in (
  'post_like', 'post_comment', 'mention', 'repost',
  'connection_request', 'connection_accepted',
  'request_received', 'request_responded',
  'endorsement', 'profile_view',
  'interview_scheduled', 'interview_response', 'interview_result'));

-- Security definer, like 0006: these write rows the acting member may not insert.

create or replace function public.notify_interview() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into notifications (user_id, actor_id, type, data)
    values (new.candidate_id, new.interviewer_id, 'interview_scheduled',
            jsonb_build_object('interview_id', new.id, 'title', new.title, 'company', new.company));
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.decision_released_at is not null and old.decision_released_at is null then
      insert into notifications (user_id, actor_id, type, data)
      values (new.candidate_id, new.interviewer_id, 'interview_result',
              jsonb_build_object('interview_id', new.id, 'title', new.title, 'decision', new.decision));
    end if;
    return new;
  end if;
  -- A deleted pipeline takes its notifications with it.
  delete from notifications where data->>'interview_id' = old.id::text;
  return old;
end $$;

drop trigger if exists interviews_notify on interviews;
create trigger interviews_notify after insert or update or delete on interviews
  for each row execute function public.notify_interview();

create or replace function public.notify_interview_round() returns trigger
language plpgsql security definer set search_path = public as $$
declare iv interviews%rowtype;
begin
  select * into iv from interviews where id = new.interview_id;
  if iv.id is null then return new; end if;

  if tg_op = 'INSERT' then
    -- The rounds created with the pipeline are covered by its own notification.
    if iv.created_at < now() - interval '1 minute' then
      insert into notifications (user_id, actor_id, type, data)
      values (iv.candidate_id, iv.interviewer_id, 'interview_scheduled',
              jsonb_build_object('interview_id', iv.id, 'round_id', new.id, 'title', iv.title,
                                 'round_title', new.title, 'scheduled_at', new.scheduled_at));
    end if;
    return new;
  end if;

  if new.scheduled_at is distinct from old.scheduled_at and new.status = 'scheduled' then
    insert into notifications (user_id, actor_id, type, data)
    values (iv.candidate_id, new.interviewer_id, 'interview_scheduled',
            jsonb_build_object('interview_id', iv.id, 'round_id', new.id, 'title', iv.title,
                               'round_title', new.title, 'scheduled_at', new.scheduled_at, 'rescheduled', true));
  end if;

  if new.candidate_response is distinct from old.candidate_response and new.candidate_response <> 'pending' then
    insert into notifications (user_id, actor_id, type, data)
    values (new.interviewer_id, iv.candidate_id, 'interview_response',
            jsonb_build_object('interview_id', iv.id, 'round_id', new.id, 'title', iv.title,
                               'round_title', new.title, 'response', new.candidate_response));
  end if;

  if new.released_at is not null and old.released_at is null then
    insert into notifications (user_id, actor_id, type, data)
    values (iv.candidate_id, new.interviewer_id, 'interview_result',
            jsonb_build_object('interview_id', iv.id, 'round_id', new.id, 'title', iv.title,
                               'round_title', new.title, 'outcome', new.outcome));
  end if;
  return new;
end $$;

drop trigger if exists interview_rounds_notify on interview_rounds;
create trigger interview_rounds_notify after insert or update on interview_rounds
  for each row execute function public.notify_interview_round();

revoke all on function public.notify_interview() from public;
revoke all on function public.notify_interview_round() from public;
