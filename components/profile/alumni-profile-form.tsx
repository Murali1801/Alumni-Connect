'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SkillsInput } from '@/components/profile/skills-input';
import { CompanyPicker, type CompanyOption } from '@/components/opportunities/company-picker';

const INDUSTRIES = [
  'Information Technology', 'Financial Services', 'Manufacturing', 'Construction & Infrastructure',
  'Consulting', 'Telecommunications', 'E-commerce', 'Healthcare Technology', 'Automotive', 'Energy',
];

const SUGGESTED_SKILLS = [
  'JavaScript', 'React', 'Node.js', 'Python', 'Java', 'SQL', 'System Design', 'AWS', 'Docker',
  'Power BI', 'AutoCAD', 'STAAD Pro', 'Embedded C', 'VLSI', 'Project Planning', 'Linux',
];

const AVAILABILITY = [
  {
    key: 'mentorship_available' as const,
    label: 'Mentorship',
    body: 'Ongoing guidance — usually a call every few weeks.',
  },
  {
    key: 'mock_interview_available' as const,
    label: 'Mock interviews',
    body: 'One-off practice rounds with honest feedback.',
  },
  {
    key: 'referral_available' as const,
    label: 'Referrals',
    body: 'You will put a name forward when the profile genuinely fits.',
  },
  {
    key: 'internship_available' as const,
    label: 'Internships',
    body: 'Your team takes interns and you can point students at it.',
  },
];

export type AlumniProfileValues = {
  current_company: CompanyOption | null;
  designation: string;
  industry: string;
  location: string;
  experience_years: number | null;
  skills: string[];
  linkedin_url: string;
  bio: string;
  mentorship_available: boolean;
  mock_interview_available: boolean;
  referral_available: boolean;
  internship_available: boolean;
};

export function AlumniProfileForm({ initial }: { initial: AlumniProfileValues }) {
  const router = useRouter();
  const [values, setValues] = React.useState(initial);
  const [saving, setSaving] = React.useState(false);

  const set = <K extends keyof AlumniProfileValues>(key: K, v: AlumniProfileValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: v }));

  const linkError =
    values.linkedin_url && !/^https?:\/\/\S+$/i.test(values.linkedin_url)
      ? 'Must start with http:// or https://'
      : null;

  const noneSelected = AVAILABILITY.every((a) => !values[a.key]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (linkError) return;
    setSaving(true);
    try {
      const res = await fetch('/api/profile/alumni', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_company_id: values.current_company?.id ?? null,
          designation: values.designation.trim() || undefined,
          industry: values.industry.trim() || undefined,
          location: values.location.trim() || undefined,
          experience_years: values.experience_years ?? undefined,
          skills: values.skills,
          linkedin_url: values.linkedin_url.trim(),
          bio: values.bio.trim() || undefined,
          mentorship_available: values.mentorship_available,
          mock_interview_available: values.mock_interview_available,
          referral_available: values.referral_available,
          internship_available: values.internship_available,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Could not save your profile');
      toast.success('Profile saved.');
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card className="gap-0 p-5">
          <h2 className="mb-1 text-base font-semibold text-foreground">Where you work now</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Self-reported and editable. Your institutional record — branch, batch, first employer — is
            separate and never changes.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Current company</Label>
              <CompanyPicker value={values.current_company} onChange={(c) => set('current_company', c)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="designation">Designation</Label>
              <Input
                id="designation"
                value={values.designation}
                onChange={(e) => set('designation', e.target.value)}
                placeholder="Senior Software Engineer"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="industry">Industry</Label>
              <Select
                value={values.industry || 'none'}
                onValueChange={(v) => set('industry', v === 'none' ? '' : String(v))}
              >
                <SelectTrigger id="industry">
                  <SelectValue placeholder="Pick an industry" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not stated</SelectItem>
                  {INDUSTRIES.map((i) => (
                    <SelectItem key={i} value={i}>
                      {i}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={values.location}
                onChange={(e) => set('location', e.target.value)}
                placeholder="Pune"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="experience">Years of experience</Label>
              <Input
                id="experience"
                type="number"
                min={0}
                max={60}
                value={values.experience_years ?? ''}
                onChange={(e) =>
                  set('experience_years', e.target.value === '' ? null : Number(e.target.value))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="linkedin">LinkedIn URL</Label>
              <Input
                id="linkedin"
                type="url"
                value={values.linkedin_url}
                onChange={(e) => set('linkedin_url', e.target.value)}
                placeholder="https://www.linkedin.com/in/…"
                aria-invalid={Boolean(linkError)}
              />
              {linkError && <p className="text-xs text-destructive">{linkError}</p>}
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <Label htmlFor="bio">Short bio</Label>
            <Textarea
              id="bio"
              rows={5}
              maxLength={600}
              value={values.bio}
              onChange={(e) => set('bio', e.target.value)}
              placeholder="How you got from SJCEM to where you are, and what you are genuinely useful for."
            />
            <p className="tnum text-right text-xs text-muted-foreground">{values.bio.length} / 600</p>
          </div>
        </Card>

        <Card className="gap-0 p-5">
          <h2 className="mb-1 text-base font-semibold text-foreground">What you are available for</h2>
          <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
            Students can only send you a request of a type you have switched on. This is the control
            that protects your time.
          </p>

          <div className="space-y-1">
            {AVAILABILITY.map((a) => (
              <label
                key={a.key}
                className="flex cursor-pointer items-start gap-3 rounded-lg p-3 transition-colors hover:bg-muted"
              >
                <Switch
                  checked={values[a.key]}
                  onCheckedChange={(checked: boolean) => set(a.key, checked)}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{a.label}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{a.body}</span>
                </span>
              </label>
            ))}
          </div>

          {noneSelected && (
            <p className="mt-3 rounded-lg bg-[color-mix(in_oklch,var(--warning),transparent_88%)] px-3 py-2.5 text-xs leading-relaxed text-[var(--warning)]">
              With everything off, students cannot send you a request at all and your availability
              signal scores zero in matching.
            </p>
          )}
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="gap-0 p-5">
          <h2 className="mb-1 text-base font-semibold text-foreground">Your skills</h2>
          <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
            Overlap with a student’s skills is 20% of their match score.
          </p>
          <SkillsInput
            skills={values.skills}
            onChange={(s) => set('skills', s)}
            suggestions={SUGGESTED_SKILLS}
          />
        </Card>

        <Card className="gap-0 p-5">
          <Button type="submit" className="w-full" disabled={saving || Boolean(linkError)}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {saving ? 'Saving…' : 'Save profile'}
          </Button>
          <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            <Users className="mt-0.5 size-3.5 shrink-0" />
            Your card in the student directory updates immediately.
          </p>
        </Card>
      </div>
    </form>
  );
}
