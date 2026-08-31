# AlumniLink — Build Specification

**Target agent:** Google Antigravity (Agent Manager)
**Project type:** BE Final Year Major Project — working MVP
**Hard deadline:** demo on 11 September 2026
**Companion file:** `DESIGN_SYSTEM.md` — read it before writing any UI. It is not optional styling advice; it is part of this spec.

---

## HOW TO USE THIS FILE IN ANTIGRAVITY

1. Create an empty project folder. Put this file and `DESIGN_SYSTEM.md` at the repo root.
2. Also place the raw data file at `data/Alumni_Details_Till_March_2024.xlsx`.
3. Open Antigravity → Agent Manager → new task.
4. Paste the kickoff prompt below.

### Kickoff prompt (copy this into Antigravity)

> Read `ANTIGRAVITY_BUILD_PROMPT.md` and `DESIGN_SYSTEM.md` at the repo root in full before doing anything else.
>
> Then produce an implementation plan artifact covering Phase 0 through Phase 6 as defined in the spec. Do not write code until I approve the plan.
>
> Constraints you must respect: build only what section "SCOPE — WHAT TO BUILD" lists. Do not build anything in "SCOPE — DO NOT BUILD", even if it seems easy or you have spare capacity. Follow `DESIGN_SYSTEM.md` exactly — do not substitute your own colours, fonts, or component patterns. After each phase, use the browser tool to verify the acceptance criteria for that phase and report which ones pass.
>
> Start with the plan.

After plan approval, drive it phase by phase: `Implement Phase 1. Verify against its acceptance criteria in the browser before reporting done.`

---

## 1. CONTEXT — READ THIS FIRST, IT DETERMINES THE ARCHITECTURE

An engineering college has an alumni spreadsheet. It contains 4,024 rows. After removing 211 exact-duplicate rows and collapsing 21 further rows that share a `student_id`, **3,792 unique alumni** remain, spanning graduation years 2013–2024 across four branches.

**The spreadsheet contains no current employment data at all.** Its 15 columns are:

```
student_id, student_name, branch, status, ldap, leaving_date,
residence_address, landline, mobile1, mobile2, personal_email,
father_mobile, mother_mobile, placement_details, higher_education_details
```

There is no column for current company, designation, industry, skills, experience, location, or LinkedIn. The only employment-adjacent field is `placement_details`, which records the job taken *at graduation* — for a 2013 graduate that is thirteen years stale. It is free text, present on only 1,604 rows (40%), and formatted inconsistently:

```
Infosys-Trainee Software Engg-3.25
Commutree Techinfotech Ltd.-Software Engg-300000
Clover Infotech-PL/SQl Developer-3LPA
Available for Placement--
-----
```

**Therefore the central product insight, which every architectural decision must serve:**

> This is not a matching platform with a data import step. It is a **data-activation platform** whose matching engine switches on as records get claimed. On day one, every alumni record is dormant. Matching has nothing to match on until alumni claim their record and add five fields: current company, designation, industry, skills, availability.

The UI must make dormancy visible rather than hiding it behind fake data. See `DESIGN_SYSTEM.md` → "The ghost-to-live thesis".

### Verified data facts (use these; do not invent numbers)

| Fact | Value |
|---|---|
| Raw rows | 4,024 |
| After exact-duplicate removal | 3,813 |
| Unique `student_id` | 3,792 |
| Branches | COMP 1,481 · CIVIL 832 · IT 798 · EXTC 681 |
| Graduation years | 2013–2024 |
| Year counts | 2013:257 2014:303 2015:305 2016:485 2017:442 2018:297 2019:334 2020:7 2021:719 2022:361 2023:280 2024:2 |
| `mobile1` usable | 3,831 of 4,024 raw (193 are the literal value `0`) |
| `personal_email` present | 3,419 raw (~85%) |
| `placement_details` present | 1,604 raw (40%), ~1,148 yield a parseable company |
| Top parsed employers | TCS 52 · Capgemini 27 · Infosys 26 · Majesco 23 · LTI 22 · Accenture 12 |
| Deloitte / Microsoft / Google in data | **0 each.** Amazon: 3 |

