import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Briefcase,
  Fingerprint,
  MessagesSquare,
  Network,
  Search,
  Send,
  Sparkles,
  Video,
} from 'lucide-react';
import { getSessionUser, HOME_FOR } from '@/lib/session';
import { BrandMark } from '@/components/shell/brand';
import { ThemeToggle } from '@/components/theme-toggle';

export const metadata = {
  title: 'AlumniBridge: the SJCEM alumni network',
  description:
    'Openings, referrals, mentorship, proctored interview practice and courses from St John College of Engineering and Management alumni, for SJCEM students.',
};
export const dynamic = 'force-dynamic';

const FEATURES = [
  {
    image: '/landing/openings.jpg',
    alt: 'An open-plan engineering office with people working at their desks',
    icon: Briefcase,
    title: 'Openings from people who work there',
    body: 'Alumni post jobs, internships, campus drives and referral offers straight into the feed. Every opening lists the role, pay, eligibility and deadline, and students ask for a referral in one click.',
    points: ['Filter by jobs, internships, drives or referrals', 'Closed listings are marked, never left dangling'],
  },
  {
    image: '/landing/mentor.jpg',
    alt: 'A laptop on a desk showing a video call during an evening mentoring session',
    icon: MessagesSquare,
    title: 'Mentorship that turns into conversations',
    body: 'Find alumni by company, role and skills, see why they match you, and send a request they can accept on their terms. Accepted requests open messaging and browser video rooms: nothing to install.',
    points: ['Match scores explain themselves, signal by signal', 'Alumni choose what they are open to'],
  },
  {
    image: '/landing/interview.jpg',
    alt: 'An empty interview room with two chairs facing each other across a small table',
    icon: Fingerprint,
    title: 'Interview rounds, run properly',
    body: 'Alumni run real interview pipelines: video, coding and multiple-choice rounds with scorecards and shared results. Rounds can be proctored in the browser, with a clear consent screen first and a report that flags moments rather than deciding outcomes.',
    points: ['Tab switches, full screen and a second screen noted', 'Camera checks for a phone or a second person'],
  },
  {
    image: '/landing/learning.jpg',
    alt: 'A study desk at night with a laptop, handwritten notes and a cup of chai',
    icon: BookOpen,
    title: 'Courses written by seniors',
    body: 'Placement prep, core skills and tools, taught by alumni who used them to get hired. Lessons, quizzes and progress that picks up where you stopped, plus live workshops with limited seats.',
    points: ['Quizzes are scored on the server', 'Finished courses show on your profile'],
  },
];

const EXTRAS = [
  { icon: Network, title: 'My Network', body: 'Connect with classmates and alumni, see mutual connections and who viewed your profile.' },
  { icon: Video, title: 'Video rooms', body: 'Mentoring calls and mock interviews in the browser, scheduled from accepted requests.' },
  { icon: Sparkles, title: 'Matching you can read', body: 'A model trained on job titles and skills, with every score broken into its reasons.' },
  { icon: Search, title: 'Search and assistant', body: 'One search over people, posts, openings and companies, and a help assistant that cites its sources.' },
];

const STEPS = {
  students: [
    { title: 'Create your profile', body: 'Branch, batch, skills and the role you are aiming for. It drives your matches.' },
    { title: 'Follow openings and people', body: 'Save openings, connect with alumni, and ask for a referral or a mentoring call.' },
    { title: 'Practise and prepare', body: 'Take courses, then sit proctored mock rounds with alumni before the real thing.' },
  ],
  alumni: [
    { title: 'Claim your record', body: 'Use the link from the placement cell. Your college record links you to your batch.' },
    { title: 'Say what you are open to', body: 'Mentorship, mock interviews, referrals or internships. Only those requests reach you.' },
    { title: 'Give back in minutes', body: 'Post an opening, answer a request, run an interview round or publish a course.' },
  ],
};

