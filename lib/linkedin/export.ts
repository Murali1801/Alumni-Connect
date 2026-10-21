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

/** A post (Shares.csv) or article (Articles/*.html) the alumnus wrote on LinkedIn. */
export type LinkedInPost = {
  kind: 'post' | 'article';
  /** Stable across re-imports: the post or article URL when the export has one. */
  externalId: string;
  title: string | null;
  body: string;
  url: string | null;
  sharedUrl: string | null;
  hasMedia: boolean;
  /** ISO 8601, UTC. */
  postedAt: string;
  /** Shared only with connections on LinkedIn; worth a second look before publishing. */
  connectionsOnly: boolean;
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
  /** Newest first. Empty when the archive has no Shares.csv or Articles folder. */
  posts: LinkedInPost[];
  /** Which of the wanted files the archive actually contained. */
  filesFound: string[];
};

/** Caps match the check constraints in 0002_linkedin_profile.sql and 0003_alumni_posts.sql. */
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
  posts: 500,
  postTitle: 300,
  postBody: 3000,
  articleBody: 10000,
  externalId: 500,
} as const;

const PROFILE_FILES = [
  'profile.csv',
  'positions.csv',
  'skills.csv',
  'education.csv',
  'certifications.csv',
  'projects.csv',
] as const;

const WANTED = [...PROFILE_FILES, 'shares.csv'] as const;
type WantedFile = (typeof WANTED)[number];

/** LinkedIn puts articles at Articles/Articles/<date title>.html. */
function isArticlePath(path: string): boolean {
  return /(^|[\\/])articles[\\/].+\.html?$/i.test(path);
}

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
/* Posts and articles                                                  */
/* ------------------------------------------------------------------ */

/** Paragraph breaks survive; runs of spaces and blank lines do not. */
function postText(v: string | undefined, max: number): string {
  return (v ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

/** "2023-01-15 08:21:37" (LinkedIn's export clock is UTC) → ISO 8601. */
export function parseShareDate(raw: string | undefined): string | null {
  const m = (raw ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const [, y, mo, d, h = '00', mi = '00', s = '00'] = m;
  const date = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
  return Number.isNaN(date.getTime()) || date.getUTCMonth() !== +mo - 1 ? null : date.toISOString();
}

/** Shares.csv: one row per post the member wrote or reshared with a comment. */
export function parseShares(csv: string): LinkedInPost[] {
  return readTable(csv, 'ShareLink')
    .map((r): LinkedInPost | null => {
      const postedAt = parseShareDate(r['Date']);
      const body = postText(r['ShareCommentary'], LIMITS.postBody);
      const sharedUrl = safeUrl(r['SharedUrl']);
      const hasMedia = Boolean((r['MediaUrl'] ?? '').trim());
      // A row with no words, link or media is a bare repost: nothing of theirs to show.
      if (!postedAt || (!body && !sharedUrl && !hasMedia)) return null;
      const url = safeUrl(r['ShareLink']);
      return {
        kind: 'post',
        externalId: (url ?? `share:${postedAt}:${body.slice(0, 80)}`).slice(0, LIMITS.externalId),
        title: null,
        body,
        url,
        sharedUrl,
        hasMedia,
        postedAt,
        connectionsOnly: /connection/i.test(r['Visibility'] ?? ''),
      };
    })
    .filter((p): p is LinkedInPost => p !== null);
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (whole, name: string) => {
    if (name[0] === '#') {
      const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/** HTML to plain text, keeping block boundaries as line breaks. Output is rendered as text, never as HTML. */
function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|head)\b[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|blockquote|pre|tr)>/gi, '\n\n')
      .replace(/<li\b[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, ''),
  );
}

/**
 * One file from the Articles folder. LinkedIn writes a small page per article:
 * the title as an <h1> (linking to the published article), "Created on" and
 * "Published on" lines, then the article body.
 */
export function parseArticle(fileName: string, html: string): LinkedInPost | null {
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const titleTag = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const title = text(htmlToText(h1?.[1] ?? titleTag?.[1] ?? ''), LIMITS.postTitle);

  const url = safeUrl(html.match(/href="(https?:\/\/(?:www\.)?linkedin\.com\/pulse\/[^"]+)"/i)?.[1]);
  const stamp =
    html.match(/Published on\s*(\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?)/i)?.[1] ??
    html.match(/Created on\s*(\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?)/i)?.[1] ??
    fileName.match(/(\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}(?::\d{2})?)?)/)?.[1];
  const postedAt = parseShareDate(stamp);

  // The body is everything after the title, minus the created/published lines.
  const afterTitle = h1 ? html.slice((h1.index ?? 0) + h1[0].length) : html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html;
  const body = postText(
    htmlToText(afterTitle.replace(/<p\b[^>]*>\s*(Created|Published) on[\s\S]*?<\/p>/gi, '')),
    LIMITS.articleBody,
  );

  if (!postedAt || (!title && !body)) return null;
  return {
    kind: 'article',
    externalId: (url ?? `article:${postedAt}:${title ?? ''}`).slice(0, LIMITS.externalId),
    title,
    body,
    url,
    sharedUrl: null,
    hasMedia: /<img\b/i.test(afterTitle),
    postedAt,
    connectionsOnly: false,
  };
}

/** Newest first, one entry per external id, capped. */
function mergePosts(posts: LinkedInPost[]): LinkedInPost[] {
  const seen = new Set<string>();
  return posts
    .sort((a, b) => b.postedAt.localeCompare(a.postedAt))
    .filter((p) => (seen.has(p.externalId) ? false : (seen.add(p.externalId), true)))
    .slice(0, LIMITS.posts);
}

/* ------------------------------------------------------------------ */
/* Archive                                                             */
/* ------------------------------------------------------------------ */

function basename(path: string): string {
  return path.split(/[\\/]/).pop()!.toLowerCase();
}

/** Parse the wanted CSVs (keyed by lowercase basename) and any article pages. */
export function parseLinkedInFiles(
  files: Partial<Record<WantedFile, string>>,
  articles: { name: string; html: string }[] = [],
): LinkedInImport {
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
    posts: mergePosts([
      ...(files['shares.csv'] ? parseShares(files['shares.csv']) : []),
      ...articles.map((a) => parseArticle(a.name, a.html)).filter((a): a is LinkedInPost => a !== null),
    ]),
    filesFound: PROFILE_FILES.filter((f) => files[f] !== undefined),
  };
}

export class LinkedInExportError extends Error {}

/** Unzip the archive, decompressing only the files we use. */
export function readLinkedInZip(bytes: Uint8Array): LinkedInImport {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, {
      filter: (file) => (WANTED as readonly string[]).includes(basename(file.name)) || isArticlePath(file.name),
    });
  } catch {
    throw new LinkedInExportError('That file is not a zip archive. Upload the .zip LinkedIn emailed you.');
  }

  const files: Partial<Record<WantedFile, string>> = {};
  const articles: { name: string; html: string }[] = [];
  for (const [name, data] of Object.entries(entries)) {
    if (isArticlePath(name)) articles.push({ name: basename(name), html: strFromU8(data) });
    else files[basename(name) as WantedFile] = strFromU8(data);
  }
  if (Object.keys(files).length === 0 && articles.length === 0) {
    throw new LinkedInExportError(
      'This zip has none of the LinkedIn profile or post files (Profile.csv, Positions.csv, Shares.csv…). ' +
        'Make sure it is the archive from "Get a copy of your data".',
    );
  }
  return parseLinkedInFiles(files, articles);
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
