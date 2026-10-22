-- Remove the LinkedIn import: the posts and the network feed (0003) and the
-- imported profile history (0002). The plain linkedin_url link on a profile,
-- part of the original schema, stays.
--
-- This deletes data permanently: every imported post, and the headline,
-- websites, positions, education, certifications and projects on every alumni
-- profile. Apply it after the code that no longer reads these is deployed.

-- 0003: the feed view first, since it reads alumni_posts.
drop view if exists alumni_feed;
drop table if exists alumni_posts;  -- its policies and indexes go with it
drop function if exists public.is_verified_alumnus(uuid);  -- used only by the posts policy

-- 0002: the directory view selects the imported columns, so it is recreated
-- with the column list it had before 0002 (as in 0000_initial_schema.sql).
drop view if exists alumni_directory;
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

alter table alumni_profiles
  drop column if exists headline,
  drop column if exists websites,
  drop column if exists positions,
  drop column if exists education,
  drop column if exists certifications,
  drop column if exists projects,
  drop column if exists profile_source,
  drop column if exists linkedin_imported_at;  -- its index goes with it
