'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Briefcase, GraduationCap, ImageIcon, Loader2, Send, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MemberAvatar } from '@/components/patterns';
import { CompanyPicker, type CompanyOption } from '@/components/opportunities/company-picker';
import { MentionTextarea, type MentionMember } from '@/components/feed/mention-textarea';
import { OPPORTUNITY_LABEL, type OpportunityKind } from '@/lib/feed-shared';
import { cn } from '@/lib/utils';

const MAX = 3000;
const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

type Kind = 'post' | OpportunityKind;

const KINDS: { kind: Kind; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { kind: 'post', label: 'Post', icon: Send },
  { kind: 'job', label: 'Job', icon: Briefcase },
  { kind: 'internship', label: 'Internship', icon: GraduationCap },
  { kind: 'placement', label: 'Placement drive', icon: Users },
  { kind: 'referral', label: 'Referral', icon: Send },
];

const PLACEHOLDER: Record<Kind, string> = {
  post: 'Share an update, a question or advice with the SJCEM network. Use @ to mention, # for topics.',
  job: 'What the role involves and who should apply. #hiring',
  internship: 'What the intern will work on and what they will learn. #internship',
  placement: 'The drive: company, dates, rounds and how to prepare. #placements',
  referral: 'Which roles you can refer for and what you need from students. #referral',
};

const empty = {
  title: '',
  location: '',
  work_mode: '' as '' | 'onsite' | 'hybrid' | 'remote',
  experience: '',
  compensation: '',
  duration: '',
  deadline: '',
  eligibility: '',
  skills: '',
  apply_via: 'request' as 'link' | 'request' | 'message',
  application_link: '',
};

/**
 * "Start a post": opens into a text box with mentions, hashtags and a photo.
 * Alumni can also post an opening (job, internship, placement drive or
 * referral), which becomes a real listing on the Jobs page too.
 */
