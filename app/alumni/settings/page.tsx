import { redirect } from 'next/navigation';

/** Alumni settings are the profile — one place to change what students see. */
export default function AlumniSettingsPage() {
  redirect('/alumni/profile');
}