export default async function LandingPage() {
  // Members go straight to their own Home.
  const user = await getSessionUser();
  if (user) redirect(HOME_FOR[user.role]);

  return (
    <div className="min-h-dvh bg-[var(--surface)] text-foreground">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2">
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-border/60 bg-[var(--surface)]/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2" aria-label="AlumniBridge home">
            <BrandMark className="size-9" />
            <span className="text-lg font-bold tracking-tight">
              Alumni<span className="text-primary">Bridge</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex" aria-label="On this page">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#how" className="hover:text-foreground">How it works</a>
            <a href="#trust" className="hover:text-foreground">Privacy</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle className="hidden h-9 w-9 rounded-lg sm:inline-flex" />
            <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-card">
              Sign in
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-px active:translate-y-0"
            >
              Join
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </header>

      <main id="main">
        {/* Hero: words on the left, the photo bleeding right, two product chips over it. */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1fr_1.15fr] lg:pb-24 lg:pt-20">
          <div className="max-w-xl">
            <p className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
              <BadgeCheck className="size-3.5" />
              For St John College of Engineering and Management
            </p>
            <h1 className="mt-5 font-display text-[2.6rem] leading-[1.04] tracking-tight text-balance sm:text-6xl">
              Where SJCEM alumni open doors for the next batch.
            </h1>
            <p className="mt-5 max-w-[58ch] text-base leading-relaxed text-muted-foreground text-pretty sm:text-lg">
              Openings, referrals, mentorship and real interview practice, from people who sat in the same classrooms
              and now work where you want to.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-[0_10px_30px_-12px_rgba(31,79,204,0.7)] transition-transform hover:-translate-y-0.5 active:translate-y-0"
              >
                Join as a student
                <ArrowRight className="size-4" />
              </Link>
              <Link href="/login" className="inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-foreground ring-1 ring-border transition-colors hover:bg-card">
                Alumni sign in
              </Link>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">Alumni join through the claim link from the placement cell.</p>
          </div>

          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/landing/hero.jpg"
              alt="An alumna in a blazer mentoring two engineering students at a table on a college campus terrace"
              width={1536}
              height={1024}
              className="aspect-[4/3] w-full rounded-[2rem] object-cover shadow-[0_30px_60px_-30px_rgba(15,30,80,0.45)] lg:aspect-[5/4]"
            />
            <div className="absolute -bottom-5 left-4 max-w-[17rem] rounded-2xl bg-card p-3.5 shadow-[0_16px_40px_-18px_rgba(15,30,80,0.5)] sm:-left-6">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
                <Briefcase className="size-3.5" /> Internship
              </p>
              <p className="mt-1 text-sm font-semibold">Software Engineering Intern</p>
              <p className="text-xs text-muted-foreground">6 months · Pune · Hybrid</p>
              <span className="mt-2.5 inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
                <Send className="size-3" /> Request referral
              </span>
            </div>
            <div className="absolute -top-4 right-4 hidden rounded-2xl bg-card px-3.5 py-2.5 shadow-[0_16px_40px_-18px_rgba(15,30,80,0.5)] sm:block">
              <p className="text-xs font-semibold">Why this match</p>
              <p className="text-[11px] text-muted-foreground">Same target company · 4 shared skills</p>
            </div>
          </div>
        </section>

        {/* Trust strip */}
        <section id="trust" className="border-y border-border/60 bg-card">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:px-6 md:grid-cols-3">
            {[
              { t: 'One college, real records', b: 'Alumni are matched to the college’s own records and verified by the placement cell before their profile is trusted.' },
              { t: 'Members only', b: 'Profiles, posts and openings are visible to signed-in SJCEM students and alumni. Contact details stay private.' },
              { t: 'Consent before monitoring', b: 'Proctoring runs only after a candidate reads exactly what is checked and agrees. It never records video.' },
            ].map((x) => (
              <div key={x.t}>
                <h2 className="text-base font-semibold">{x.t}</h2>
                <p className="mt-1.5 max-w-[46ch] text-sm leading-relaxed text-muted-foreground">{x.b}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Features: zig-zag rows */}
        <section id="features" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-primary">What you can do here</p>
            <h2 className="mt-2 font-display text-3xl tracking-tight text-balance sm:text-4xl">
              Everything between your first year and your first offer.
            </h2>
          </div>
          <div className="mt-14 space-y-20 lg:space-y-28">
            {FEATURES.map((f, i) => (
              <article key={f.title} className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
                <div className={i % 2 ? 'lg:order-2' : ''}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.image} alt={f.alt} loading="lazy" width={763} height={505} className="aspect-[3/2] w-full rounded-[1.5rem] object-cover" />
                </div>
                <div className="max-w-lg">
                  <span className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <f.icon className="size-5" />
                  </span>
                  <h3 className="mt-4 font-display text-2xl tracking-tight sm:text-3xl">{f.title}</h3>
                  <p className="mt-3 leading-relaxed text-muted-foreground text-pretty">{f.body}</p>
                  <ul className="mt-5 space-y-2 text-sm">
                    {f.points.map((p) => (
                      <li key={p} className="flex gap-2">
                        <BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-24 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {EXTRAS.map((x) => (
              <div key={x.title}>
                <x.icon className="size-5 text-primary" />
                <h3 className="mt-3 text-base font-semibold">{x.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{x.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works, for both sides */}
        <section id="how" className="bg-card">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
            <h2 className="font-display text-3xl tracking-tight sm:text-4xl">How it works</h2>
            <div className="mt-12 grid gap-12 lg:grid-cols-2">
              {(['students', 'alumni'] as const).map((side) => (
                <div key={side}>
                  <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">For {side}</h3>
                  <ol className="mt-6 space-y-6">
                    {STEPS[side].map((s, i) => (
                      <li key={s.title} className="flex gap-4">
                        <span className="tnum flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface)] text-sm font-semibold text-primary">
                          {i + 1}
                        </span>
                        <div>
                          <p className="font-semibold">{s.title}</p>
                          <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Closing call to action, solid brand colour */}
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="grid items-center gap-8 overflow-hidden rounded-[2rem] bg-primary px-6 py-12 text-primary-foreground sm:px-12 lg:grid-cols-[1.3fr_1fr]">
            <div>
              <h2 className="font-display text-3xl tracking-tight text-balance sm:text-4xl">Your seniors are already here.</h2>
              <p className="mt-3 max-w-[50ch] text-primary-foreground/85">
                Make a profile in a couple of minutes and see who can help with the role you want.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 lg:justify-end">
              <Link href="/register" className="inline-flex items-center gap-2 rounded-xl bg-card px-5 py-3 text-sm font-semibold text-foreground transition-transform hover:-translate-y-0.5">
                Join as a student
                <ArrowRight className="size-4" />
              </Link>
              <Link href="/login" className="inline-flex items-center rounded-xl px-5 py-3 text-sm font-semibold ring-1 ring-primary-foreground/40 hover:bg-primary-foreground/10">
                Sign in
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span className="inline-flex items-center gap-2">
            <BrandMark className="size-5" />© {new Date().getFullYear()} AlumniBridge · St John College of Engineering and Management, Palghar
          </span>
          <span className="flex gap-4">
            <Link href="/login" className="hover:text-foreground">Sign in</Link>
            <Link href="/register" className="hover:text-foreground">Join</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
