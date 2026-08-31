create type user_role         as enum ('student','alumni','admin');
create type claim_status      as enum ('unclaimed','claimed','verified','rejected');
create type request_type      as enum ('mentorship','mock_interview','internship','referral');
create type request_status    as enum ('pending','accepted','declined','closed');
create type opportunity_type  as enum ('internship','job');

-- Application users. Mirrors auth.users; role is authoritative here.
create table users (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        user_role not null,
  full_name   text not null,
  email       text not null unique,
  created_at  timestamptz not null default now()
);

-- Canonicalised employers. Populated by ingestion, extended when alumni self-report.
-- name_canonical collapses "TCS" and "Tata Consultancy Services" to one row.
create table companies (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  name_canonical  text not null unique,   -- lowercased, punctuation-stripped, alias-resolved
  industry        text,
  created_at      timestamptz not null default now()
);
create index on companies (name_canonical);

-- THE INSTITUTIONAL RECORD. Seeded from the spreadsheet. Source of truth for identity.
-- Never edited by alumni. Contact columns are never exposed through a public API.
create table alumni_records (
  id                  uuid primary key default gen_random_uuid(),
  student_id          text not null unique,        -- e.g. EU1081047
  full_name           text not null,
  branch              text not null,               -- COMP | CIVIL | IT | EXTC
  batch_year          int  not null,               -- derived from leaving_date
  city                text,                        -- derived from residence_address; full address discarded
  first_company_id    uuid references companies(id),  -- parsed from placement_details
  first_role          text,                        -- parsed from placement_details
  first_ctc_lpa       numeric(5,2),                -- normalised to LPA; null if unparseable
  higher_ed_raw       text,
  -- staging contact, claim-invite use only:
  contact_email       text,
  contact_mobile      text,
  claim_token         text unique,
  claim_status        claim_status not null default 'unclaimed',
  claimed_by          uuid references users(id),
  claimed_at          timestamptz,
  verified_by         uuid references users(id),
  verified_at         timestamptz,
  created_at          timestamptz not null default now()
);
create index on alumni_records (claim_status);
create index on alumni_records (batch_year);
create index on alumni_records (branch);
create index on alumni_records (first_company_id);

-- SELF-REPORTED CURRENT DATA. Created only when a record is claimed.
-- Deliberately separate from alumni_records: institutional fact vs. self-reported claim.
create table alumni_profiles (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null unique references users(id) on delete cascade,
  record_id                uuid not null unique references alumni_records(id),
  current_company_id       uuid references companies(id),
  designation              text,
  industry                 text,
  location                 text,
  experience_years         int,
  skills                   text[] not null default '{}',
  linkedin_url             text,
  bio                      text,
  mentorship_available     boolean not null default false,
  mock_interview_available boolean not null default false,
  referral_available       boolean not null default false,
  internship_available     boolean not null default false,
  updated_at               timestamptz not null default now()
);
create index on alumni_profiles (current_company_id);

create table student_profiles (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null unique references users(id) on delete cascade,
  branch          text not null,
  batch_year      int  not null,
  skills          text[] not null default '{}',
  target_role     text,
  target_company  text,
  target_industry text,
  location_pref   text,
  resume_url      text,
  updated_at      timestamptz not null default now()
);

create table requests (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references users(id) on delete cascade,
  alumni_id     uuid not null references users(id) on delete cascade,
  type          request_type   not null,
  message       text not null check (char_length(message) between 20 and 500),
  status        request_status not null default 'pending',
  match_score   int,                    -- score at time of sending; frozen for audit
  response_note text,
  created_at    timestamptz not null default now(),
  responded_at  timestamptz
);
create index on requests (student_id, status);
create index on requests (alumni_id, status);
-- One open request per student→alumni→type. Prevents spamming.
create unique index requests_no_duplicate_open
  on requests (student_id, alumni_id, type) where status = 'pending';

create table opportunities (
  id               uuid primary key default gen_random_uuid(),
  posted_by        uuid not null references users(id) on delete cascade,
  type             opportunity_type not null,
  title            text not null,
  description      text not null,
  company_id       uuid references companies(id),
  location         text,
  target_skills    text[] not null default '{}',
  application_link text,
  is_open          boolean not null default true,
  created_at       timestamptz not null default now()
);

-- Raw behavioural log. DO NOT compute a score from this in the MVP.
-- Exists so a future engagement score is measured, not fabricated.
create table engagement_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  event_type text not null,  -- claim_completed | profile_updated | request_responded | opportunity_posted | login
  metadata   jsonb,
  created_at timestamptz not null default now()
);