The 2020 gap (7 records) and 2021 spike (719) are a real data-entry artefact. Do not smooth or correct it. Surface it — it is honest and it is interesting.

---

## 2. HARD CONSTRAINTS

| Constraint | Rule |
|---|---|
| Timeline | 11 build days. Phases are ordered by demo value. If time runs out, later phases are dropped, never earlier ones. |
| Scope | Build exactly what section 3 lists. Nothing else. |
| Data privacy | `father_mobile`, `mother_mobile`, `landline`, `mobile2`, and full `residence_address` **must never enter the application database**. Drop them during ingestion. This is a legal requirement (DPDP Act 2023), not a preference. |
| Contact data | `mobile1` and `personal_email` go into a staging table used **only** to generate claim links. They are never returned by any API a student or another alumnus can call. |
| Honesty | No fabricated alumni. No seeded "Deloitte" or "Microsoft" profiles. Demo data must be either real claimed profiles or clearly-labelled synthetic ones drawn from the actual company distribution above. |
| Design | `DESIGN_SYSTEM.md` is binding. Do not introduce colours, fonts, radii, or shadows it does not define. |

---

## 3. SCOPE

### WHAT TO BUILD

1. Offline ingestion pipeline (Python) → clean seed data
2. Auth with three roles: student, alumni, admin
3. Alumni claim-by-token flow
4. Alumni profile (self-reported current employment + availability)
5. Student profile (skills, target role, target company)
6. Alumni directory with search + filters, showing dormant and live records
7. Deterministic weighted matching with a visible per-signal score breakdown
8. Structured requests: 4 types, send / accept / decline / close
9. T&P dashboard: network liveness, company clusters, request activity, verification queue
10. Opportunities: alumni or admin post an internship/job; students browse — **Phase 6, stretch only**

### DO NOT BUILD

Do not build these even if asked mid-session, even if they look trivial:

- Career readiness score
- Alumni engagement score (log `engagement_events` rows only — never compute a score)
- Real-time chat, messaging threads, video
- Email or push notifications (in-app badge counts only)
- Events, reunions, social feed, achievements, announcements
- LinkedIn OAuth or scraping
- Embedding / LLM / semantic matching
- Native mobile apps, PWA offline mode, service workers
- Payments, file storage beyond a resume URL text field
- Admin self-registration — admin accounts are seeded only
- Dark mode toggle

---

## 4. STACK

Pin these. Do not substitute.

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router), TypeScript strict | Single deployable, server components for data pages |
| Styling | Tailwind CSS v4 | Tokens defined in `app/globals.css` per `DESIGN_SYSTEM.md` |
| UI primitives | shadcn/ui, restyled to the design tokens | Only these components: button, input, select, badge, card, dialog, table, tabs, textarea, avatar, sheet, sonner |
| Charts | Recharts | Dashboard only |
| Icons | lucide-react | |
| DB + Auth | Supabase (Postgres + Supabase Auth, magic link) | One vendor, one dashboard, one set of keys. Magic links are exactly the primitive the claim flow needs. |
| Validation | zod on every API route | |
| Ingestion | Python 3 + pandas + openpyxl, run once offline | Not part of the Next.js app |
| Deploy | Vercel | |

**Do not use Clerk, Prisma, Drizzle, NextAuth, tRPC, Redux, or a component library other than shadcn/ui.**

### Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=      # server-only, never imported into a client component
NEXT_PUBLIC_APP_URL=
```

Commit `.env.local.example` with these keys blank. Never commit `.env.local`.

---

## 5. DATA MODEL

Run as a Supabase migration. Comments explain design decisions — keep them, they are report material.

```sql
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
```

### Row-Level Security

Enable RLS on every table. Policies:

| Table | student | alumni | admin |
|---|---|---|---|
| `users` | own row | own row | all |
| `alumni_records` | select where `claim_status in ('claimed','verified')`, **contact columns excluded via a view** | own record | all |
| `alumni_profiles` | select all | select all, update own | all |
| `student_profiles` | own row rw | select only rows of students who sent them a request | all |
| `requests` | own rows rw | rows where `alumni_id = auth.uid()`, update status only | all select |
| `opportunities` | select where `is_open` | select all, insert/update own | all |
| `companies` | select | select | all |
| `engagement_events`, `audit_log` | none | none | select |

Create and expose a view `alumni_directory` that selects from `alumni_records` joined to `alumni_profiles` **with `contact_email`, `contact_mobile`, and `claim_token` omitted at the SQL level.** All student-facing directory queries hit this view, never the base table. This is the enforcement point — do not rely on `select` column lists in application code.

---

## 6. PHASE 0 — INGESTION PIPELINE (build this first)

Write `scripts/ingest.py`. It runs once, offline, and outputs seed files. It must not be part of the Next.js runtime.

### Steps

1. Read `data/Alumni_Details_Till_March_2024.xlsx`.
2. Drop exact duplicate rows → expect 3,813.
3. Deduplicate on `student_id`, keeping the row with the most non-null, non-placeholder values → expect **3,792**.
4. **Drop columns `father_mobile`, `mother_mobile`, `landline`, `mobile2`, `ldap`, `status`.**
5. Normalise placeholders: the literal values `0`, `--`, `-----`, `na`, `n/a`, `nil`, `NA` become NULL across all fields.
6. `batch_year` = year part of `leaving_date`.
7. `city`: from `residence_address`, take the second-to-last comma-delimited segment (the addresses end `...,<locality>,<pincode>`). Title-case it. **Discard the full address string.**
8. Validate `personal_email` against a standard regex → `contact_email`. Correct the obvious typo domain `gamil.com` → `gmail.com` (11 rows) and log the correction count.
9. `contact_mobile`: keep only values matching `^[6-9]\d{9}$`.
10. **Parse `placement_details`** on the `-` delimiter into (company, role, ctc):
    - Split on `-`. First segment = company, second = role, third = CTC.
    - Reject as non-companies (case-insensitive): `available for placement`, `available for placements`, `not placed`, `na`, `nil`, empty, single characters.
    - CTC normalisation to LPA: `3.25` → 3.25 · `3LPA` / `3 lakhs` / `3.7LPA` → 3.7 · `300000` → 3.0 (divide by 100000 when value > 1000). Null if unparseable.
    - Emit a parse-report: rows attempted, rows yielding a company, rows yielding a role, rows yielding a CTC.
11. **Canonicalise company names.** Build `name_canonical` = lowercase, strip punctuation, strip legal suffixes (`pvt`, `ltd`, `limited`, `private`, `inc`, `llp`, `technologies`, `solutions` only when trailing). Then apply an explicit alias map — at minimum:
    ```
    tcs                     -> Tata Consultancy Services
    tata consultancy        -> Tata Consultancy Services
    lti                     -> L&T Infotech
    l&t infotech            -> L&T Infotech
    larsen and toubro infotech -> L&T Infotech
    capg                    -> Capgemini
    capgemini               -> Capgemini
    cts / cognizant         -> Cognizant
    ```
    Emit a before/after count: distinct raw company strings vs. distinct canonical companies. **This number goes in the report and on a demo slide.**
12. Generate a `claim_token` per record: a 32-char URL-safe random string. Unique.
13. Output:
    - `seed/companies.csv`
    - `seed/alumni_records.csv`
    - `seed/ingest_report.json` — every count from steps 2, 8, 10, 11, plus branch and year distributions
14. Write `scripts/seed.ts` (or a `psql \copy` script) that loads both CSVs into Supabase.

### Phase 0 acceptance criteria

- [ ] `alumni_records` contains exactly 3,792 rows
- [ ] No column in the database contains a parent's phone number or a full street address
- [ ] `ingest_report.json` reports distinct-companies before and after canonicalisation
- [ ] `select count(*) from alumni_records where first_company_id is not null` returns roughly 1,100–1,200
- [ ] Every record has a unique non-null `claim_token`
- [ ] All 3,792 records have `claim_status = 'unclaimed'`

---

## 7. ROUTE MAP

### Pages

```
/                              Public landing. Live network stats. Two CTAs: student sign-in, alumni claim.
/claim/[token]                 Public. Claim landing — identity confirmation.
/sign-in                       Magic-link sign-in.
/onboarding                    Post-signup role routing. Students only; alumni arrive via claim.

