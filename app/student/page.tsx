import { redirect } from 'next/navigation';

/** The old dashboard: Home replaced it, so old links and bookmarks land there. */
export default function StudentDashboardRedirect() {
  redirect('/student/home');
}
