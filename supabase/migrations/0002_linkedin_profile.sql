-- Richer alumni profiles, filled from the alumnus' own LinkedIn data export.
--
-- The alumnus downloads "Get a copy of your data" from LinkedIn and uploads the
-- zip on /alumni/profile/import. The zip is read in their browser; only the
-- fields they approve on the review screen are sent here. Messages,
-- connections, contact details and birth date in the archive are never read.
--
-- History lives as jsonb arrays on the profile rather than child tables: it is
-- always read and written whole, by its owner, so it inherits the existing
-- alumni_profiles row level security with no new policies to get wrong.
--
-- Item shapes (dates are 'YYYY' or 'YYYY-MM'; a null `end` means current):
--   positions       { company, title, location, description, start, end }
--   education       { school, degree, notes, start, end }
--   certifications  { name, authority, url, start, end }
--   projects        { title, description, url, start, end }

alter table alumni_profiles
  add column headline              text check (char_length(headline) <= 220),
  add column websites              text[] not null default '{}',
  add column positions             jsonb  not null default '[]'
    check (jsonb_typeof(positions) = 'array' and jsonb_array_length(positions) <= 40),
  add column education             jsonb  not null default '[]'
    check (jsonb_typeof(education) = 'array' and jsonb_array_length(education) <= 20),
  add column certifications        jsonb  not null default '[]'
    check (jsonb_typeof(certifications) = 'array' and jsonb_array_length(certifications) <= 50),
  add column projects              jsonb  not null default '[]'
    check (jsonb_typeof(projects) = 'array' and jsonb_array_length(projects) <= 30),
  add column profile_source        text   not null default 'manual'
    check (profile_source in ('manual', 'linkedin_export')),
  add column linkedin_imported_at  timestamptz;

-- Freshness reporting: "how many profiles were imported or refreshed recently".
create index on alumni_profiles (linkedin_imported_at);

-- Keep the directory view in step. New columns go on the end, which is the only
-- change `create or replace view` allows.
create or replace view alumni_directory as
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
    p.updated_at as profile_updated_at,
    p.headline,
    p.websites,
    p.positions,
    p.education,
    p.certifications,
    p.projects,
    p.profile_source,
    p.linkedin_imported_at
  from alumni_records r
  left join alumni_profiles p on r.id = p.record_id;