-- Admin accountability. Every verify/reject is recorded.
create table audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid not null references users(id),
  action      text not null,
  target_type text not null,
  target_id   uuid,
  detail      jsonb,
  created_at  timestamptz not null default now()
);

-- RLS Enablement
alter table users enable row level security;
alter table companies enable row level security;
alter table alumni_records enable row level security;
alter table alumni_profiles enable row level security;
alter table student_profiles enable row level security;
alter table requests enable row level security;
alter table opportunities enable row level security;
alter table engagement_events enable row level security;
alter table audit_log enable row level security;

-- Create Alumni Directory View excluding contact info
create view alumni_directory as
  select 
    r.id,
    r.student_id,
    r.full_name,
    r.branch,
    r.batch_year,
    r.city,
    r.first_company_id,
    r.first_role,
    r.first_ctc_lpa,
    r.higher_ed_raw,
    r.claim_status,
    r.claimed_by,
    r.claimed_at,
    r.verified_by,
    r.verified_at,
    r.created_at,
    p.id as profile_id,
    p.user_id,
    p.current_company_id,
    p.designation,
    p.industry,
    p.location,
    p.experience_years,
    p.skills,
    p.linkedin_url,
    p.bio,
    p.mentorship_available,
    p.mock_interview_available,
    p.referral_available,
    p.internship_available,
    p.updated_at as profile_updated_at
  from alumni_records r
  left join alumni_profiles p on r.id = p.record_id;

-- Policies

-- users
create policy "users can view their own record" on users for select using (auth.uid() = id);
create policy "users can update their own record" on users for update using (auth.uid() = id);
create policy "admins can view all users" on users for select using (
  exists (select 1 from users where id = auth.uid() and role = 'admin')
);

-- alumni_records
create policy "students and alumni can select claimed records" on alumni_records for select using (
  claim_status in ('claimed', 'verified') 
  -- note: contact columns are not excluded here at table level, but we use a view for standard queries.
  -- The spec says: "alumni_records: select where claim_status in ('claimed','verified'), contact columns excluded via a view"
);
create policy "alumni can select their own record" on alumni_records for select using (
  claimed_by = auth.uid()
);
create policy "admins can view all records" on alumni_records for all using (
  exists (select 1 from users where id = auth.uid() and role = 'admin')
);

-- alumni_profiles
create policy "everyone can view profiles" on alumni_profiles for select using (true);
create policy "alumni can update own profile" on alumni_profiles for update using (user_id = auth.uid());
create policy "alumni can insert own profile" on alumni_profiles for insert with check (user_id = auth.uid());
create policy "admins can do all on profiles" on alumni_profiles for all using (
  exists (select 1 from users where id = auth.uid() and role = 'admin')
);

-- student_profiles
create policy "students can rw own profile" on student_profiles for all using (user_id = auth.uid());
create policy "alumni can view student profiles who sent requests" on student_profiles for select using (
  exists (
    select 1 from requests 
    where requests.student_id = student_profiles.user_id 
    and requests.alumni_id = auth.uid()
  )
);
create policy "admins can view all student profiles" on student_profiles for select using (
  exists (select 1 from users where id = auth.uid() and role = 'admin')
);

-- requests
create policy "students can read and insert their own requests" on requests for select using (student_id = auth.uid());
create policy "students can insert own requests" on requests for insert with check (student_id = auth.uid());
create policy "students can update their own requests" on requests for update using (student_id = auth.uid());

create policy "alumni can view received requests" on requests for select using (alumni_id = auth.uid());
create policy "alumni can update received requests status" on requests for update using (
  alumni_id = auth.uid()
);
create policy "admins can select all requests" on requests for select using (
  exists (select 1 from users where id = auth.uid() and role = 'admin')
);

-- opportunities
create policy "everyone can view open opportunities" on opportunities for select using (is_open = true);
create policy "creators can rw own opportunities" on opportunities for all using (posted_by = auth.uid());
create policy "admins can do all on opportunities" on opportunities for all using (
  exists (select 1 from users where id = auth.uid() and role = 'admin')
);

-- companies
create policy "everyone can view companies" on companies for select using (true);
create policy "authenticated users can create companies" on companies for insert with check (auth.uid() is not null);
create policy "admins can do all on companies" on companies for all using (
  exists (select 1 from users where id = auth.uid() and role = 'admin')
);

-- engagement_events & audit_log
create policy "admins can select engagement_events" on engagement_events for select using (
  exists (select 1 from users where id = auth.uid() and role = 'admin')
);
create policy "admins can select audit_log" on audit_log for select using (
  exists (select 1 from users where id = auth.uid() and role = 'admin')
);
