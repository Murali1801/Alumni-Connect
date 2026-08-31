import 'server-only';

/**
 * Curated facts about how this platform actually behaves.
 *
 * This is the grounding set for the help chatbot. Answers are drawn from here
 * rather than from a model's own recollection, so the bot cannot invent a
 * feature that does not exist. When an LLM is configured it is given these
 * entries as context and told to answer only from them.
 */

export type Fact = {
  id: string;
  /** Terms a user might actually type, used by the offline matcher. */
  keywords: string[];
  question: string;
  answer: string;
  /** Roles this is relevant to; empty means everyone. */
  roles?: ('student' | 'alumni' | 'admin')[];
  href?: string;
  hrefLabel?: string;
};

export const FACTS: Fact[] = [
  {
    id: 'what-is-this',
    keywords: ['what is this', 'this platform', 'sjcem', 'alumni network', 'overview'],
    question: 'What is this platform?',
    answer:
      'The alumni network for St John College of Engineering and Management. Students find alumni who can help them, ask for mentorship, mock interviews, referrals or internships, and meet them in a browser video room. It is built on the college register rather than on self-signup, so the directory reflects real institutional records.',
  },
  {
    id: 'claim',
    keywords: ['claim', 'claiming', 'verify', 'verified', 'my record', 'institutional record'],
    question: 'What does claiming a record mean?',
    answer:
      'Every alumnus starts as a row from the college register. Claiming links your account to that row. An administrator then compares your claim against the record and marks it verified. Claiming is what creates your editable profile; verification is what tells students the identity was checked.',
  },
  {
    id: 'match-score',
    keywords: ['match score', 'score calculated', 'ranking', 'algorithm', 'weights', 'weighted', 'how is the score'],
    question: 'How is the match score calculated?',
    answer:
      'Five weighted signals: company 35%, role 25%, skills 20%, availability 15%, location 5%. Company compares your target company against the alumnus’ current or first employer. Role is token overlap between your target role and their designation and industry. Skills is the overlap of the two skill lists. Availability is whether they switched on the request type. Location is an exact match. Every profile shows the individual terms, so you can see exactly where a score came from.',
  },
  {
    id: 'low-score',
    keywords: ['low score', 'scores low', 'score low', 'low', 'zero', 'bad match', 'improve', 'increase', 'better match', 'my score', 'my scores'],
    question: 'Why are my match scores low?',
    answer:
      'Almost always because the target company and target role are blank on your profile. Those two signals are 60% of the score, so with them empty most of every score is zero before anything is compared. Fill them in from Settings and the whole directory re-ranks.',
    roles: ['student'],
    href: '/student/settings',
    hrefLabel: 'Open my settings',
  },
  {
    id: 'dormant',
    keywords: ['dormant', 'unclaimed', 'cannot contact', 'greyed', 'not claimed'],
    question: 'Why can I not contact some alumni?',
    answer:
      'They have not claimed their record, so there is no account behind the name. Those entries are shown for reference only, ranked on branch and batch proximity alone, and capped at a score of 40 so a dormant record can never outrank a live one.',
  },
  {
    id: 'request-types',
    keywords: ['request types', 'what can i ask', 'mentorship', 'mock interview', 'referral', 'internship', 'ask an alumnus', 'ask for'],
    question: 'What can I ask an alumnus for?',
    answer:
      'Four things: mentorship, a mock interview, a referral, or an internship lead. You can only send a type the alumnus has switched on in their profile — that switch is how they protect their time. Messages are between 20 and 500 characters.',
  },
  {
    id: 'duplicate-request',
    keywords: ['duplicate', 'again', 'twice', 'already pending', 'second request'],
    question: 'Can I send the same person more than one request?',
    answer:
      'Not the same type while one is still pending — the database enforces that. Once they reply you can ask again, or you can ask for something different in the meantime.',
  },
  {
    id: 'video',
    keywords: ['video', 'call', 'meeting', 'room', 'join', 'webrtc', 'zoom'],
    question: 'How do the video sessions work?',
    answer:
      'A session can only be created against an accepted request. Either side then schedules it, and both get a private room that opens ten minutes before the start time. It runs peer to peer in the browser — no app, no meeting account, and nothing is recorded. Screen sharing and chat are built in.',
  },
  {
    id: 'video-trouble',
    keywords: ['camera', 'microphone', 'mic', 'not working', 'no sound', 'cannot hear', 'blocked', 'failed'],
    question: 'My camera or microphone is not working in a call.',
    answer:
      'Check the browser permission prompt first — if it was dismissed you have to allow camera and microphone in the site settings and reload. Inside the room, the Participants panel shows a live microphone level bar: speak and watch it move to confirm the mic is being heard. If you cannot hear the other person, look for the "Click to enable sound" button, which appears when the browser blocks autoplay. If the connection itself fails, that is usually a firewall blocking direct media — a home or mobile network normally fixes it.',
  },
  {
    id: 'messages',
    keywords: ['message', 'chat', 'dm', 'talk', 'conversation'],
    question: 'How does messaging work?',
    answer:
      'A conversation opens as soon as a request is accepted — that acceptance is the consent record. Messages are kept, so either side can pick the thread back up weeks later. Anything typed in a video room goes into the same thread.',
  },
  {
    id: 'privacy',
    keywords: ['privacy', 'email', 'phone', 'contact', 'data', 'personal', 'safe', 'gdpr'],
    question: 'Who can see my contact details?',
    answer:
      'Only administrators see account emails. The contact email, mobile number and claim token held against a college record are used solely to send claim invitations — they are never shown in the directory, on a profile, in an API response, or in any CSV export.',
  },
  {
    id: 'availability',
    keywords: ['availability', 'available', 'switch', 'switches', 'toggle', 'stop requests', 'stop getting', 'stop receiving', 'fewer requests', 'too many', 'control how much', 'pause'],
    question: 'How do I control how much I am asked for?',
    answer:
      'The four availability switches on your profile decide which request types can reach you at all. Turn them off and students cannot send you that type. Turning everything off makes you invisible to matching, which is a legitimate choice when you are busy.',
    roles: ['alumni'],
    href: '/alumni/profile',
    hrefLabel: 'Edit my availability',
  },
  {
    id: 'decline',
    keywords: ['decline', 'reject', 'say no', 'refuse', 'turn down'],
    question: 'Should I decline requests I cannot help with?',
    answer:
      'Yes, and with a one-line reason. A late decline is far more useful to a student than silence — they plan around your answer. It also keeps your median reply time honest rather than hiding unanswered requests.',
    roles: ['alumni'],
  },
  {
    id: 'verification',
    keywords: ['verification', 'queue', 'approve', 'reject claim', 'audit'],
    question: 'How does verification work?',
    answer:
      'The queue shows each claimed record with the college data and the claimant’s self-reported details side by side. Verifying records that you checked the claim is genuine; it does not change anything the alumnus wrote. Rejecting returns the record to the unclaimed pool so it can be claimed again. Every decision is written to the audit log with your name against it.',
    roles: ['admin'],
    href: '/admin/verification',
    hrefLabel: 'Open the queue',
  },
  {
    id: 'export',
    keywords: ['export', 'csv', 'download', 'report', 'placement cell'],
    question: 'Can I export the data?',
    answer:
      'Administrators can export alumni records, companies, requests and opportunities as CSV from Reports. Contact columns and claim tokens are excluded from every export. Each download is recorded in the audit log.',
    roles: ['admin'],
    href: '/admin/reports',
    hrefLabel: 'Open reports',
  },
  {
    id: 'opportunities',
    keywords: ['job', 'opportunity', 'opening', 'posting', 'apply', 'internship posting'],
    question: 'How do opportunities work?',
    answer:
      'Alumni post roles they can genuinely speak for, tagged with the skills they screen on. Students see them ranked by how much of that skill list they already have. Closing a posting when it is filled stops students chasing it.',
  },
  {
    id: 'roles',
    keywords: ['role', 'admin', 'student', 'alumni', 'difference', 'permission', 'who can'],
    question: 'What is the difference between the three roles?',
    answer:
      'Students and alumni are members: students ask, alumni decide what they will give and to whom. The administrator operates the network — verifying claims, watching coverage and exporting data — but cannot answer requests on anyone’s behalf or join a private video room.',
  },

  /* ---- navigation: "where is X" questions ---- */
  {
    id: 'nav-help-student',
    keywords: ['help page', 'help', 'support', 'documentation', 'guide', 'faq'],
    question: 'Where is the Help page?',
    answer:
      'Help is the second-to-last item in the sidebar, under General. It has the full guides and the frequently asked questions in one place.',
    roles: ['student'],
    href: '/student/help',
    hrefLabel: 'Open Help',
  },
  {
    id: 'nav-help-alumni',
    keywords: ['help page', 'help', 'support', 'documentation', 'guide', 'faq'],
    question: 'Where is the Help page?',
    answer:
      'Help is in the sidebar under General, below Settings. It has the full guides and the frequently asked questions in one place.',
    roles: ['alumni'],
    href: '/alumni/help',
    hrefLabel: 'Open Help',
  },
  {
    id: 'nav-help-admin',
    keywords: ['help page', 'help', 'support', 'documentation', 'guide', 'faq'],
    question: 'Where is the Help page?',
    answer:
      'Help is in the sidebar under General, below Settings. It covers the verification workflow, exports and the audit log.',
    roles: ['admin'],
    href: '/admin/help',
    hrefLabel: 'Open Help',
  },
  {
    id: 'nav-settings-student',
    keywords: ['settings', 'profile page', 'edit profile', 'change profile', 'update profile'],
    question: 'Where do I edit my profile?',
    answer:
      'Settings, at the bottom of the sidebar under General. That one page holds your branch, graduating year, skills, targets and resume link — everything the matcher uses.',
    roles: ['student'],
    href: '/student/settings',
    hrefLabel: 'Open Settings',
  },
  {
    id: 'nav-profile-alumni',
    keywords: ['settings', 'profile page', 'edit profile', 'change profile', 'update profile', 'availability'],
    question: 'Where do I edit my profile?',
    answer:
      'My Profile, in the sidebar under General. It holds your current employer, designation, skills, bio and the four availability switches that decide what students can ask you for.',
    roles: ['alumni'],
    href: '/alumni/profile',
    hrefLabel: 'Open My Profile',
  },
  {
    id: 'nav-directory',
    keywords: ['directory', 'find alumni', 'search alumni', 'browse alumni', 'alumni list'],
    question: 'Where do I find alumni?',
    answer:
      'Alumni Directory, near the top of the sidebar. You can filter by branch, batch and what each person is available for, and every card shows how well they match you. Smart Matches, further down, is the same data pre-ranked for you.',
    roles: ['student'],
    href: '/student/directory',
    hrefLabel: 'Open the directory',
  },
  {
    id: 'nav-schedule',
    keywords: ['schedule', 'calendar', 'my sessions', 'upcoming', 'booked', 'video rooms'],
    question: 'Where are my scheduled sessions?',
    answer:
      'Schedule shows the month view with everything you have booked. Video Rooms, just below it, lists only the sessions you can join right now. Both are in the sidebar under Workspace.',
  },
  {
    id: 'nav-messages',
    keywords: ['messages', 'messages page', 'where messages', 'my inbox', 'conversations', 'my chats'],
    question: 'Where are my messages?',
    answer:
      'Messages, in the sidebar under Workspace. Everyone you are connected to appears on the left; the badge shows how many messages you have not read.',
  },
  {
    id: 'bot-limits',
    keywords: ['who are you', 'are you ai', 'chatbot', 'assistant', 'bot', 'llm', 'model'],
    question: 'What are you, and what can you not do?',
    answer:
      'I am a help assistant for this platform, answering from a fixed set of documented facts about how it works. I cannot see your account, your requests or your messages, I cannot perform actions for you, and I will say when a question falls outside what I have been given rather than guessing.',
  },
];

