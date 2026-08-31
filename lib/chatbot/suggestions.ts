import type { Role } from '@/lib/session';

/**
 * Starter questions offered when the help panel opens. Kept out of
 * `knowledge.ts` because that module is server-only and this list is rendered
 * by the client widget.
 */
export const SUGGESTED_QUESTIONS: Record<Role, string[]> = {
  student: [
    'Why are my match scores low?',
    'What can I ask an alumnus for?',
    'How do the video sessions work?',
    'Who can see my contact details?',
  ],
  alumni: [
    'How do I control how much I am asked for?',
    'Should I decline requests I cannot help with?',
    'What does claiming a record mean?',
    'How do the video sessions work?',
  ],
  admin: [
    'How does verification work?',
    'Can I export the data?',
    'How is the match score calculated?',
    'Who can see my contact details?',
  ],
};