/student                       Dashboard: top matches, request status, opportunities
/student/profile               Career profile form
/student/directory             Alumni directory: search, filters, cohort spine
/student/directory/[id]        Alumni detail + score breakdown + request CTA
/student/requests              Sent requests with status
/student/opportunities         Opportunity feed                                  [Phase 6]

/alumni                        Dashboard: incoming requests, profile completeness
/alumni/profile                Current employment + availability toggles
/alumni/requests               Inbox: accept / decline / close
/alumni/opportunities/new      Post an opportunity                               [Phase 6]

/admin                         T&P dashboard
/admin/directory               Full alumni table, filters, CSV export
/admin/verification            Verification queue
/admin/requests                All requests, filterable
/admin/companies               Company cluster table
```

### API routes

All routes: zod-validate the body, check the session role, return typed JSON, never leak contact columns.

```
GET    /api/me
POST   /api/onboarding                    student self-registration only

GET    /api/claim/[token]                 returns masked record for confirmation
POST   /api/claim/[token]/confirm         binds record → user, sets claim_status='claimed'

GET    /api/profile/student
PUT    /api/profile/student
GET    /api/profile/alumni
PUT    /api/profile/alumni

GET    /api/directory                     ?q&branch&batch&company&availability&sort=match|batch|name
GET    /api/directory/[id]

POST   /api/requests                      { alumniId, type, message }
GET    /api/requests                      role-scoped
PATCH  /api/requests/[id]                 { status, responseNote }

GET    /api/companies
GET    /api/companies/[id]/alumni

GET    /api/admin/stats
GET    /api/admin/verification            claim_status='claimed'
PATCH  /api/admin/verification/[id]       { action: 'verify' | 'reject', note }
GET    /api/admin/export                  CSV, admin only

GET    /api/opportunities                                                        [Phase 6]
POST   /api/opportunities                                                        [Phase 6]
```

---

## 8. MATCHING ALGORITHM

Create `lib/matching.ts`. Pure functions, no I/O, no external calls. Unit-test it.

```ts
export type MatchSignal = {
  key: 'company' | 'role' | 'skills' | 'availability' | 'location';
  label: string;
  weight: number;
  raw: number;        // 0..1
  contribution: number; // raw * weight * 100, rounded
  detail: string;     // human-readable, shown in the UI
};

export type MatchResult = {
  score: number;          // 0..100
  signals: MatchSignal[];
  matchable: boolean;     // false when the alumnus has no claimed profile
  fallbackReason?: string;
};

const WEIGHTS = {
  company: 0.35,
  role: 0.25,
  skills: 0.20,
  availability: 0.15,
  location: 0.05,
} as const;

// Jaccard over normalised skill tags.
function skillOverlap(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const A = new Set(a.map(s => s.trim().toLowerCase()));
  const B = new Set(b.map(s => s.trim().toLowerCase()));
  let inter = 0;
  A.forEach(s => { if (B.has(s)) inter++; });
  return inter / (A.size + B.size - inter);
}

