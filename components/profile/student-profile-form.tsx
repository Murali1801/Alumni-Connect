'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save, Target } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SkillsInput } from '@/components/profile/skills-input';
import type { StudentProfileRow } from '@/lib/queries';

const BRANCHES = [
  { value: 'COMP', label: 'Computer Engineering (COMP)' },
  { value: 'IT', label: 'Information Technology (IT)' },
  { value: 'EXTC', label: 'Electronics & Telecommunication (EXTC)' },
  { value: 'CIVIL', label: 'Civil Engineering (CIVIL)' },
  { value: 'MECH', label: 'Mechanical Engineering (MECH)' },
];

const SKILLS_BY_BRANCH: Record<string, string[]> = {
  COMP: ['JavaScript', 'React', 'Node.js', 'Python', 'Java', 'SQL', 'Data Structures', 'System Design', 'AWS', 'Docker'],
  IT: ['SQL', 'Power BI', 'Azure', 'Python', 'Linux', 'Networking', 'Cybersecurity', 'Excel', 'Data Analysis'],
  EXTC: ['Embedded C', 'VLSI', 'MATLAB', 'IoT', 'PCB Design', 'Verilog', 'Signal Processing', 'Firmware'],
  CIVIL: ['AutoCAD', 'STAAD Pro', 'Revit', 'Project Planning', 'Estimation', 'Primavera', 'Site Supervision'],
  MECH: ['SolidWorks', 'AutoCAD', 'CATIA', 'Ansys', 'GD&T', 'CNC Programming'],
};

const INDUSTRIES = [
  'Information Technology', 'Financial Services', 'Manufacturing', 'Construction & Infrastructure',
  'Consulting', 'Telecommunications', 'E-commerce', 'Healthcare Technology', 'Automotive', 'Energy',
];

const currentYear = new Date().getFullYear();
const BATCH_YEARS = Array.from({ length: 8 }, (_, i) => currentYear - 2 + i);

export function StudentProfileForm({ profile }: { profile: StudentProfileRow | null }) {
  const router = useRouter();
  const [branch, setBranch] = React.useState(profile?.branch ?? 'COMP');
  const [batchYear, setBatchYear] = React.useState(String(profile?.batch_year ?? currentYear + 1));
  const [skills, setSkills] = React.useState<string[]>(profile?.skills ?? []);
  const [targetRole, setTargetRole] = React.useState(profile?.target_role ?? '');
  const [targetCompany, setTargetCompany] = React.useState(profile?.target_company ?? '');
  const [targetIndustry, setTargetIndustry] = React.useState(profile?.target_industry ?? '');
  const [locationPref, setLocationPref] = React.useState(profile?.location_pref ?? '');
  const [resumeUrl, setResumeUrl] = React.useState(profile?.resume_url ?? '');
  const [saving, setSaving] = React.useState(false);

  const linkError = resumeUrl && !/^https?:\/\/\S+$/i.test(resumeUrl) ? 'Must start with http:// or https://' : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (linkError) return;
    setSaving(true);
    try {
      const res = await fetch('/api/profile/student', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch,
          batch_year: Number(batchYear),
          skills,
          target_role: targetRole.trim() || undefined,
          target_company: targetCompany.trim() || undefined,
          target_industry: targetIndustry.trim() || undefined,
          location_pref: locationPref.trim() || undefined,
          resume_url: resumeUrl.trim(),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Could not save your profile');
      toast.success('Profile saved. Matching now uses these values.');
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
          <h2 className="mb-1 text-base font-semibold text-foreground">Where you are</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Branch and batch decide which alumni are cohort-relevant to you.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="branch">Branch</Label>
              <Select value={branch} onValueChange={(v) => setBranch(String(v))}>
                <SelectTrigger id="branch">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BRANCHES.map((b) => (
                    <SelectItem key={b.value} value={b.value}>
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="batch">Graduating year</Label>
              <Select value={batchYear} onValueChange={(v) => setBatchYear(String(v))}>
                <SelectTrigger id="batch">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BATCH_YEARS.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        <Card className="gap-0 p-5">
          <h2 className="mb-1 text-base font-semibold text-foreground">Where you are heading</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            The single biggest lever on your match scores — company is weighted at 35%, role at 25%.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="target-role">Target role</Label>
              <Input
                id="target-role"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
                placeholder="Software Engineer"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="target-company">Target company</Label>
              <Input
                id="target-company"
                value={targetCompany}
                onChange={(e) => setTargetCompany(e.target.value)}
                placeholder="Infosys"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="target-industry">Target industry</Label>
              <Select value={targetIndustry || 'none'} onValueChange={(v) => setTargetIndustry(v === 'none' ? '' : String(v))}>
                <SelectTrigger id="target-industry">
                  <SelectValue placeholder="Pick an industry" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not decided yet</SelectItem>
                  {INDUSTRIES.map((i) => (
                    <SelectItem key={i} value={i}>
                      {i}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="location-pref">Preferred location</Label>
              <Input
                id="location-pref"
                value={locationPref}
                onChange={(e) => setLocationPref(e.target.value)}
                placeholder="Pune"
              />
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <Label htmlFor="resume">Resume link (optional)</Label>
            <Input
              id="resume"
              type="url"
              value={resumeUrl}
              onChange={(e) => setResumeUrl(e.target.value)}
              placeholder="https://drive.google.com/…"
              aria-invalid={Boolean(linkError)}
            />
            {linkError && <p className="text-xs text-destructive">{linkError}</p>}
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="gap-0 p-5">
          <h2 className="mb-1 text-base font-semibold text-foreground">Your skills</h2>
          <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
            Matched against alumni skills and against what open roles ask for.
          </p>
          <SkillsInput
            skills={skills}
            onChange={setSkills}
            suggestions={SKILLS_BY_BRANCH[branch] ?? SKILLS_BY_BRANCH.COMP}
          />
        </Card>

        <Card className="gap-0 p-5">
          <Button type="submit" className="w-full" disabled={saving || Boolean(linkError)}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {saving ? 'Saving…' : 'Save profile'}
          </Button>
          <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            <Target className="mt-0.5 size-3.5 shrink-0" />
            Everything here feeds the match score. A blank target company means the 35% company signal
            always scores zero.
          </p>
        </Card>
      </div>
    </form>
  );
}
