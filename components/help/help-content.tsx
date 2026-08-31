import Link from 'next/link';
import {
  BookOpen,
  Video,
  ShieldCheck,
  Users,
  Inbox,
  Mail,
  type LucideIcon,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import type { Role } from '@/lib/session';

type Faq = { q: string; a: string };
type Guide = { icon: LucideIcon; title: string; body: string; href: string; cta: string };

const SHARED_FAQ: Faq[] = [
  {
    q: 'What do I need before a video session works?',
    a: 'A browser that allows camera and microphone access, and a session scheduled against an accepted request. The room opens ten minutes before the start time. Everything runs peer-to-peer in the browser — there is no app to install and no meeting account to create.',
  },
  {
    q: 'The video room says the connection failed. What now?',
    a: 'That almost always means a firewall is blocking the direct peer-to-peer connection — corporate and campus networks are the usual culprits. Try a home network or a phone hotspot. If the camera never starts at all, check the browser permission prompt instead.',
  },
  {
    q: 'Is anything in a video session recorded?',
    a: 'No. Audio and video go directly between the two browsers and are never stored. The in-room chat lives only for the duration of the call and is discarded when the room closes.',
  },
  {
    q: 'Who can see my email address?',
    a: 'Only administrators. It is never shown in the directory, on a profile, or in any export. Alumni contact details from the college spreadsheet are used solely to send claim invitations.',
  },
];

const BY_ROLE: Record<Role, { guides: Guide[]; faq: Faq[] }> = {
  student: {
    guides: [
      {
        icon: Users,
        title: 'Find the right alumnus',
        body: 'Filter by branch, batch and what they are available for. Claimed profiles rank above dormant records, and every score shows the signals behind it.',
        href: '/student/directory',
        cta: 'Open the directory',
      },
      {
        icon: Inbox,
        title: 'Write a request that gets answered',
        body: 'Say your year, what you are aiming for, and the one specific thing you want. Generic messages are the most common reason for silence.',
        href: '/student/requests',
        cta: 'See my requests',
      },
      {
        icon: Video,
        title: 'Turn a yes into a conversation',
        body: 'Once a request is accepted, schedule the video room while the reply is fresh. Accepted-but-never-booked is where most outreach leaks away.',
        href: '/student/calendar',
        cta: 'Open my schedule',
      },
    ],
    faq: [
      {
        q: 'Why are my match scores all low?',
        a: 'The company signal is 35% of the score and the role signal is another 25%. If your target company and target role are blank, more than half the score is zero before anything is compared. Fill in your profile first.',
      },
      {
        q: 'Why can I only send some request types to some alumni?',
        a: 'Alumni choose what they are available for. You can only send a mentorship, mock-interview, referral or internship request to someone who has switched that type on.',
      },
      {
        q: 'Can I send the same person two requests?',
        a: 'Not of the same type while one is still pending — that limit is enforced by the database. Once they reply you can ask again, or ask for something different.',
      },
      {
        q: 'What is a dormant record?',
        a: 'An alumnus from the college spreadsheet who has not claimed their profile. There is no account behind it, so you cannot contact them. They are shown for reference and capped at a score of 40.',
      },
    ],
  },
  alumni: {
    guides: [
      {
        icon: ShieldCheck,
        title: 'Control what you are asked for',
        body: 'The four availability switches on your profile decide which requests can reach you at all. Turning everything off makes you invisible to matching.',
        href: '/alumni/profile',
        cta: 'Edit my profile',
      },
      {
        icon: Inbox,
        title: 'Answer, even when the answer is no',
        body: 'Declining with a one-line reason is far more useful to a student than silence, and it keeps your median reply time honest.',
        href: '/alumni/requests',
        cta: 'Open my inbox',
      },
      {
        icon: Video,
        title: 'Run the session in the browser',
        body: 'Schedule from an accepted request and both of you get a private room with screen sharing and chat. Nothing to install.',
        href: '/alumni/calendar',
        cta: 'Open my schedule',
      },
    ],
    faq: [
      {
        q: 'What is the difference between my record and my profile?',
        a: 'Your institutional record — name, branch, batch, first employer — comes from the college and is read-only. Your profile is everything you say about yourself now, and you can change it at any time.',
      },
      {
        q: 'What does verification actually mean?',
        a: 'An administrator has compared your claim against the college record and confirmed it is genuinely you. It does not change anything you wrote about yourself.',
      },
      {
        q: 'Should I post a role I cannot personally refer into?',
        a: 'Prefer not to. The value of a posting here over a public job board is that a student knows somebody inside can speak for it. One genuine opening beats ten links.',
      },
      {
        q: 'How do I stop receiving requests for a while?',
        a: 'Switch off the availability types on your profile. Existing accepted requests stay, but no new ones can be sent to you.',
      },
    ],
  },
  admin: {
    guides: [
      {
        icon: ShieldCheck,
        title: 'Work the verification queue',
        body: 'Each claim shows the college record and the claimant’s self-reported details side by side. Compare before deciding — every decision is written to the audit log.',
        href: '/admin/verification',
        cta: 'Open the queue',
      },
      {
        icon: Users,
        title: 'Find where the network is thin',
        body: 'Claim rate by batch shows which graduating years never came online. Those are the ones worth a mailing campaign.',
        href: '/admin/analytics',
        cta: 'Open analytics',
      },
      {
        icon: BookOpen,
        title: 'Export for the placement cell',
        body: 'CSV exports of records, companies, requests and opportunities. Contact columns are excluded from every one.',
        href: '/admin/reports',
        cta: 'Open reports',
      },
    ],
    faq: [
      {
        q: 'What happens when I reject a claim?',
        a: 'The record moves out of the claimed set and can be claimed again. The account is not deleted, and the decision is recorded in the audit log with you named as the actor.',
      },
      {
        q: 'Can I edit an alumnus’ profile?',
        a: 'No. Self-reported data belongs to the alumnus. If the institutional record itself is wrong, that needs correcting at the source and re-ingesting — the console deliberately cannot rewrite it.',
      },
      {
        q: 'Can I join a video session to observe?',
        a: 'No. Rooms are private to their two participants by construction. You can see that a session exists and when it is scheduled, but not enter it.',
      },
      {
        q: 'Why are the matching weights not editable?',
        a: 'Every request stores the match score it had when it was sent. Changing the weights would make those frozen scores mean something different from today’s, so the weights are fixed in code and shown read-only in settings.',
      },
    ],
  },
};

export function HelpContent({ role }: { role: Role }) {
  const { guides, faq } = BY_ROLE[role];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {guides.map((g) => (
          <Card key={g.title} className="gap-0 p-5">
            <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <g.icon className="size-4" />
            </div>
            <h3 className="mb-1.5 text-sm font-semibold text-foreground">{g.title}</h3>
            <p className="flex-1 text-xs leading-relaxed text-muted-foreground">{g.body}</p>
            <Button variant="outline" size="sm" className="mt-4 w-full" render={<Link href={g.href} />}>
              {g.cta}
            </Button>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="gap-0 p-5 lg:col-span-2">
          <h2 className="mb-1 text-base font-semibold text-foreground">Common questions</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Specific to your role, then the ones everyone asks.
          </p>
          <Accordion>
            {[...faq, ...SHARED_FAQ].map((f, i) => (
              <AccordionItem key={f.q} value={`item-${i}`}>
                <AccordionTrigger className="text-left text-sm">{f.q}</AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Card>

        <Card className="gap-0 p-5">
          <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Mail className="size-4" />
          </div>
          <h2 className="mb-1.5 text-base font-semibold text-foreground">Still stuck?</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            The placement cell administers this network. For anything the pages above do not answer —
            a wrong institutional record, a claim invitation that never arrived, or an account you
            cannot get into — contact them directly.
          </p>
          <div className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
            <p className="text-muted-foreground">
              <span className="block text-[11px] font-medium uppercase tracking-wide">Placement cell</span>
              St John College of Engineering and Management
            </p>
            <p className="text-muted-foreground">
              <span className="block text-[11px] font-medium uppercase tracking-wide">Campus</span>
              Palghar, Maharashtra
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