// Token overlap between target role and (designation + industry).
function roleOverlap(target: string | null, designation: string | null, industry: string | null): number {
  if (!target) return 0;
  const stop = new Set(['a','an','the','of','and','engineer','executive','senior','junior','associate']);
  const t = target.toLowerCase().split(/\W+/).filter(w => w.length > 2 && !stop.has(w));
  const d = `${designation ?? ''} ${industry ?? ''}`.toLowerCase();
  if (!t.length) return 0;
  return t.filter(w => d.includes(w)).length / t.length;
}
```

`scoreMatch(student, alumnus, requestType)` returns:

- **company** — 1.0 if `student.target_company` canonicalises to `alumnus.current_company_id`; 0.5 if it matches the alumnus's *first* company (`alumni_records.first_company_id`) but not their current one; else 0. The 0.5 tier matters: for a 2013 graduate whose only employer data is their graduation job, this is the sole company signal available. Detail string must say which tier fired.
- **role** — `roleOverlap(target_role, designation, industry)`
- **skills** — `skillOverlap(student.skills, alumnus.skills)`
- **availability** — 1.0 if the alumnus has the flag matching `requestType` set, else 0
- **location** — 1.0 if `student.location_pref` equals `alumnus.location` (case-insensitive), else 0

### Dormant-record fallback — required

If the alumnus has **no** `alumni_profiles` row (unclaimed record), return:

```
matchable: false,
score: <cohort proximity score>,
fallbackReason: "This alumnus hasn't claimed their profile yet. Ranking uses branch and batch only."
```

Cohort proximity = `0.6 * (branch === student.branch ? 1 : 0) + 0.4 * max(0, 1 - |batchYear - studentBatch| / 10)`, scaled to 0–100 and **capped at 40** so a dormant record can never outrank a claimed one.

This fallback is the reason the product works on day one. Do not skip it.

### Sorting rule

Default directory sort: claimed profiles by descending score first, then dormant records by descending fallback score. Never interleave them.

### Unit tests (required — `lib/matching.test.ts`)

- Perfect match on all five signals → 100
- Zero overlap → 0
- Weights sum to exactly 1.0
- Current-company match scores strictly higher than first-company-only match
- Dormant record never exceeds 40
- `signals[].contribution` sums to `score` (±1 for rounding)

---

## 9. PAGE SPECIFICATIONS

Every page: loading skeleton, empty state with a next action, error state that says what failed. Every page responsive to 375px.

### `/` — Landing

Purpose: make the data problem visible in five seconds, then route the visitor.

- Hero: the network-liveness figure, live from the DB. `142 / 3,792 alumni have claimed their profile.` Under it, the cohort spine (see design system) rendered with real per-year counts.
- One paragraph stating the problem in plain terms: records exist, current employment does not.
- Two actions: **Sign in as a student** · **Claim your alumni profile** (the latter explains that a claim link is sent by the T&P cell).
- Footer strip: four stat chips — 3,792 records · 4 branches · 2013–2024 · 1,148 employers parsed.

### `/claim/[token]` — Alumni claim

The single highest-value screen. It must feel trustworthy and take under two minutes.

**Step 1 — Confirm identity.** Show the masked institutional record: full name, branch, batch year, and `student_id` masked as `EU10•••047`. Ask: "Is this you?" Confirm / Not me.
- Invalid or already-claimed token → a clear terminal state, not a 404.

**Step 2 — Sign in.** Magic link to the email on the record, or an alternate email if the alumnus enters one (log the change to `audit_log`).

**Step 3 — Five fields.** One screen, no wizard: current company (combobox against `companies`, free-text create allowed), designation, industry (select), skills (tag input, min 3), location. Progress affordance: "Step 3 of 4".

**Step 4 — Availability.** Four toggles, each with a one-line description of what accepting means, and a visible reassurance: "You can decline any request. Declining is normal and is not shown to other students."

On completion: set `claim_status='claimed'`, insert `engagement_events` row, run the ghost→live transition animation on their own card, land on `/alumni`.

### `/student/directory` — Alumni directory

The main student surface.

- **Cohort spine** across the top: 12 bars, 2013–2024, height from real record counts, fill proportion showing claimed/total per year. Clicking a bar filters to that batch. This is the signature element — build it exactly as `DESIGN_SYSTEM.md` describes.
- Filter bar: search (name/company/skill), branch, batch range, company, availability type, sort.
- Results grid, 3-up desktop / 1-up mobile. Two card states:
  - **Live card** — full colour. Avatar initials, name, designation @ company, batch·branch, top 3 skill tags, availability badges, match score with a mini signal bar.
  - **Ghost card** — desaturated, dashed border, label "Profile not claimed yet". Shows only name, branch, batch, and first employer if known. No request button. Instead: "Ask T&P to invite" (records the interest; admin sees a count).
- Result header states the split honestly: `Showing 24 alumni — 9 with claimed profiles, 15 dormant records.`
- Empty state: "No alumni match these filters. Try widening the batch range."

### `/student/directory/[id]` — Alumni detail

- Header: name, designation @ company, batch·branch, availability badges, LinkedIn link if present.
- **Score breakdown panel** — the explainability payload. A stacked horizontal bar with the five signals, each labelled with its weight, raw value, contribution, and the detail string. Example row: `Company · 35% · matched Tata Consultancy Services · +35`. A muted line beneath: "This score is computed from the fields above using fixed weights. No machine learning model is involved."
- Journey strip: first role at graduation → current role, with the year gap. This is the one place the stale `placement_details` becomes an asset rather than a liability.
- Request CTA opens the request dialog. Disabled with an explanation if the alumnus has no matching availability flag.

### Request dialog

- Type selector: four options, each with a one-line description of what the alumnus is being asked to do.
- Message: textarea, 20–500 chars, live counter, with a type-specific placeholder (not a generic one).
- Below the button: "They can decline. That's fine — it isn't held against you."
- Submit → optimistic toast → row in `requests` with `match_score` frozen.
- Duplicate open request of the same type → inline error naming the existing request, not a generic failure.

### `/alumni/requests` — Alumni inbox

- Tabs: Pending · Accepted · Closed, with counts.
- Each card: student name, branch, batch, request type badge, message, target role, top skills, timestamp.
- Actions: Accept (optional note) · Decline (optional note, note not shown to student) · Close (on accepted items).
- Accepting reveals the student's contact email. Nothing more.
- Empty state: "No requests yet. Students find you through the directory — a complete profile with skills listed gets found more often." Link to profile.

### `/admin` — T&P dashboard

Exactly six cards. Resist adding more.

1. **Network liveness** — big number `claimed / 3,792`, percentage, and a bar. The headline metric.
2. **Claim rate by batch** — Recharts bar chart, 2013–2024, claimed vs. total. Shows the recent-batch skew, which is a real finding.
3. **Company clusters** — table of top 15 canonical companies by alumni count, with columns: company, alumni (from records), claimed, mentors available, referrers available. Sortable. Row click → `/admin/companies`.
4. **Request activity** — sent / accepted / declined / pending, plus response rate and median hours to first response.
5. **Verification queue** — count of `claim_status='claimed'` awaiting review, link to `/admin/verification`.
6. **Data quality** — records ingested, duplicates removed, employers parsed, distinct company strings before/after canonicalisation. Sourced from `ingest_report.json`. This card is what makes the demo land.

### `/admin/verification`

Table of claimed-but-unverified records. Each row expands to show institutional record beside self-reported profile, side by side, so the reviewer can compare. Verify / Reject with a required note on reject. Every action writes to `audit_log`.

---

## 10. BUILD PHASES

Each phase must be verified in the browser before moving on.

| Phase | Scope | Acceptance criteria |
|---|---|---|
| **0** | Ingestion + schema + seed | 3,792 rows loaded · no PII columns present · `ingest_report.json` written · RLS enabled on all tables |
| **1** | Auth, roles, layout shell, design tokens | Three roles sign in and land on the correct dashboard · a student hitting `/admin` gets 403, not a crash · tokens from `DESIGN_SYSTEM.md` applied in `globals.css` · landing page renders live counts |
| **2** | Claim flow end to end | A valid token completes all four steps · record flips to `claimed` · profile row created · invalid/used tokens show a clear terminal state · contact columns absent from every network response (verify in DevTools) |
| **3** | Profiles | Alumni can edit all fields and availability toggles · students can create and edit a career profile · zod rejects bad input with field-level messages |
| **4** | Directory + matching | Filters and search work against 3,792 rows in under 500ms · cohort spine renders and filters on click · ghost and live cards render distinctly · score breakdown panel shows five signals summing to the total · all `matching.test.ts` tests pass |
| **5** | Requests | Send, accept, decline, close all work · duplicate open request blocked with a named error · status visible to both sides · accepting reveals student email and nothing else |
| **6** | T&P dashboard + verification (+ opportunities if time) | Six cards render with real data · verification queue approves and rejects · every admin action appears in `audit_log` · CSV export works |

**If the schedule slips, cut Phase 6's opportunities module first, then the CSV export, then the claim-rate chart. Never cut Phase 4 or 5.**

---

## 11. DEMO DATA REQUIREMENTS

The demo needs live profiles that are not obviously fake.

1. Real claims are best. Send claim links to alumni the team knows personally — recent batches (2021–2023) respond most.
2. Backfill to **at least 12 claimed profiles** with synthetic data if needed, but:
   - draw companies from the real parsed distribution (TCS, Capgemini, Infosys, Majesco, LTI, Accenture, Persistent Systems, Reliance Jio, Wipro, Cognizant)
   - **never seed Deloitte, Microsoft, Google, or Amazon** — they are absent or near-absent from the real data and an examiner who opens the spreadsheet will notice
   - spread across all four branches and across batches 2015–2023
   - vary availability flags so the availability signal visibly changes scores
   - mark synthetic rows with `metadata: {"synthetic": true}` in an `engagement_events` row so they are auditable
3. Seed one admin account and three student accounts, one of which targets a company where several alumni exist so the demo match is strong.

---

## 12. TESTING CHECKLIST

- [ ] `lib/matching.ts` unit tests all pass
- [ ] A student session cannot reach any `/api/admin/*` route
- [ ] No API response anywhere contains `contact_email`, `contact_mobile`, or `claim_token` — check the Network tab on every page
- [ ] Request status transitions are enforced server-side: `pending → accepted | declined`, `accepted → closed`. Any other transition is rejected.
- [ ] A used claim token cannot be replayed
- [ ] Directory query on 3,792 rows returns in under 500ms
- [ ] Every page renders correctly at 375px
- [ ] Keyboard focus is visible on every interactive element
- [ ] `prefers-reduced-motion` disables the ghost→live transition

---

## 13. DELIVERABLES

```
/app                     Next.js App Router
/components              UI components, design-system compliant
/lib
  matching.ts            + matching.test.ts
  supabase/              server and browser clients
  validators/            zod schemas
/scripts
  ingest.py              Phase 0 pipeline
  seed.ts
/supabase/migrations     Schema + RLS
/seed                    Generated CSVs + ingest_report.json
/data                    Source spreadsheet (gitignored)
.env.local.example
README.md                Setup, ingestion run, seeding, deploy, known limitations
DESIGN_SYSTEM.md
ANTIGRAVITY_BUILD_PROMPT.md
```

`README.md` must include a **Known Limitations** section listing: no outcome tracking, no engagement score, no notifications, claim campaign limited to a pilot cohort, matching untested at production scale. Stating these is a mark-earner, not a weakness.