/**
 * Words that carry no topic signal. Without this list a question like "where is
 * the help page" scores against every entry whose title happens to contain
 * "the", and the first such entry wins by array order.
 */
const STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'was', 'were', 'this', 'that', 'these', 'those',
  'with', 'from', 'have', 'has', 'had', 'can', 'could', 'would', 'should',
  'will', 'shall', 'may', 'might', 'must', 'does', 'did', 'you', 'your',
  'yours', 'our', 'their', 'its', 'his', 'her', 'about', 'there', 'here',
  'what', 'when', 'where', 'which', 'who', 'whom', 'how', 'why', 'not',
  'but', 'all', 'any', 'some', 'get', 'got', 'let', 'see', 'use', 'used',
  'want', 'need', 'find', 'know', 'tell', 'show', 'please', 'thanks',
]);

/** A hit must clear this to count as an answer rather than a coincidence. */
const MIN_SCORE = 3;

export type FactHit = { fact: Fact; score: number };

/**
 * Score a question against the knowledge base.
 *
 * Scoring, strongest signal first:
 *   - a multi-word keyword appearing verbatim in the question
 *   - a single keyword appearing verbatim
 *   - a content word matching a keyword exactly, or as a prefix
 *   - a content word appearing in the entry's own question
 *
 * Stopwords are dropped before any of that, and anything below `MIN_SCORE` is
 * discarded so the caller can say "I do not know" instead of guessing.
 */
