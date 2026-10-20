import { unzipSync, strFromU8 } from 'fflate';

/**
 * Reads the archive LinkedIn produces under Settings → Data privacy → "Get a
 * copy of your data". Runs in the alumnus' browser: the archive also holds
 * their messages, connections and contact details, and none of that should
 * ever leave their machine. Only the files in `WANTED` are even decompressed.
 *
 * Pure functions, no DOM — the tests run it under Node.
 */

export type YearMonth = string; // 'YYYY' or 'YYYY-MM'

export type Position = {
  company: string;
  title: string;
  location: string | null;
  description: string | null;
  start: YearMonth | null;
  end: YearMonth | null; // null = current
};

export type Education = {
  school: string;
  degree: string | null;
  notes: string | null;
  start: YearMonth | null;
  end: YearMonth | null;
};

export type Certification = {
  name: string;
  authority: string | null;
  url: string | null;
  start: YearMonth | null;
  end: YearMonth | null;
};

export type Project = {
  title: string;
  description: string | null;
  url: string | null;
  start: YearMonth | null;
  end: YearMonth | null;
};

export type LinkedInImport = {
  headline: string | null;
  summary: string | null;
  industry: string | null;
  location: string | null;
  websites: string[];
  positions: Position[];
  education: Education[];
  skills: string[];
  certifications: Certification[];
  projects: Project[];
  /** Which of the wanted files the archive actually contained. */
  filesFound: string[];
};

/** Caps match the check constraints in 0002_linkedin_profile.sql. */
export const LIMITS = {
  positions: 40,
  education: 20,
  certifications: 50,
  projects: 30,
  skills: 100,
  websites: 10,
  headline: 220,
  shortText: 200,
  longText: 2000,
} as const;

const WANTED = [
  'profile.csv',
  'positions.csv',
  'skills.csv',
  'education.csv',
  'certifications.csv',
  'projects.csv',
] as const;
type WantedFile = (typeof WANTED)[number];

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

/** RFC 4180: quoted fields, doubled quotes, embedded newlines, CRLF, BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

/**
 * Rows as objects keyed by header. Some LinkedIn files open with a few lines of
 * notes before the header, so the header is the first row containing `key`.
 */
export function readTable(text: string, key: string): Record<string, string>[] {
  const rows = parseCsv(text);
  const headerIndex = rows.findIndex((r) => r.some((f) => f.trim().toLowerCase() === key.toLowerCase()));
  if (headerIndex === -1) return [];
  const header = rows[headerIndex].map((h) => h.trim());
  return rows.slice(headerIndex + 1).map((r) => {
    const obj: Record<string, string> = {};
    header.forEach((h, i) => {
      obj[h] = (r[i] ?? '').trim();
    });
    return obj;
  });
}

/* ------------------------------------------------------------------ */
/* Field clean-up                                                      */
/* ------------------------------------------------------------------ */

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

