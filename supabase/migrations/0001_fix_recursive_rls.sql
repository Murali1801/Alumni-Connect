-- Fixes infinite recursion in the row level security policies.
--
-- The admin policies were written as a subquery against `users`:
--
--   create policy "admins can view all users" on users for select using (
--     exists (select 1 from users where id = auth.uid() and role = 'admin')
--   );
--
-- Evaluating that policy requires selecting from `users`, which evaluates the
-- policy again. Postgres detects the cycle and aborts, so ANY anon or
-- authenticated read that touches `users` — directly or through a policy on
-- another table that references it — fails with:
--
--   infinite recursion detected in policy for relation "users"
--
-- The symptom was that every alumni claim link reported "Invalid Claim Link",
-- because looking a record up by its token evaluated the recursive policy.
--
-- The fix is a SECURITY DEFINER function. It runs as its owner, which bypasses
-- RLS for the lookup inside it, so asking "is the caller an admin?" no longer
-- re-enters the policy. Marked STABLE so the planner can cache it per statement.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon;

-- Replace every self-referential policy with one that calls the function.

drop policy if exists "admins can view all users" on users;
create policy "admins can view all users" on users
  for select using (public.is_admin());

drop policy if exists "admins can view all records" on alumni_records;
create policy "admins can view all records" on alumni_records
  for all using (public.is_admin());

drop policy if exists "admins can do all on profiles" on alumni_profiles;
create policy "admins can do all on profiles" on alumni_profiles
  for all using (public.is_admin());

drop policy if exists "admins can view all student profiles" on student_profiles;
create policy "admins can view all student profiles" on student_profiles
  for select using (public.is_admin());

drop policy if exists "admins can select all requests" on requests;
create policy "admins can select all requests" on requests
  for select using (public.is_admin());

drop policy if exists "admins can do all on opportunities" on opportunities;
create policy "admins can do all on opportunities" on opportunities
  for all using (public.is_admin());

drop policy if exists "admins can do all on companies" on companies;
create policy "admins can do all on companies" on companies
  for all using (public.is_admin());

drop policy if exists "admins can select engagement_events" on engagement_events;
create policy "admins can select engagement_events" on engagement_events
  for select using (public.is_admin());

drop policy if exists "admins can select audit_log" on audit_log;
create policy "admins can select audit_log" on audit_log
  for select using (public.is_admin());

-- The original select policy on alumni_records has no restriction on which
-- columns come back, so a claimed record would expose contact_email,
-- contact_mobile and claim_token to any signed-in user. Application code never
-- selects them, but the policy should not permit it either. Narrow the grant to
-- the columns that are safe to read.

revoke select on alumni_records from authenticated;
grant select (
  id, student_id, full_name, branch, batch_year, city,
  first_company_id, first_role, first_ctc_lpa, higher_ed_raw,
  claim_status, claimed_by, claimed_at, verified_by, verified_at, created_at
) on alumni_records to authenticated;
