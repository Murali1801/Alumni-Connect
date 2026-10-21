'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ExternalLink,
  FileArchive,
  Loader2,
  ShieldCheck,
  Upload,
  UploadCloud,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  currentPosition,
  experienceYears,
  formatRange,
  LIMITS,
  LinkedInExportError,
  readLinkedInZip,
  type LinkedInImport,
  type LinkedInPost,
} from '@/lib/linkedin/export';
import { toPostPayload, type LinkedInImportPayload } from '@/lib/linkedin/schema';

export type ExistingProfile = {
  headline: string | null;
  bio: string | null;
  designation: string | null;
  company: string | null;
  location: string | null;
  experience_years: number | null;
  skills: string[];
};

const DOWNLOAD_URL = 'https://www.linkedin.com/mypreferences/d/download-my-data';
const MAX_ZIP_BYTES = 250 * 1024 * 1024;
const BIO_MAX = 600;

type Section =
  | 'headline'
  | 'about'
  | 'current'
  | 'experience'
  | 'education'
  | 'skills'
  | 'certifications'
  | 'projects'
  | 'websites'
  | 'posts';

type Review = {
  include: Record<Section, boolean>;
  headline: string;
  bio: string;
  designation: string;
  company: string;
  location: string;
  experience: number | null;
  positions: boolean[];
  education: boolean[];
  certifications: boolean[];
  projects: boolean[];
  websites: boolean[];
  /** Posts start unticked: publishing someone's posts should be a deliberate choice. */
  posts: boolean[];
  skills: Set<string>;
  skillMode: 'merge' | 'replace';
};

function initialReview(data: LinkedInImport, existing: ExistingProfile): Review {
  const current = currentPosition(data.positions);
  const all = (n: number) => Array.from({ length: n }, () => true);
  return {
    include: {
      headline: Boolean(data.headline),
      about: Boolean(data.summary),
      current: Boolean(current),
      experience: data.positions.length > 0,
      education: data.education.length > 0,
      skills: data.skills.length > 0,
      certifications: data.certifications.length > 0,
      projects: data.projects.length > 0,
      websites: data.websites.length > 0,
      posts: data.posts.length > 0,
    },
    headline: data.headline ?? '',
    bio: (data.summary ?? '').slice(0, BIO_MAX),
    designation: current?.title ?? '',
    company: current?.company ?? '',
    location: current?.location ?? data.location ?? existing.location ?? '',
    experience: experienceYears(data.positions) ?? existing.experience_years,
    positions: all(data.positions.length),
    education: all(data.education.length),
    certifications: all(data.certifications.length),
    projects: all(data.projects.length),
    websites: all(data.websites.length),
    posts: data.posts.map(() => false),
    skills: new Set(data.skills),
    skillMode: 'merge',
  };
}

function pick<T>(items: T[], selected: boolean[]): T[] {
  return items.filter((_, i) => selected[i]);
}

function selectedPosts(data: LinkedInImport, r: Review): LinkedInPost[] {
  return r.include.posts ? pick(data.posts, r.posts) : [];
}

