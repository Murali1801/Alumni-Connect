import { z } from 'zod';
import { LIMITS, type LinkedInPost } from '@/lib/linkedin/export';

/**
 * What the review screen sends after the alumnus picks what to publish. Every
 * key is optional: a key that is present replaces that part of the profile, a
 * key that is absent leaves it as it was. That is how "untick this section"
 * reaches the server.
 */

const yearMonth = z
  .string()
  .regex(/^\d{4}(-(0[1-9]|1[0-2]))?$/, 'Dates must be YYYY or YYYY-MM')
  .nullable();
const short = z.string().trim().max(LIMITS.shortText);
const shortReq = short.min(1);
const long = z.string().trim().max(LIMITS.longText).nullable();
const url = z
  .string()
  .max(500)
  .refine((v) => /^https?:\/\//i.test(v), 'Links must start with http:// or https://')
  .nullable();

export const positionSchema = z.object({
  company: short,
  title: short,
  location: short.nullable(),
  description: long,
  start: yearMonth,
  end: yearMonth,
});

export const educationSchema = z.object({
  school: shortReq,
  degree: short.nullable(),
  notes: long,
  start: yearMonth,
  end: yearMonth,
});

export const certificationSchema = z.object({
  name: shortReq,
  authority: short.nullable(),
  url,
  start: yearMonth,
  end: yearMonth,
});

export const projectSchema = z.object({
  title: shortReq,
  description: long,
  url,
  start: yearMonth,
  end: yearMonth,
});

export const linkedinImportSchema = z
  .object({
    headline: z.string().trim().max(LIMITS.headline).nullable(),
    bio: z.string().trim().max(600).nullable(),
    designation: short.nullable(),
    location: short.nullable(),
    current_company_name: z.string().trim().max(120).nullable(),
    experience_years: z.number().int().min(0).max(60).nullable(),
    skills: z.array(z.string().trim().min(1).max(60)).max(LIMITS.skills),
    websites: z.array(z.string().max(500).refine((v) => /^https?:\/\//i.test(v))).max(LIMITS.websites),
    positions: z.array(positionSchema).max(LIMITS.positions),
    education: z.array(educationSchema).max(LIMITS.education),
    certifications: z.array(certificationSchema).max(LIMITS.certifications),
    projects: z.array(projectSchema).max(LIMITS.projects),
  })
  .partial()
  .strict();

export type LinkedInImportPayload = z.infer<typeof linkedinImportSchema>;

/**
 * Posts the alumnus ticked on the review screen. Snake case to match the
 * alumni_posts columns; the server adds user_id and source itself.
 */
export const linkedinPostSchema = z
  .object({
    kind: z.enum(['post', 'article']),
    external_id: z.string().trim().min(1).max(LIMITS.externalId),
    title: z.string().trim().max(LIMITS.postTitle).nullable(),
    body: z.string().trim().max(LIMITS.articleBody),
    linkedin_url: url,
    shared_url: url,
    has_media: z.boolean(),
    posted_at: z.iso.datetime({ offset: true }),
  })
  .strict()
  .refine((p) => p.kind === 'article' || p.body.length <= LIMITS.postBody, {
    message: `Posts are at most ${LIMITS.postBody} characters`,
    path: ['body'],
  })
  .refine((p) => p.body || p.title || p.shared_url || p.has_media, {
    message: 'A post needs some text, a title, a link or media',
    path: ['body'],
  });

export const linkedinPostsSchema = z
  .object({ posts: z.array(linkedinPostSchema).min(1).max(LIMITS.posts) })
  .strict();

export type LinkedInPostPayload = z.infer<typeof linkedinPostSchema>;

export function toPostPayload(p: LinkedInPost): LinkedInPostPayload {
  return {
    kind: p.kind,
    external_id: p.externalId,
    title: p.title,
    body: p.body,
    linkedin_url: p.url,
    shared_url: p.sharedUrl,
    has_media: p.hasMedia,
    posted_at: p.postedAt,
  };
}
