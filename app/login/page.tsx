import { redirect } from 'next/navigation';

/** `/login` is kept as an alias — the sign-in form lives at the root. */
export default function LoginRedirect() {
  redirect('/');
}