/** A post's label in the review list: the article title, or the start of the text. */
function postLabel(p: LinkedInPost): string {
  if (p.title) return p.title;
  const firstLine = p.body.split('\n')[0].trim();
  if (firstLine) return firstLine.length > 90 ? `${firstLine.slice(0, 90)}…` : firstLine;
  return p.hasMedia ? 'Photo or video post' : 'Shared link';
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function buildPayload(data: LinkedInImport, r: Review, existing: ExistingProfile): LinkedInImportPayload {
  const p: LinkedInImportPayload = {};
  const orNull = (v: string) => v.trim() || null;

  if (r.include.headline) p.headline = orNull(r.headline);
  if (r.include.about) p.bio = orNull(r.bio);
  if (r.include.current) {
    p.designation = orNull(r.designation);
    p.current_company_name = orNull(r.company);
    p.location = orNull(r.location);
    p.experience_years = r.experience;
  }

  // A ticked section with every item unticked publishes nothing rather than wiping.
  const positions = pick(data.positions, r.positions);
  if (r.include.experience && positions.length) p.positions = positions;
  const education = pick(data.education, r.education);
  if (r.include.education && education.length) p.education = education;
  const certifications = pick(data.certifications, r.certifications);
  if (r.include.certifications && certifications.length) p.certifications = certifications;
  const projects = pick(data.projects, r.projects);
  if (r.include.projects && projects.length) p.projects = projects;
  const websites = pick(data.websites, r.websites);
  if (r.include.websites && websites.length) p.websites = websites;

  if (r.include.skills && r.skills.size) {
    const imported = data.skills.filter((s) => r.skills.has(s));
    if (r.skillMode === 'replace') {
      p.skills = imported;
    } else {
      const seen = new Set(existing.skills.map((s) => s.toLowerCase()));
      p.skills = [...existing.skills, ...imported.filter((s) => !seen.has(s.toLowerCase()))].slice(0, LIMITS.skills);
    }
  }
  return p;
}

/* ------------------------------------------------------------------ */

export function LinkedInImportFlow({ existing }: { existing: ExistingProfile }) {
  const router = useRouter();
  const [data, setData] = React.useState<LinkedInImport | null>(null);
  const [review, setReview] = React.useState<Review | null>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [parsing, setParsing] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!/\.zip$/i.test(file.name)) {
      setError('Upload the .zip file LinkedIn sends you. There is no need to unzip it first.');
      return;
    }
    if (file.size > MAX_ZIP_BYTES) {
      setError('That archive is over 250 MB. Request only the profile items from LinkedIn and try again.');
      return;
    }
    setParsing(true);
    try {
      const parsed = readLinkedInZip(new Uint8Array(await file.arrayBuffer()));
      setData(parsed);
      setReview(initialReview(parsed, existing));
      setFileName(file.name);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err instanceof LinkedInExportError ? err.message : 'Could not read that file.');
    } finally {
      setParsing(false);
    }
  }

  function reset() {
    setData(null);
    setReview(null);
    setFileName(null);
    setError(null);
  }

  if (!data || !review) {
    return <UploadStep onFile={handleFile} parsing={parsing} error={error} />;
  }

  const payload = buildPayload(data, review, existing);
  const posts = selectedPosts(data, review);
  const hasProfile = Object.keys(payload).length > 0;
  const sectionCount = (Object.keys(review.include) as Section[]).filter((s) => s !== 'posts' && review.include[s]).length;
  const nothingChosen = !hasProfile && posts.length === 0;

  async function send(url: string, body: unknown, fallback: string) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? fallback);
  }

  async function publish() {
    setPublishing(true);
    try {
      if (hasProfile) await send('/api/profile/alumni/linkedin', payload, 'Could not publish your profile');
      if (posts.length) {
        await send('/api/profile/alumni/linkedin/posts', { posts: posts.map(toPostPayload) }, 'Could not publish your posts');
      }
      const parts = [
        hasProfile ? 'your LinkedIn details' : null,
        posts.length ? `${posts.length} post${posts.length === 1 ? '' : 's'}` : null,
      ].filter(Boolean);
      toast.success(`Published ${parts.join(' and ')} to your profile.`);
      router.push('/alumni/profile');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not publish');
    } finally {
      setPublishing(false);
    }
  }

  const set = <K extends keyof Review>(key: K, value: Review[K]) =>
    setReview((prev) => (prev ? { ...prev, [key]: value } : prev));
  const toggleSection = (s: Section, on: boolean) =>
    setReview((prev) => (prev ? { ...prev, include: { ...prev.include, [s]: on } } : prev));
  const toggleItem = (key: 'positions' | 'education' | 'certifications' | 'projects' | 'websites' | 'posts', i: number, on: boolean) =>
    setReview((prev) => {
      if (!prev) return prev;
      const next = [...prev[key]];
      next[i] = on;
      return { ...prev, [key]: next };
    });
  const setAllPosts = (on: boolean) => set('posts', data.posts.map(() => on));
  const toggleSkill = (skill: string, on: boolean) =>
    setReview((prev) => {
      if (!prev) return prev;
      const next = new Set(prev.skills);
      if (on) next.add(skill);
      else next.delete(skill);
      return { ...prev, skills: next };
    });

  const empty =
    !data.headline &&
    !data.summary &&
    !data.positions.length &&
    !data.education.length &&
    !data.skills.length &&
    !data.posts.length;
  const articleCount = data.posts.filter((p) => p.kind === 'article').length;
  const postCount = data.posts.length - articleCount;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card className="gap-0 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <FileArchive className="size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{fileName}</p>
                <p className="text-xs text-muted-foreground">
                  Read on this device. Found {data.filesFound.length} of 6 profile files
                  {data.posts.length
                    ? `, ${postCount} post${postCount === 1 ? '' : 's'} and ${articleCount} article${articleCount === 1 ? '' : 's'}`
                    : ''}
                  .
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={reset}>
              Choose another file
            </Button>
          </div>
          {empty && (
            <p className="mt-4 rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
              This archive has almost no profile data. If you requested only part of your data, ask LinkedIn for the
              Profile items and upload the new file.
            </p>
          )}
        </Card>

        {data.headline && (
          <ReviewSection
            title="Headline"
            description="One line under your name in the directory."
            included={review.include.headline}
            onToggle={(on) => toggleSection('headline', on)}
            now={existing.headline}
          >
            <Input
              value={review.headline}
              maxLength={LIMITS.headline}
              onChange={(e) => set('headline', e.target.value)}
              aria-label="Headline"
            />
          </ReviewSection>
        )}

        {data.summary && (
          <ReviewSection
            title="About"
            description={`Becomes your bio. Profiles hold ${BIO_MAX} characters, so edit it down if LinkedIn's is longer.`}
            included={review.include.about}
            onToggle={(on) => toggleSection('about', on)}
            now={existing.bio}
          >
            <Textarea
              rows={6}
              maxLength={BIO_MAX}
              value={review.bio}
              onChange={(e) => set('bio', e.target.value)}
              aria-label="Bio"
            />
            <p className="tnum mt-1 text-right text-xs text-muted-foreground">
              {review.bio.length} / {BIO_MAX}
              {(data.summary?.length ?? 0) > BIO_MAX ? ' · shortened from LinkedIn' : ''}
            </p>
          </ReviewSection>
        )}

        {currentPosition(data.positions) && (
          <ReviewSection
            title="Where you work now"
            description="Taken from your current LinkedIn position. Students search and match on these."
            included={review.include.current}
            onToggle={(on) => toggleSection('current', on)}
            now={[existing.designation, existing.company].filter(Boolean).join(' at ') || null}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="li-designation">Designation</Label>
                <Input id="li-designation" value={review.designation} onChange={(e) => set('designation', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="li-company">Company</Label>
                <Input id="li-company" value={review.company} onChange={(e) => set('company', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="li-location">Location</Label>
                <Input id="li-location" value={review.location} onChange={(e) => set('location', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="li-experience">Years of experience</Label>
                <Input
                  id="li-experience"
                  type="number"
                  min={0}
                  max={60}
                  value={review.experience ?? ''}
                  onChange={(e) => set('experience', e.target.value === '' ? null : Number(e.target.value))}
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Years are counted from your dated positions, with overlapping roles counted once.
            </p>
          </ReviewSection>
        )}

        {data.positions.length > 0 && (
          <ReviewSection
            title="Experience"
            description="Your work history, shown on your profile as a timeline."
            included={review.include.experience}
            onToggle={(on) => toggleSection('experience', on)}
            count={[review.positions.filter(Boolean).length, data.positions.length]}
          >
            <ItemList>
              {data.positions.map((p, i) => (
                <ItemRow
                  key={i}
                  checked={review.positions[i]}
                  onChange={(on) => toggleItem('positions', i, on)}
                  title={p.title || 'Role'}
                  meta={[p.company, p.location, formatRange(p.start, p.end)].filter(Boolean).join(' · ')}
                  body={p.description}
                />
              ))}
            </ItemList>
          </ReviewSection>
        )}

        {data.education.length > 0 && (
          <ReviewSection
            title="Education"
            included={review.include.education}
            onToggle={(on) => toggleSection('education', on)}
            count={[review.education.filter(Boolean).length, data.education.length]}
          >
            <ItemList>
              {data.education.map((e, i) => (
                <ItemRow
                  key={i}
                  checked={review.education[i]}
                  onChange={(on) => toggleItem('education', i, on)}
                  title={e.school}
                  meta={[e.degree, formatRange(e.start, e.end, '')].filter(Boolean).join(' · ')}
                />
              ))}
            </ItemList>
          </ReviewSection>
        )}

        {data.certifications.length > 0 && (
          <ReviewSection
            title="Certifications"
            included={review.include.certifications}
            onToggle={(on) => toggleSection('certifications', on)}
            count={[review.certifications.filter(Boolean).length, data.certifications.length]}
          >
            <ItemList>
              {data.certifications.map((c, i) => (
                <ItemRow
                  key={i}
                  checked={review.certifications[i]}
                  onChange={(on) => toggleItem('certifications', i, on)}
                  title={c.name}
                  meta={[c.authority, c.url ? 'has a credential link' : null].filter(Boolean).join(' · ')}
                />
              ))}
            </ItemList>
          </ReviewSection>
        )}

        {data.projects.length > 0 && (
          <ReviewSection
            title="Projects"
            included={review.include.projects}
            onToggle={(on) => toggleSection('projects', on)}
            count={[review.projects.filter(Boolean).length, data.projects.length]}
          >
            <ItemList>
              {data.projects.map((p, i) => (
                <ItemRow
                  key={i}
                  checked={review.projects[i]}
                  onChange={(on) => toggleItem('projects', i, on)}
                  title={p.title}
                  meta={[p.url, formatRange(p.start, p.end, '')].filter(Boolean).join(' · ')}
                  body={p.description}
                />
              ))}
            </ItemList>
          </ReviewSection>
        )}

        {data.websites.length > 0 && (
          <ReviewSection
            title="Portfolio and links"
            description="Websites listed on your LinkedIn profile."
            included={review.include.websites}
            onToggle={(on) => toggleSection('websites', on)}
            count={[review.websites.filter(Boolean).length, data.websites.length]}
          >
            <ItemList>
              {data.websites.map((url, i) => (
                <ItemRow key={url} checked={review.websites[i]} onChange={(on) => toggleItem('websites', i, on)} title={url} />
              ))}
            </ItemList>
          </ReviewSection>
        )}

        {data.posts.length > 0 && (
          <ReviewSection
            title="Posts and articles"
            description="Ticked posts appear on your profile and in the network feed once your record is verified. Nothing is ticked until you choose."
            included={review.include.posts}
            onToggle={(on) => toggleSection('posts', on)}
            count={[review.posts.filter(Boolean).length, data.posts.length]}
          >
            <div className="mb-3 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setAllPosts(true)}>
                Select all
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setAllPosts(false)}>
                Clear
              </Button>
            </div>
            <ItemList>
              {data.posts.map((p, i) => (
                <ItemRow
                  key={p.externalId}
                  checked={review.posts[i]}
                  onChange={(on) => toggleItem('posts', i, on)}
                  title={postLabel(p)}
                  meta={[
                    formatDate(p.postedAt),
                    p.kind === 'article' ? 'Article' : null,
                    p.connectionsOnly ? 'Shared with connections only on LinkedIn' : null,
                    p.sharedUrl ? `Links to ${hostOf(p.sharedUrl)}` : null,
                    p.hasMedia ? 'Has a photo or video (shown on LinkedIn only)' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  body={p.title || p.body.includes('\n') || p.body.length > 90 ? p.body : null}
                />
              ))}
            </ItemList>
          </ReviewSection>
        )}
      </div>

      <div className="space-y-4">
        {data.skills.length > 0 && (
          <ReviewSection
            title="Skills"
            description="Overlap with a student's skills is 20% of their match score."
            included={review.include.skills}
            onToggle={(on) => toggleSection('skills', on)}
            count={[review.skills.size, data.skills.length]}
          >
            <div className="flex flex-wrap gap-1.5">
              {data.skills.map((s) => {
                const on = review.skills.has(s);
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleSkill(s, !on)}
                    className={cn(
                      'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                      on
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border text-muted-foreground line-through hover:bg-muted',
                    )}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
            <fieldset className="mt-4 space-y-1.5 text-sm">
              <legend className="mb-1 text-xs text-muted-foreground">
                You have {existing.skills.length} skill{existing.skills.length === 1 ? '' : 's'} on your profile now.
              </legend>
              {(['merge', 'replace'] as const).map((mode) => (
                <label key={mode} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="skill-mode"
                    checked={review.skillMode === mode}
                    onChange={() => set('skillMode', mode)}
                    className="accent-[var(--primary)]"
                  />
                  {mode === 'merge' ? 'Add these to my current skills' : 'Replace my skills with these'}
                </label>
              ))}
            </fieldset>
          </ReviewSection>
        )}

        <Card className="gap-0 p-5 lg:sticky lg:top-20">
          <h2 className="mb-1 text-base font-semibold text-foreground">Publish</h2>
          <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
            {nothingChosen
              ? 'Nothing is selected yet.'
              : [
                  hasProfile
                    ? `${sectionCount} section${sectionCount === 1 ? '' : 's'} will replace what is on your profile now.`
                    : null,
                  posts.length
                    ? `${posts.length} post${posts.length === 1 ? '' : 's'} will be added; importing them again updates rather than duplicates.`
                    : null,
                  'Students see the change straight away.',
                ]
                  .filter(Boolean)
                  .join(' ')}
          </p>
          <Button className="w-full" onClick={publish} disabled={publishing || nothingChosen}>
            {publishing ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {publishing ? 'Publishing…' : 'Publish to my profile'}
          </Button>
          <Button variant="ghost" className="mt-2 w-full" render={<Link href="/alumni/profile" />}>
            <ArrowLeft className="size-4" />
            Cancel
          </Button>
          <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
            The zip stays on your device. Only the ticked items above are sent.
          </p>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function UploadStep({
  onFile,
  parsing,
  error,
}: {
  onFile: (f: File | undefined) => void;
  parsing: boolean;
  error: string | null;
}) {
  const [dragging, setDragging] = React.useState(false);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="gap-0 p-6 lg:col-span-2">
        <h2 className="mb-1 text-base font-semibold text-foreground">1. Get your data from LinkedIn</h2>
        <p className="mb-4 text-xs text-muted-foreground">Takes a minute to request. LinkedIn emails you when it is ready.</p>
        <ol className="list-decimal space-y-2.5 pl-5 text-sm leading-relaxed text-foreground">
          <li>
            On LinkedIn, open <span className="font-medium">Me → Settings &amp; Privacy → Data privacy → Get a copy of your data</span>.{' '}
            <a href={DOWNLOAD_URL} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-primary hover:underline">
              Open that page
              <ExternalLink className="size-3" />
            </a>
          </li>
          <li>
            For your profile, choose <span className="font-medium">Want something in particular?</span> and tick
            Profile, Positions, Education, Skills, Certifications and Projects (whichever are listed). To bring your
            posts and articles too, choose the <span className="font-medium">larger data archive</span> instead: it is
            the one that includes them.
          </li>
          <li>
            Click <span className="font-medium">Request archive</span>. LinkedIn usually emails a download link within
            about 10 minutes; a full archive can take up to a day.
          </li>
          <li>Download the .zip from that email and upload it below. Do not unzip it.</li>
        </ol>

        <h2 className="mb-3 mt-8 text-base font-semibold text-foreground">2. Upload the zip</h2>
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            onFile(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors',
            dragging ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
          )}
        >
          {parsing ? (
            <Loader2 className="size-7 animate-spin text-muted-foreground" />
          ) : (
            <UploadCloud className="size-7 text-muted-foreground" />
          )}
          <span className="text-sm font-medium text-foreground">
            {parsing ? 'Reading your archive…' : 'Drop the LinkedIn .zip here, or click to choose it'}
          </span>
          <span className="text-xs text-muted-foreground">Basic_LinkedInDataExport_….zip</span>
          <input
            type="file"
            accept=".zip,application/zip,application/x-zip-compressed"
            className="sr-only"
            disabled={parsing}
            onChange={(e) => {
              onFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            {error}
          </p>
        )}
      </Card>

      <Card className="h-fit gap-0 p-5">
        <div className="mb-2 flex items-center gap-2">
          <ShieldCheck className="size-4 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Your data, your choice</h2>
        </div>
        <ul className="space-y-2 text-xs leading-relaxed text-muted-foreground">
          <li>The file is read in this browser. It is never uploaded to our server.</li>
          <li>
            Only your profile files (Profile, Positions, Education, Skills, Certifications, Projects) and your own
            posts and articles are opened. Your messages, connections, contacts, address and birth date are never
            read.
          </li>
          <li>Nothing is published until you tick it on the next screen and press Publish. Posts start unticked.</li>
          <li>You can remove imported details from your profile page at any time.</li>
        </ul>
      </Card>
    </div>
  );
}

function ReviewSection({
  title,
  description,
  included,
  onToggle,
  now,
  count,
  children,
}: {
  title: string;
  description?: string;
  included: boolean;
  onToggle: (on: boolean) => void;
  now?: string | null;
  count?: [number, number];
  children: React.ReactNode;
}) {
  return (
    <Card className={cn('gap-0 p-5 transition-opacity', !included && 'opacity-60')}>
      <label className="flex cursor-pointer items-start gap-3">
        <Checkbox checked={included} onCheckedChange={(v: boolean) => onToggle(v)} className="mt-0.5" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-base font-semibold text-foreground">{title}</span>
            {count && (
              <span className="tnum text-xs text-muted-foreground">
                {count[0]} of {count[1]} selected
              </span>
            )}
          </span>
          {description && <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>}
        </span>
      </label>
      {included && (
        <div className="mt-4">
          {now ? (
            <p className="mb-3 truncate text-xs text-muted-foreground">
              On your profile now: <span className="text-foreground">{now}</span>
            </p>
          ) : null}
          {children}
        </div>
      )}
    </Card>
  );
}

function ItemList({ children }: { children: React.ReactNode }) {
  return <ul className="divide-y divide-border rounded-lg border border-border">{children}</ul>;
}

function ItemRow({
  checked,
  onChange,
  title,
  meta,
  body,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  title: string;
  meta?: string;
  body?: string | null;
}) {
  return (
    <li>
      <label className="flex cursor-pointer items-start gap-3 p-3 hover:bg-muted/50">
        <Checkbox checked={checked} onCheckedChange={(v: boolean) => onChange(v)} className="mt-0.5" />
        <span className={cn('min-w-0 flex-1', !checked && 'text-muted-foreground line-through')}>
          <span className="block break-words text-sm font-medium">{title}</span>
          {meta && <span className="block break-words text-xs text-muted-foreground">{meta}</span>}
          {body && (
            <span className="mt-1 line-clamp-3 block whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
              {body}
            </span>
          )}
        </span>
      </label>
    </li>
  );
}
