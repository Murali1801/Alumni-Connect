import { z } from 'zod';

const date = z
  .string()
  .regex(/^\d{4}-\d{2}(-\d{2})?$/, 'Use a month and year.')
  .transform((d) => (d.length === 7 ? `${d}-01` : d));

/** A work or education entry, as the profile editor sends it ("YYYY-MM" dates accepted). */
export const entrySchema = z
  .object({
    kind: z.enum(['work', 'education']),
    title: z.string().trim().min(1, 'Add a title.').max(120),
    organisation: z.string().trim().min(1, 'Add the company or institution.').max(120),
    location: z.string().trim().max(120).optional().or(z.literal('')),
    start_date: date,
    end_date: date.nullable().optional(),
    description: z.string().trim().max(1000).optional().or(z.literal('')),
  })
  .refine((e) => !e.end_date || e.end_date >= e.start_date, { message: 'The end date is before the start date.' });