export function Composer({ name, role, avatarUrl }: { name: string; role: 'student' | 'alumni' | 'admin'; avatarUrl?: string | null }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState<Kind>('post');
  const [text, setText] = React.useState('');
  const [mentions, setMentions] = React.useState<MentionMember[]>([]);
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [o, setO] = React.useState(empty);
  const [company, setCompany] = React.useState<CompanyOption | null>(null);
  const [posting, setPosting] = React.useState(false);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const canPostOpenings = role !== 'student';
  const isOpening = kind !== 'post';
  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setO((v) => ({ ...v, [k]: e.target.value }));

  React.useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function choose(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null;
    e.target.value = '';
    if (!picked) return;
    if (!TYPES.includes(picked.type)) return toast.error('Photos must be JPEG, PNG, WebP or GIF.');
    if (picked.size > MAX_BYTES) return toast.error('Photos must be 5 MB or smaller.');
    setFile(picked);
    setOpen(true);
  }

  function reset() {
    setText('');
    setMentions([]);
    setFile(null);
    setO(empty);
    setCompany(null);
    setKind('post');
    setOpen(false);
  }

  async function publish() {
    setPosting(true);
    try {
      const form = new FormData();
      form.set('body', text.trim());
      form.set('mentions', JSON.stringify(mentions.map((m) => m.id)));
      if (file) form.set('image', file);
      if (isOpening) {
        form.set(
          'opportunity',
          JSON.stringify({
            type: kind,
            title: o.title,
            company_id: company?.id ?? null,
            location: o.location,
            work_mode: o.work_mode || null,
            experience: o.experience,
            compensation: o.compensation,
            duration: o.duration,
            deadline: o.deadline,
            eligibility: o.eligibility,
            skills: o.skills.split(',').map((s) => s.trim()).filter(Boolean),
            apply_via: o.apply_via,
            application_link: o.application_link,
          })
        );
      }
      const res = await fetch('/api/posts', { method: 'POST', body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Could not publish the post');
      toast.success(isOpening ? `${OPPORTUNITY_LABEL[kind as OpportunityKind]} posted. It is on the Jobs page too.` : 'Posted.');
      reset();
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setPosting(false);
    }
  }

  const ready = isOpening ? o.title.trim().length >= 3 && (o.apply_via !== 'link' || o.application_link.trim()) : text.trim() || file;

  return (
    <Card className="gap-0 p-4">
      <div className="flex items-start gap-3">
        <MemberAvatar name={name} url={avatarUrl} size="md" />
        {open ? (
          <div className="min-w-0 flex-1 space-y-3">
            {canPostOpenings && (
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="What are you posting?">
                {KINDS.map((k) => (
                  <button
                    key={k.kind}
                    type="button"
                    role="radio"
                    aria-checked={kind === k.kind}
                    onClick={() => setKind(k.kind)}
                    className={cn(
                      'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
                      kind === k.kind ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:bg-muted'
                    )}
                  >
                    <k.icon className="size-3.5" />
                    {k.label}
                  </button>
                ))}
              </div>
            )}

            {isOpening && (
              <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-[var(--surface)] p-3 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="op-title">{kind === 'placement' ? 'Drive (company and roles)' : 'Role title'}</Label>
                  <Input id="op-title" value={o.title} onChange={set('title')} placeholder={kind === 'placement' ? 'Campus drive: Graduate Engineer Trainee' : 'Software Engineer I'} />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>Company</Label>
                  <CompanyPicker value={company} onChange={setCompany} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="op-loc">Location</Label>
                  <Input id="op-loc" value={o.location} onChange={set('location')} placeholder="Mumbai" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="op-mode">Work mode</Label>
                  <select id="op-mode" value={o.work_mode} onChange={set('work_mode')} className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm">
                    <option value="">Not specified</option>
                    <option value="onsite">On-site</option>
                    <option value="hybrid">Hybrid</option>
                    <option value="remote">Remote</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="op-exp">Experience</Label>
                  <Input id="op-exp" value={o.experience} onChange={set('experience')} placeholder="Freshers, 0–2 years" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="op-pay">{kind === 'internship' ? 'Stipend' : 'Salary'}</Label>
                  <Input id="op-pay" value={o.compensation} onChange={set('compensation')} placeholder={kind === 'internship' ? '₹15,000 / month' : '₹4–6 LPA'} />
                </div>
                {kind === 'internship' && (
                  <div className="space-y-1">
                    <Label htmlFor="op-dur">Duration</Label>
                    <Input id="op-dur" value={o.duration} onChange={set('duration')} placeholder="6 months" />
                  </div>
                )}
                <div className="space-y-1">
                  <Label htmlFor="op-deadline">Apply by</Label>
                  <Input id="op-deadline" type="date" value={o.deadline} onChange={set('deadline')} />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="op-elig">Eligibility</Label>
                  <Input id="op-elig" value={o.eligibility} onChange={set('eligibility')} placeholder="2026 batch, COMP/IT, no active backlogs" />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="op-skills">Skills (comma separated)</Label>
                  <Input id="op-skills" value={o.skills} onChange={set('skills')} placeholder="Java, SQL, Data Structures" />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="op-via">How students apply</Label>
                  <select id="op-via" value={o.apply_via} onChange={set('apply_via')} className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm">
                    <option value="request">Through AlumniBridge (they send you a request)</option>
                    <option value="link">On the company&apos;s site (application link)</option>
                    <option value="message">They message me</option>
                  </select>
                </div>
                {o.apply_via === 'link' && (
                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor="op-link">Application link</Label>
                    <Input id="op-link" type="url" value={o.application_link} onChange={set('application_link')} placeholder="https://careers.example.com/…" />
                  </div>
                )}
              </div>
            )}

            <MentionTextarea
              autoFocus
              value={text}
              onChange={(v) => setText(v.slice(0, MAX))}
              mentions={mentions}
              onMentionsChange={setMentions}
              placeholder={PLACEHOLDER[kind]}
              className="min-h-28 resize-y text-sm"
              aria-label="Post text"
            />
            {preview && (
              <div className="relative overflow-hidden rounded-lg border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="Photo to post" className="max-h-80 w-full bg-muted object-contain" />
                <Button variant="secondary" size="icon-sm" className="absolute right-2 top-2" onClick={() => setFile(null)} aria-label="Remove photo">
                  <X />
                </Button>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="h-11 flex-1 rounded-full border border-border px-4 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
          >
            {canPostOpenings ? 'Start a post, or share an opening' : 'Start a post'}
          </button>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => fileInput.current?.click()} className="text-muted-foreground">
            <ImageIcon className="text-[var(--info)]" />
            Photo
          </Button>
          {canPostOpenings && !open && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => {
                setKind('job');
                setOpen(true);
              }}
            >
              <Briefcase className="text-[var(--success)]" />
              Opening
            </Button>
          )}
        </div>
        <input ref={fileInput} type="file" accept={TYPES.join(',')} className="hidden" onChange={choose} />
        {open && (
          <div className="flex items-center gap-2">
            <span className="tnum text-xs text-muted-foreground">{text.length > MAX - 300 ? `${MAX - text.length} left` : ''}</span>
            <Button variant="ghost" size="sm" onClick={reset} disabled={posting}>
              Cancel
            </Button>
            <Button size="sm" onClick={publish} disabled={!ready || posting}>
              {posting && <Loader2 className="animate-spin" />}
              Post
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
