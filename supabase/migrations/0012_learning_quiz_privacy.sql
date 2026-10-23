-- Quiz answer keys must not be readable by learners.
--
-- 0010 lets signed-in members read the lessons of courses they can see, and
-- `course_lessons.quiz` holds each question's correct option. The app reads
-- lessons with the service key and strips the answers, but a member calling
-- the API directly with their own session could read them. Column privileges
-- close that: members may read every lesson column except `quiz`. The service
-- role (the app) is unaffected; writes keep their existing grants and policies.

revoke select on course_lessons from anon, authenticated;
grant select (id, module_id, course_id, title, kind, position, body, url, duration_min, created_at, updated_at)
  on course_lessons to authenticated;
