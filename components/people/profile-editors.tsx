'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Check, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CompanyPicker, type CompanyOption } from '@/components/opportunities/company-picker';
import { cn } from '@/lib/utils';

/* Types mirrored from lib/people.ts (server-only, so not importable here). */
export type Editable = {
  full_name: string;
  location: string;
  bio: string;
  skills: string[];
  designation: string;
  company: { id: string; name: string } | null;
  industry: string;
  experience_years: number | null;
  mentorship_available: boolean;
  mock_interview_available: boolean;
  referral_available: boolean;
  internship_available: boolean;
  branch: string;
  batch_year: number | null;
  target_role: string;
  target_company: string;
  target_industry: string;
};

export type Entry = {
  id: string;
  kind: 'work' | 'education';
  title: string;
  organisation: string;
  location: string | null;
  start_date: string;
  end_date: string | null;
  description: string | null;
};

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error ?? 'Could not save');
  return out;
}

/** PATCH a few profile fields, then refresh the server-rendered page. */
function useSave() {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const save = async (fields: Record<string, unknown>, done?: () => void) => {
    setSaving(true);
    try {
      await send('/api/profile', 'PATCH', fields);
      toast.success('Profile updated.');
      done?.();
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };
  return { save, saving };
}

/** The round pencil that opens a section's editor. */
export function PencilButton({ label, onClick, className }: { label: string; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
        className
      )}
    >
      <Pencil className="size-4" />
    </button>
  );
}

