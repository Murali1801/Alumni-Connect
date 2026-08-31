'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, X, Plus, Briefcase, GraduationCap } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { CompanyPicker } from '@/components/opportunities/company-picker';

const SUGGESTED_SKILLS = [
  'JavaScript', 'TypeScript', 'React', 'Node.js', 'Python', 'Java', 'SQL', 'AWS',
  'Docker', 'System Design', 'Data Structures', 'Power BI', 'AutoCAD', 'STAAD Pro',
  'Embedded C', 'MATLAB', 'Linux', 'Networking',
];

export function OpportunityForm({
  defaultCompany,
  defaultLocation,
}: {
  defaultCompany: { id: string; name: string } | null;
  defaultLocation: string;
}) {
  const router = useRouter();
  const [type, setType] = React.useState<'job' | 'internship'>('job');
  const [title, setTitle] = React.useState('');
  const [company, setCompany] = React.useState(defaultCompany);
  const [location, setLocation] = React.useState(defaultLocation);
  const [description, setDescription] = React.useState('');
  const [link, setLink] = React.useState('');
  const [skills, setSkills] = React.useState<string[]>([]);
  const [skillInput, setSkillInput] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  function addSkill(raw: string) {
    const s = raw.trim();
    if (!s) return;
    if (skills.some((x) => x.toLowerCase() === s.toLowerCase())) return;
    setSkills((prev) => [...prev, s]);
    setSkillInput('');
  }

  const errors = {
    title: title.trim().length > 0 && title.trim().length < 3 ? 'At least 3 characters' : null,
    description:
      description.trim().length > 0 && description.trim().length < 40
        ? 'Give students enough to judge whether to apply — at least 40 characters'
        : null,
    link: link && !/^https?:\/\/\S+$/i.test(link) ? 'Must start with http:// or https://' : null,
  };

  const ready =
    title.trim().length >= 3 &&
    description.trim().length >= 40 &&
    Boolean(company) &&
    location.trim().length >= 2 &&
    !errors.link;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || !company) return;
    setSaving(true);
    try {
      const res = await fetch('/api/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          title: title.trim(),
          description: description.trim(),
          company_id: company.id,
          location: location.trim(),
          target_skills: skills,
          application_link: link.trim(),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Could not post the opportunity');

      toast.success('Posted. Students can see it now.');
      router.push('/alumni/opportunities');
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
          <h2 className="mb-4 text-base font-semibold text-foreground">The role</h2>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { value: 'job', label: 'Full-time job', icon: Briefcase },
                    { value: 'internship', label: 'Internship', icon: GraduationCap },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setType(t.value)}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors',
                      type === t.value ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'
                    )}
                  >
                    <t.icon className="size-4" />
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="opp-title">Title</Label>
              <Input
                id="opp-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Software Engineer I"
                aria-invalid={Boolean(errors.title)}
              />
              {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Company</Label>
                <CompanyPicker value={company} onChange={setCompany} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="opp-location">Location</Label>
                <Input
                  id="opp-location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Pune (Hybrid)"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="opp-description">Description</Label>
              <Textarea
                id="opp-description"
                rows={8}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What the team does, what the person will own, and what you actually screen for."
                aria-invalid={Boolean(errors.description)}
              />
              <div className="flex justify-between gap-3">
                <p className="text-xs text-destructive">{errors.description}</p>
                <span className="tnum shrink-0 text-xs text-muted-foreground">
                  {description.trim().length} characters
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="opp-link">Application link (optional)</Label>
              <Input
                id="opp-link"
                type="url"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://careers.example.com/apply"
                aria-invalid={Boolean(errors.link)}
              />
              {errors.link && <p className="text-xs text-destructive">{errors.link}</p>}
            </div>
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="gap-0 p-5">
          <h2 className="mb-1 text-base font-semibold text-foreground">Skills you screen for</h2>
          <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
            These drive the ranking students see. Be honest — listing everything helps nobody.
          </p>

          <div className="flex gap-2">
            <Input
              value={skillInput}
              onChange={(e) => setSkillInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addSkill(skillInput);
                }
              }}
              placeholder="Add a skill"
              aria-label="Add a skill"
            />
            <Button type="button" size="icon" variant="outline" onClick={() => addSkill(skillInput)} aria-label="Add">
              <Plus className="size-4" />
            </Button>
          </div>

          {skills.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {skills.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSkills((prev) => prev.filter((x) => x !== s))}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
                >
                  {s}
                  <X className="size-3" />
                </button>
              ))}
            </div>
          )}

          <div className="mt-4 space-y-2 border-t border-border pt-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Suggestions</p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_SKILLS.filter((s) => !skills.some((x) => x.toLowerCase() === s.toLowerCase()))
                .slice(0, 12)
                .map((s) => (
                  <button key={s} type="button" onClick={() => addSkill(s)}>
                    <Badge variant="outline" className="font-normal text-muted-foreground hover:bg-muted">
                      + {s}
                    </Badge>
                  </button>
                ))}
            </div>
          </div>
        </Card>

        <Card className="gap-0 p-5">
          <Button type="submit" className="w-full" disabled={!ready || saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {saving ? 'Posting…' : 'Publish opportunity'}
          </Button>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            {ready
              ? 'This goes live immediately and appears in every student’s opportunity list.'
              : 'A title, company, location and a description of at least 40 characters are required.'}
          </p>
        </Card>
      </div>
    </form>
  );
}
