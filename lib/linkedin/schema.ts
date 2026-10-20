import { z } from 'zod';
import { LIMITS } from '@/lib/linkedin/export';

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
