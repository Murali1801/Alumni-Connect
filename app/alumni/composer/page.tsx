import { redirect } from 'next/navigation';

/**
 * The posting composer is the create form itself — a separate "compose then
 * copy into a form" step would only add a transcription error.
 */
export default function AlumniComposerPage() {
  redirect('/alumni/opportunities/new');
}
