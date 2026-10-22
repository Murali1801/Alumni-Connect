/**
 * Feed constants that both server and client code use. lib/posts.ts is
 * server-only, so anything a client component needs lives here.
 */

/** LinkedIn-style reactions; `like` is the default when a member just clicks Like. */
export const REACTIONS = ['like', 'celebrate', 'support', 'insightful', 'curious'] as const;
export type Reaction = (typeof REACTIONS)[number];

export const REACTION_LABEL: Record<Reaction, string> = {
  like: 'Like',
  celebrate: 'Celebrate',
  support: 'Support',
  insightful: 'Insightful',
  curious: 'Curious',
};

/** Solid colours per reaction (the product uses no gradients). */
export const REACTION_COLOR: Record<Reaction, string> = {
  like: '#1f4fcc',
  celebrate: '#16a34a',
  support: '#9333ea',
  insightful: '#d97706',
  curious: '#0891b2',
};

/** Opportunity post kinds, as the composer and the feed filters name them. */
export const OPPORTUNITY_KINDS = ['job', 'internship', 'placement', 'referral'] as const;
export type OpportunityKind = (typeof OPPORTUNITY_KINDS)[number];

export const OPPORTUNITY_LABEL: Record<OpportunityKind, string> = {
  job: 'Job',
  internship: 'Internship',
  placement: 'Placement drive',
  referral: 'Referral',
};

export const WORK_MODE_LABEL = { onsite: 'On-site', hybrid: 'Hybrid', remote: 'Remote' } as const;