/** "Jan 2020", "2020", "2020-01", "01/2020" → 'YYYY-MM' or 'YYYY'. */
export function parseLinkedInDate(raw: string | undefined): YearMonth | null {
  const v = (raw ?? '').trim();
  if (!v) return null;
  let m = v.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{4})$/);
  if (m && MONTHS[m[1].toLowerCase()]) return `${m[2]}-${MONTHS[m[1].toLowerCase()]}`;
  m = v.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
  m = v.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}`;
  m = v.match(/^(\d{4})$/);
  if (m) return m[1];
  return null;
}

function text(v: string | undefined, max: number = LIMITS.shortText): string | null {
  const t = (v ?? '').replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
}

/** Keeps line breaks, which matter in descriptions and summaries. */
function longText(v: string | undefined): string | null {
  const t = (v ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return t ? t.slice(0, LIMITS.longText) : null;
}

export function safeUrl(v: string | undefined): string | null {
  const t = (v ?? '').trim();
  if (!t) return null;
  const withScheme = /^https?:\/\//i.test(t) ? t : /^www\./i.test(t) ? `https://${t}` : null;
  if (!withScheme) return null;
  try {
    const u = new URL(withScheme);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Profile.csv "Websites" looks like "[PORTFOLIO:https://a.dev,COMPANY:https://b.com]". */
export function extractUrls(raw: string | undefined): string[] {
  const found = (raw ?? '').match(/(?:https?:\/\/|www\.)[^\s,\]\[]+/gi) ?? [];
  const urls = found.map((u) => safeUrl(u)).filter((u): u is string => Boolean(u));
  return [...new Set(urls)].slice(0, LIMITS.websites);
}

function sortKey(d: YearMonth | null): string {
  return d ?? '0000';
}

/** Current roles first, then most recent start. */
export function sortPositions(positions: Position[]): Position[] {
  return [...positions].sort((a, b) => {
    if ((a.end === null) !== (b.end === null)) return a.end === null ? -1 : 1;
    return sortKey(b.start).localeCompare(sortKey(a.start));
  });
}

/** The role to show as "current": the latest-starting position with no end date. */
export function currentPosition(positions: Position[]): Position | null {
  return sortPositions(positions).find((p) => p.end === null) ?? null;
}

function toMonthIndex(d: YearMonth, fallbackMonth: number): number {
  const [y, m] = d.split('-');
  return Number(y) * 12 + (m ? Number(m) - 1 : fallbackMonth);
}

/**
 * Whole years of work, counting overlapping roles once. A position without a
 * start date cannot be placed, so it is left out rather than guessed.
 */
export function experienceYears(positions: Position[], now: Date = new Date()): number | null {
  const nowIndex = now.getFullYear() * 12 + now.getMonth();
  const spans = positions
    .filter((p) => p.start)
    .map((p) => [toMonthIndex(p.start!, 0), p.end ? toMonthIndex(p.end, 11) + 1 : nowIndex] as const)
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  if (spans.length === 0) return null;

  let months = 0;
  let [curStart, curEnd] = spans[0];
  for (const [s, e] of spans.slice(1)) {
    if (s <= curEnd) {
      curEnd = Math.max(curEnd, e);
    } else {
      months += curEnd - curStart;
      [curStart, curEnd] = [s, e];
    }
  }
  months += curEnd - curStart;
  return Math.floor(months / 12);
}

/* ------------------------------------------------------------------ */
/* Archive                                                             */
/* ------------------------------------------------------------------ */

function basename(path: string): string {
  return path.split(/[\\/]/).pop()!.toLowerCase();
}

/** Parse the wanted CSVs, keyed by lowercase basename. */
export function parseLinkedInFiles(files: Partial<Record<WantedFile, string>>): LinkedInImport {
  const profile = files['profile.csv'] ? readTable(files['profile.csv'], 'First Name')[0] : undefined;

  const positions = sortPositions(
    (files['positions.csv'] ? readTable(files['positions.csv'], 'Company Name') : [])
      .map((r) => ({
        company: text(r['Company Name']) ?? '',
        title: text(r['Title']) ?? '',
        location: text(r['Location']),
        description: longText(r['Description']),
        start: parseLinkedInDate(r['Started On']),
        end: parseLinkedInDate(r['Finished On']),
      }))
      .filter((p) => p.company || p.title),
  ).slice(0, LIMITS.positions);

  const education = (files['education.csv'] ? readTable(files['education.csv'], 'School Name') : [])
    .map((r) => ({
      school: text(r['School Name']) ?? '',
      degree: text(r['Degree Name']),
      notes: longText(r['Notes']),
      start: parseLinkedInDate(r['Start Date']),
      end: parseLinkedInDate(r['End Date']),
    }))
    .filter((e) => e.school)
    .sort((a, b) => sortKey(b.start).localeCompare(sortKey(a.start)))
    .slice(0, LIMITS.education);

  const seenSkills = new Set<string>();
  const skills = (files['skills.csv'] ? readTable(files['skills.csv'], 'Name') : [])
    .map((r) => text(r['Name'], 60))
    .filter((s): s is string => {
      if (!s || seenSkills.has(s.toLowerCase())) return false;
      seenSkills.add(s.toLowerCase());
      return true;
    })
    .slice(0, LIMITS.skills);

  const certifications = (files['certifications.csv'] ? readTable(files['certifications.csv'], 'Name') : [])
    .map((r) => ({
      name: text(r['Name']) ?? '',
      authority: text(r['Authority']),
      url: safeUrl(r['Url']),
      start: parseLinkedInDate(r['Started On']),
      end: parseLinkedInDate(r['Finished On']),
    }))
    .filter((c) => c.name)
    .slice(0, LIMITS.certifications);

  const projects = (files['projects.csv'] ? readTable(files['projects.csv'], 'Title') : [])
    .map((r) => ({
      title: text(r['Title']) ?? '',
      description: longText(r['Description']),
      url: safeUrl(r['Url']),
      start: parseLinkedInDate(r['Started On']),
      end: parseLinkedInDate(r['Finished On']),
    }))
    .filter((p) => p.title)
    .slice(0, LIMITS.projects);

  return {
    headline: text(profile?.['Headline'], LIMITS.headline),
    summary: longText(profile?.['Summary']),
    industry: text(profile?.['Industry']),
    location: text(profile?.['Geo Location']),
    websites: extractUrls(profile?.['Websites']),
    positions,
    education,
    skills,
    certifications,
    projects,
    filesFound: WANTED.filter((f) => files[f] !== undefined),
  };
}

export class LinkedInExportError extends Error {}

/** Unzip the archive, decompressing only the files we use. */
export function readLinkedInZip(bytes: Uint8Array): LinkedInImport {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, {
      filter: (file) => (WANTED as readonly string[]).includes(basename(file.name)),
    });
  } catch {
    throw new LinkedInExportError('That file is not a zip archive. Upload the .zip LinkedIn emailed you.');
  }

  const files: Partial<Record<WantedFile, string>> = {};
  for (const [name, data] of Object.entries(entries)) {
    files[basename(name) as WantedFile] = strFromU8(data);
  }
  if (Object.keys(files).length === 0) {
    throw new LinkedInExportError(
      'This zip has none of the LinkedIn profile files (Profile.csv, Positions.csv, Skills.csv…). ' +
        'Make sure it is the archive from "Get a copy of your data".',
    );
  }
  return parseLinkedInFiles(files);
}

/** "2020-01" → "Jan 2020", "2020" → "2020". */
export function formatYearMonth(d: YearMonth | null): string {
  if (!d) return '';
  const [y, m] = d.split('-');
  if (!m) return y;
  const name = Object.keys(MONTHS).find((k) => MONTHS[k] === m) ?? '';
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`;
}

export function formatRange(start: YearMonth | null, end: YearMonth | null, current = 'Present'): string {
  const a = formatYearMonth(start);
  const b = end ? formatYearMonth(end) : current;
  if (!a) return end ? b : '';
  return `${a} – ${b}`;
}