function EditorDialog({
  open,
  onOpenChange,
  title,
  description,
  saving,
  onSave,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  saving: boolean;
  onSave: () => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-3">{children}</div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Photo and cover                                                     */
/* ------------------------------------------------------------------ */

/** Change or remove the profile photo (`kind="avatar"`) or the cover banner. */
export function PhotoButton({ kind, hasPhoto, className }: { kind: 'avatar' | 'cover'; hasPhoto: boolean; className?: string }) {
  const router = useRouter();
  const input = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const label = kind === 'avatar' ? 'profile photo' : 'cover banner';

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) return toast.error('Photos must be 3 MB or smaller.');
    setBusy(true);
    try {
      const form = new FormData();
      form.set('image', file);
      await send(`/api/profile/photo?kind=${kind}`, 'POST', form);
      toast.success(`New ${label} saved.`);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Remove your ${label}?`)) return;
    setBusy(true);
    try {
      await send(`/api/profile/photo?kind=${kind}`, 'DELETE');
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        aria-label={`Change ${label}`}
        title={`Change ${label}`}
        className="inline-flex size-8 items-center justify-center rounded-full bg-card text-foreground shadow ring-1 ring-border transition-colors hover:bg-muted disabled:opacity-60"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
      </button>
      {hasPhoto && (
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          aria-label={`Remove ${label}`}
          title={`Remove ${label}`}
          className="inline-flex size-8 items-center justify-center rounded-full bg-card text-muted-foreground shadow ring-1 ring-border transition-colors hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </button>
      )}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={upload} />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Intro: name, headline facts, location                               */
/* ------------------------------------------------------------------ */

export function IntroEditor({ role, initial }: { role: 'student' | 'alumni'; initial: Editable }) {
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState(initial);
  const [company, setCompany] = React.useState<CompanyOption | null>(initial.company);
  const { save, saving } = useSave();
  React.useEffect(() => {
    if (open) {
      setV(initial);
      setCompany(initial.company);
    }
  }, [open, initial]);
  const set = (k: keyof Editable) => (e: React.ChangeEvent<HTMLInputElement>) => setV((x) => ({ ...x, [k]: e.target.value }));

  function submit() {
    const fields: Record<string, unknown> = { full_name: v.full_name, location: v.location };
    if (role === 'alumni') {
      Object.assign(fields, {
        designation: v.designation,
        current_company_id: company?.id ?? null,
        industry: v.industry,
        experience_years: v.experience_years === null || (v.experience_years as unknown) === '' ? null : Number(v.experience_years),
      });
    } else {
      Object.assign(fields, {
        branch: v.branch,
        batch_year: v.batch_year ? Number(v.batch_year) : undefined,
        target_role: v.target_role,
        target_company: v.target_company,
        target_industry: v.target_industry,
      });
    }
    save(fields, () => setOpen(false));
  }

  return (
    <>
      <PencilButton label="Edit intro" onClick={() => setOpen(true)} />
      <EditorDialog open={open} onOpenChange={setOpen} title="Edit intro" saving={saving} onSave={submit}>
        <Field id="pe-name" label="Name">
          <Input id="pe-name" value={v.full_name} onChange={set('full_name')} />
        </Field>
        {role === 'alumni' ? (
          <>
            <Field id="pe-role" label="Current role">
              <Input id="pe-role" value={v.designation} onChange={set('designation')} placeholder="Software Engineer" />
            </Field>
            <div className="space-y-1">
              <Label>Current company</Label>
              <CompanyPicker value={company} onChange={setCompany} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field id="pe-industry" label="Industry">
                <Input id="pe-industry" value={v.industry} onChange={set('industry')} placeholder="Information Technology" />
              </Field>
              <Field id="pe-years" label="Years of experience">
                <Input id="pe-years" type="number" min={0} max={60} value={v.experience_years ?? ''} onChange={set('experience_years')} />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">Branch and batch come from the college record and cannot be changed here.</p>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field id="pe-branch" label="Branch">
                <select
                  id="pe-branch"
                  value={v.branch}
                  onChange={(e) => setV((x) => ({ ...x, branch: e.target.value }))}
                  className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
                >
                  <option value="">Choose…</option>
                  {['COMP', 'IT', 'EXTC', 'CIVIL', 'MECH'].map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="pe-batch" label="Graduating year">
                <Input id="pe-batch" type="number" min={2000} max={2035} value={v.batch_year ?? ''} onChange={set('batch_year')} />
              </Field>
            </div>
            <Field id="pe-target" label="Role you are aiming for">
              <Input id="pe-target" value={v.target_role} onChange={set('target_role')} placeholder="Software Engineer" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field id="pe-tco" label="Dream company">
                <Input id="pe-tco" value={v.target_company} onChange={set('target_company')} />
              </Field>
              <Field id="pe-tin" label="Industry">
                <Input id="pe-tin" value={v.target_industry} onChange={set('target_industry')} />
              </Field>
            </div>
          </>
        )}
        <Field id="pe-loc" label="Location">
          <Input id="pe-loc" value={v.location} onChange={set('location')} placeholder="Mumbai" />
        </Field>
      </EditorDialog>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* About                                                               */
/* ------------------------------------------------------------------ */

export function AboutEditor({ initial, label = 'Edit About' }: { initial: string; label?: string }) {
  const [open, setOpen] = React.useState(false);
  const [bio, setBio] = React.useState(initial);
  const { save, saving } = useSave();
  React.useEffect(() => {
    if (open) setBio(initial);
  }, [open, initial]);
  return (
    <>
      <PencilButton label={label} onClick={() => setOpen(true)} />
      <EditorDialog
        open={open}
        onOpenChange={setOpen}
        title="About"
        description="A few lines on what you do, what you are good at and how you can help."
        saving={saving}
        onSave={() => save({ bio }, () => setOpen(false))}
      >
        <Textarea value={bio} onChange={(e) => setBio(e.target.value.slice(0, 2000))} className="min-h-40 text-sm" aria-label="About" />
        <p className="tnum text-right text-xs text-muted-foreground">{bio.length} / 2000</p>
      </EditorDialog>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Skills                                                              */
/* ------------------------------------------------------------------ */

export function SkillsEditor({ initial }: { initial: string[] }) {
  const [open, setOpen] = React.useState(false);
  const [skills, setSkills] = React.useState(initial);
  const [draft, setDraft] = React.useState('');
  const { save, saving } = useSave();
  React.useEffect(() => {
    if (open) {
      setSkills(initial);
      setDraft('');
    }
  }, [open, initial]);

  function add() {
    const parts = draft.split(',').map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    setSkills((list) => {
      const seen = new Set(list.map((s) => s.toLowerCase()));
      return [...list, ...parts.filter((p) => !seen.has(p.toLowerCase()))].slice(0, 30);
    });
    setDraft('');
  }

  return (
    <>
      <PencilButton label="Edit skills" onClick={() => setOpen(true)} />
      <EditorDialog
        open={open}
        onOpenChange={setOpen}
        title="Skills"
        description="Up to 30. Matching uses these, and other members can endorse them."
        saving={saving}
        onSave={() => save({ skills }, () => setOpen(false))}
      >
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            placeholder="Add a skill, e.g. React (comma for several)"
            aria-label="New skill"
          />
          <Button variant="outline" onClick={add} disabled={!draft.trim()}>
            <Plus />
            Add
          </Button>
        </div>
        <ul className="flex flex-wrap gap-1.5">
          {skills.map((s) => (
            <li key={s} className="inline-flex items-center gap-1 rounded-full bg-muted py-1 pl-3 pr-1 text-xs text-foreground">
              {s}
              <button
                type="button"
                onClick={() => setSkills((list) => list.filter((x) => x !== s))}
                aria-label={`Remove ${s}`}
                className="inline-flex size-5 items-center justify-center rounded-full hover:bg-card"
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
          {skills.length === 0 && <li className="text-xs text-muted-foreground">No skills yet.</li>}
        </ul>
      </EditorDialog>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Availability (alumni)                                               */
/* ------------------------------------------------------------------ */

const AVAILABILITY = [
  { key: 'mentorship_available', label: 'Mentorship' },
  { key: 'mock_interview_available', label: 'Mock interviews' },
  { key: 'referral_available', label: 'Referrals' },
  { key: 'internship_available', label: 'Internships' },
] as const;

export function AvailabilityEditor({ initial }: { initial: Editable }) {
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState(() => Object.fromEntries(AVAILABILITY.map((a) => [a.key, initial[a.key]])) as Record<(typeof AVAILABILITY)[number]['key'], boolean>);
  const { save, saving } = useSave();
  return (
    <>
      <PencilButton label="Edit what you are open to" onClick={() => setOpen(true)} />
      <EditorDialog
        open={open}
        onOpenChange={setOpen}
        title="Open to"
        description="Students can only send you the kinds of request you are open to."
        saving={saving}
        onSave={() => save(v, () => setOpen(false))}
      >
        {AVAILABILITY.map((a) => (
          <label key={a.key} className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm">
            {a.label}
            <input
              type="checkbox"
              checked={v[a.key]}
              onChange={(e) => setV((x) => ({ ...x, [a.key]: e.target.checked }))}
              className="size-4 accent-[var(--primary)]"
            />
          </label>
        ))}
      </EditorDialog>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Work and education entries                                          */
/* ------------------------------------------------------------------ */

const month = (d: string | null) => (d ? d.slice(0, 7) : '');

/** Add (no `entry`) or edit an entry; editing also offers Delete. */
export function EntryEditor({ kind, entry }: { kind: 'work' | 'education'; entry?: Entry }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const blank = { title: '', organisation: '', location: '', start: '', end: '', current: true, description: '' };
  const fromEntry = entry
    ? {
        title: entry.title,
        organisation: entry.organisation,
        location: entry.location ?? '',
        start: month(entry.start_date),
        end: month(entry.end_date),
        current: !entry.end_date,
        description: entry.description ?? '',
      }
    : blank;
  const [v, setV] = React.useState(fromEntry);
  React.useEffect(() => {
    if (open) setV(fromEntry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((x) => ({ ...x, [k]: e.target.value }));
  const work = kind === 'work';

  async function submit() {
    setSaving(true);
    try {
      const body = {
        kind,
        title: v.title,
        organisation: v.organisation,
        location: v.location,
        start_date: v.start,
        end_date: v.current ? null : v.end || null,
        description: v.description,
      };
      await send(entry ? `/api/profile/experience/${entry.id}` : '/api/profile/experience', entry ? 'PATCH' : 'POST', body);
      toast.success(entry ? 'Saved.' : 'Added to your profile.');
      setOpen(false);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!entry || !window.confirm('Delete this entry?')) return;
    setSaving(true);
    try {
      await send(`/api/profile/experience/${entry.id}`, 'DELETE');
      setOpen(false);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {entry ? (
        <PencilButton label={`Edit ${entry.title}`} onClick={() => setOpen(true)} />
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={work ? 'Add experience' : 'Add education'}
          title={work ? 'Add experience' : 'Add education'}
          className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Plus className="size-4" />
        </button>
      )}
      <EditorDialog open={open} onOpenChange={setOpen} title={`${entry ? 'Edit' : 'Add'} ${work ? 'experience' : 'education'}`} saving={saving} onSave={submit}>
        <Field id="en-title" label={work ? 'Title' : 'Degree or course'}>
          <Input id="en-title" value={v.title} onChange={set('title')} placeholder={work ? 'Software Engineer' : 'B.E. Computer Engineering'} />
        </Field>
        <Field id="en-org" label={work ? 'Company' : 'School or college'}>
          <Input id="en-org" value={v.organisation} onChange={set('organisation')} placeholder={work ? 'Infosys' : 'St John College of Engineering and Management'} />
        </Field>
        <Field id="en-loc" label="Location">
          <Input id="en-loc" value={v.location} onChange={set('location')} placeholder="Palghar" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="en-start" label="Start">
            <Input id="en-start" type="month" value={v.start} onChange={set('start')} />
          </Field>
          <Field id="en-end" label="End">
            <Input id="en-end" type="month" value={v.end} onChange={set('end')} disabled={v.current} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={v.current} onChange={(e) => setV((x) => ({ ...x, current: e.target.checked }))} className="size-4 accent-[var(--primary)]" />
          {work ? 'I currently work here' : 'I am currently studying here'}
        </label>
        <Field id="en-desc" label="Description">
          <Textarea id="en-desc" value={v.description} onChange={set('description')} className="min-h-24 text-sm" placeholder={work ? 'What you built or owned.' : 'Projects, activities, grade.'} />
        </Field>
        {entry && (
          <Button variant="ghost" className="text-destructive" onClick={remove} disabled={saving}>
            <Trash2 />
            Delete this entry
          </Button>
        )}
      </EditorDialog>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Endorsements                                                        */
/* ------------------------------------------------------------------ */

/** Endorse a member's skill; shows the running count. */
export function EndorseButton({ userId, skill, count, mine }: { userId: string; skill: string; count: number; mine: boolean }) {
  const [state, setState] = React.useState({ count, mine });
  const [busy, setBusy] = React.useState(false);

  async function toggle() {
    setBusy(true);
    const next = !state.mine;
    try {
      const out = await send('/api/profile/endorse', next ? 'POST' : 'DELETE', { user_id: userId, skill });
      setState({ count: out.count, mine: out.endorsed });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={state.mine}
      className={cn(
        'inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors disabled:opacity-60',
        state.mine ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground'
      )}
    >
      {state.mine ? <Check className="size-3" /> : <Plus className="size-3" />}
      {state.mine ? 'Endorsed' : 'Endorse'}
      {state.count > 0 && <span className="tnum">· {state.count}</span>}
    </button>
  );
}