export function scoreFacts(query: string, role?: string): FactHit[] {
  const q = query.toLowerCase();
  const words = q
    .split(/\W+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));

  // A question can be entirely stopwords — "who are you" — and still match a
  // keyword phrase verbatim, so never bail out before the phrase check.

  return FACTS.map((fact) => {
    if (fact.roles && role && !fact.roles.includes(role as any)) return { fact, score: -1 };

    let score = 0;

    for (const kw of fact.keywords) {
      if (q.includes(kw)) score += kw.includes(' ') ? 6 : 4;
    }

    const questionWords = new Set(
      fact.question.toLowerCase().split(/\W+/).filter((w) => w.length > 2 && !STOPWORDS.has(w))
    );

    for (const w of words) {
      if (fact.keywords.some((kw) => kw === w)) score += 3;
      else if (fact.keywords.some((kw) => kw.startsWith(w) || w.startsWith(kw))) score += 2;
      if (questionWords.has(w)) score += 2;
    }

    return { fact, score };
  })
    .filter((r) => r.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score);
}

/**
 * Best matches only. A second entry is returned solely when it scores close to
 * the winner — stapling a weak second answer onto a good one reads as confusion.
 */
export function searchFacts(query: string, role?: string, limit = 3): Fact[] {
  const hits = scoreFacts(query, role);
  if (hits.length === 0) return [];
  const best = hits[0].score;
  return hits
    .filter((h) => h.score >= best * 0.6)
    .slice(0, limit)
    .map((h) => h.fact);
}

