/**
 * The assistant's knowledge base: one document per product area or policy,
 * plus every curated help entry from facts.ts.
 *
 * scripts/seed-knowledge.mjs upserts these into `knowledge_docs`, which the
 * assistant searches per question. The same list is bundled with the app as
 * the fallback when the table cannot be read, so the two must stay one list:
 * edit here, then re-run the seed.
 *
 * `url` may contain {role}, filled in with the reader's role.
 */
import { FACTS, type Fact } from './facts';

export type DocSource = 'faq' | 'guide' | 'policy';

export type KnowledgeDoc = {
  id: string;
  title: string;
  body: string;
  source: DocSource;
  url: string | null;
  /** Empty means every role. */
  roles: string[];
  keywords: string[];
};

const MEMBERS = ['student', 'alumni'];

export const PRODUCT_DOCS: KnowledgeDoc[] = [
  /* ---- Home feed ---- */
  {
    id: 'guide-home-feed',
    title: 'The Home feed: posts, photos, reactions and comments',
    source: 'guide',
    url: '/{role}/home',
    roles: MEMBERS,
    keywords: ['home', 'feed', 'post', 'photo', 'react', 'reaction', 'like', 'comment', 'repost', 'share', 'hashtag', 'mention', 'save'],
    body:
      'Home is the first page in the sidebar: a feed of posts written by students and alumni. A post can have up to 3,000 characters of text and an optional photo (JPEG, PNG, WebP or GIF, up to 5 MB). Members react with Like, Celebrate, Support, Insightful or Curious, comment, and repost. Hashtags (#placements) and @mentions work in posts and comments; a mention notifies the person mentioned. Save keeps a post in your Saved filter. Every post has its own link (/posts/<id>) that can be shared, and anyone who opens it is asked to sign in first. Authors can delete their own posts and comments; administrators can take down any post or comment.',
  },
  {
    id: 'guide-feed-openings',
    title: 'Openings in the feed: jobs, internships, placement drives and referrals',
    source: 'guide',
    url: '/{role}/home',
    roles: MEMBERS,
    keywords: ['opening', 'job post', 'internship', 'placement drive', 'referral', 'hiring', 'apply', 'deadline', 'eligibility'],
    body:
      'An opening is a feed post backed by a real listing. Alumni (and administrators) post them; students cannot. There are four kinds: job, internship, placement drive or referral, and can add company, location, work mode (on-site, hybrid or remote), experience, compensation, duration, a deadline, eligibility and the skills they screen on. The same listing appears on the Opportunities page and can be closed from My Postings. Each opening says how to respond: an external link, a referral request sent through AlumniBridge, or a message to the poster. The feed can be filtered to openings only, or to one kind.',
  },

  /* ---- Network ---- */
  {
    id: 'guide-my-network',
    title: 'My Network: connections and invitations',
    source: 'guide',
    url: '/{role}/network',
    roles: MEMBERS,
    keywords: ['network', 'connection', 'connect', 'invitation', 'invite', 'accept', 'ignore', 'withdraw', 'remove connection'],
    body:
      'Connections are mutual, as on LinkedIn: you invite someone, and you are connected once they accept. My Network lists invitations waiting for you (the sidebar badge counts them), people you may know, and your connections. The person invited can accept or ignore; an ignored invitation still reads as pending to the sender. You can withdraw an invitation you sent, and either side can remove a connection at any time. Being connected lets two members message each other, without a request first.',
  },
  {
    id: 'guide-connections-vs-requests',
    title: 'Connections versus requests',
    source: 'guide',
    url: '/{role}/network',
    roles: MEMBERS,
    keywords: ['connection', 'request', 'difference', 'mentorship', 'connect or request'],
    body:
      'A connection says you know each other and opens a message thread. A request is a specific ask from a student to an alumnus: mentorship, a mock interview, a referral or an internship lead. Requests carry a message, are matched against the alumnus’ availability switches, have a status (pending, accepted, declined or closed), and an accepted request is what a video session is scheduled against. Connect to stay in touch; send a request when you need something specific.',
  },

  /* ---- Opportunities ---- */
  {
    id: 'guide-jobs-students',
    title: 'Finding jobs and internships',
    source: 'guide',
    url: '/student/opportunities',
    roles: ['student'],
    keywords: ['jobs', 'opportunities', 'internship', 'apply', 'openings', 'job search', 'hiring'],
    body:
      'Opportunities, in the sidebar under Workspace, lists every open listing posted by alumni: jobs, internships, placement drives and referrals. Listings are ranked by how many of their target skills are already on your profile, so keeping your skills current changes what rises to the top. Filter by kind; each listing shows the company, location, work mode, deadline and eligibility where the poster gave them. Respond the way the listing asks: the external link, a referral request, or a message to the alumnus who posted it. Search also finds listings by title, skill, company or location.',
  },
  {
    id: 'guide-jobs-alumni',
    title: 'Posting an opening',
    source: 'guide',
    url: '/alumni/opportunities',
    roles: ['alumni'],
    keywords: ['post a job', 'post opening', 'my postings', 'hiring', 'close posting', 'new opportunity', 'referral'],
    body:
      'Post an opening from the Home composer or from My Postings. Pick the kind (job, internship, placement drive or referral), the company and location, and tag the skills you screen on: students see the listing ranked by how many of those skills they have. Add a deadline and eligibility if they exist, and choose how students respond: a link, a referral request, or a message to you. Post only roles you can genuinely speak for. Close the posting from My Postings once it is filled so students stop chasing it.',
  },

  /* ---- Requests and mentorship ---- */
  {
    id: 'guide-requests-lifecycle',
    title: 'Requests: statuses and what happens next',
    source: 'guide',
    url: '/{role}/requests',
    roles: MEMBERS,
    keywords: ['request', 'status', 'pending', 'accepted', 'declined', 'closed', 'my requests', 'request inbox', 'reply'],
    body:
      'A request starts as pending. The alumnus accepts or declines it, optionally with a short note, and the student is notified either way. Accepting opens a message thread and lets either side schedule a video session. Either side can close a request when it is done. Only one request of each type can be pending between the same student and alumnus at a time. Students see everything they sent under My Requests; alumni see what they received in the Request Inbox, with the match score the request had when it was sent.',
  },
  {
    id: 'guide-writing-requests',
    title: 'Writing a request that gets answered',
    source: 'guide',
    url: '/student/directory',
    roles: ['student'],
    keywords: ['write request', 'request message', 'outreach', 'cold message', 'what to say', 'mentorship request'],
    body:
      'Messages are 20 to 500 characters, so make each one count: say your branch and year, what you are aiming for, and the one specific thing you want from this person, for example a 30-minute mock interview for a data analyst role. Mention why them: their company, role or batch. Generic messages are the most common reason for silence. Once a request is accepted, book the video session while the reply is fresh.',
  },
  {
    id: 'guide-alumni-inbox',
    title: 'Handling requests as an alumnus',
    source: 'guide',
    url: '/alumni/requests',
    roles: ['alumni'],
    keywords: ['request inbox', 'triage', 'mentees', 'accept', 'decline', 'students to help'],
    body:
      'The Request Inbox lists what students have asked you for, newest first, with each student’s profile and match score. Inbox Triage, under Giving back, orders your pending requests by how long each student has waited, weighted by how well they match you. Accept to open a thread and schedule a session; decline with a one-line reason when you cannot help. My Mentees lists the students whose requests you accepted. Students to Help suggests students whose goals match your experience.',
  },

  /* ---- Messages, sessions, interviews ---- */
  {
    id: 'guide-messages',
    title: 'Messages: who you can talk to',
    source: 'guide',
    url: '/{role}/messages',
    roles: MEMBERS,
    keywords: ['message', 'messages', 'chat', 'dm', 'inbox', 'conversation', 'unread'],
    body:
      'You can message anyone you are connected to, and anyone with whom you have an accepted request. Everyone you can message appears on the left of Messages, newest activity first, and the sidebar badge counts unread messages. Threads are kept, so a conversation can be picked up weeks later.',
  },
  {
    id: 'guide-video-sessions',
    title: 'Scheduling and joining video sessions',
    source: 'guide',
    url: '/{role}/calendar',
    roles: MEMBERS,
    keywords: ['video', 'session', 'schedule', 'calendar', 'room', 'join', 'cancel', 'reschedule', 'call'],
    body:
      'Sessions are scheduled against an accepted request, by either side, with a title, start time, duration and optional agenda. Schedule shows the month view of everything booked; Video Rooms lists only the sessions you can join now. A room opens ten minutes before the start time and runs peer to peer in the browser with screen sharing and chat: no app, no meeting account, nothing recorded. A session can be cancelled or marked completed, and a cancelled session stays in the history.',
  },
  {
    id: 'guide-interviews-proctoring',
    title: 'Interviews: rounds, scorecards and decisions',
    source: 'guide',
    url: '/{role}/interviews',
    roles: MEMBERS,
    keywords: ['interview', 'interviews', 'round', 'rounds', 'coding round', 'mcq', 'scorecard', 'decision', 'reschedule', 'screening', 'pipeline'],
    body:
      'An alumnus (as interviewer or recruiter) can run a student through an interview pipeline, optionally tied to an opening or an accepted request. A pipeline has rounds, each a video, coding or multiple-choice (MCQ) round with a time, duration and interviewer. The candidate accepts a round or asks to reschedule it with a note. Interviewers fill in a scorecard per round: ratings from 1 to 5, a recommendation, private notes and feedback meant for the candidate. The candidate sees a round’s outcome and feedback, and the final decision (selected, rejected or on hold), only once the interviewer releases them; private notes, ratings and MCQ answer keys are never shown to the candidate.',
  },
  {
    id: 'guide-proctoring',
    title: 'Proctored interview rounds',
    source: 'guide',
    url: '/{role}/interviews',
    roles: MEMBERS,
    keywords: ['proctoring', 'proctored', 'integrity', 'cheating', 'tab switch', 'fullscreen', 'camera', 'consent'],
    body:
      'Interview rounds are proctored by default, in the candidate’s browser. The candidate is asked for consent before the round starts, and declining is recorded. During the round the browser logs events such as leaving the tab or window, exiting full screen, copying or pasting, a second display, the camera being turned off or blocked, and, where the camera check runs, no person, more than one person, or a phone in view. What proctoring produces is a log of timed events for the interviewer, summarised as integrity flags, never a video recording.',
  },

  /* ---- Learning ---- */
  {
    id: 'guide-learning-courses',
    title: 'The learning hub: courses and progress',
    source: 'guide',
    url: '/student/learning',
    roles: ['student'],
    keywords: ['learning', 'learning hub', 'course', 'courses', 'learn', 'lesson', 'module', 'quiz', 'enrol', 'progress', 'training'],
    body:
      'The learning hub has courses and training programmes written by alumni for students. A course is a set of modules, each a list of lessons; a lesson is text, a video (YouTube or Vimeo link), a link to an outside resource, or a multiple-choice quiz. Each course shows its level (beginner, intermediate or advanced), topics, skills and estimated hours. Enrol in a course, work through the lessons at your own pace, and the hub keeps your progress and quiz scores.',
  },
  {
    id: 'guide-learning-authoring',
    title: 'Writing a course for students',
    source: 'guide',
    url: '/alumni/learning',
    roles: ['alumni', 'admin'],
    keywords: ['learning', 'course', 'courses', 'write course', 'create course', 'publish course', 'lesson', 'module', 'quiz', 'training'],
    body:
      'Alumni write courses for the learning hub: a title, summary, level (beginner, intermediate or advanced), topics, skills and estimated hours, then modules made of lessons. A lesson is text, a video (YouTube or Vimeo link), a link to an outside resource, or a multiple-choice quiz with one correct option per question. A course stays a draft, invisible to students, until it is published. Students who enrol see their own progress and quiz scores.',
  },
  {
    id: 'guide-learning-workshops',
    title: 'Live workshops',
    source: 'guide',
    url: '/{role}/learning',
    roles: MEMBERS,
    keywords: ['workshop', 'workshops', 'webinar', 'live session', 'rsvp', 'event', 'seats'],
    body:
      'Alumni also run live workshops: a title, description, time, duration and a place, which is online by default with a link to the room. Students RSVP to hold a seat; each workshop has a capacity and stops taking RSVPs once it is full.',
  },

  /* ---- Profiles ---- */
  {
    id: 'guide-profiles',
    title: 'Your profile: photo, about, experience and skills',
    source: 'guide',
    url: '/{role}/settings',
    roles: MEMBERS,
    keywords: ['profile', 'photo', 'avatar', 'cover', 'about', 'bio', 'experience', 'education', 'skills', 'headline', 'edit profile'],
    body:
      'Every member has a profile any signed-in member can open: a photo and cover image, a headline, an About section, work and education entries you add yourself, and skills. Students edit theirs in Settings, which also holds branch, graduating year, target role, company and industry, location preference and resume link: everything the matcher uses. Alumni edit My Profile: current employer, designation, industry, location, skills, bio and the four availability switches. An alumnus’ college record (name, branch, batch, first employer) is read-only and comes from the college.',
  },
  {
    id: 'guide-endorsements-views',
    title: 'Skill endorsements and profile views',
    source: 'guide',
    url: '/{role}/settings',
    roles: MEMBERS,
    keywords: ['endorse', 'endorsement', 'endorsements', 'profile views', 'who viewed', 'viewed my profile'],
    body:
      'Members can endorse the skills listed on someone else’s profile, and take an endorsement back later; the person endorsed is notified. When a member opens your profile it is recorded as a profile view, once per viewer per day, and you are notified. Only you can see who viewed your profile.',
  },

  /* ---- Notifications, search, assistant ---- */
  {
    id: 'guide-notifications',
    title: 'Notifications',
    source: 'guide',
    url: '/{role}/notifications',
    roles: MEMBERS,
    keywords: ['notification', 'notifications', 'bell', 'alert', 'unread', 'mark read'],
    body:
      'You are notified when someone reacts to or comments on your post, mentions you, reposts you, invites you to connect or accepts your invitation, sends you a request or answers yours, endorses one of your skills, or views your profile. The notifications icon shows how many are unread; opening one takes you to the post, profile or request it is about, and you can mark them read or clear them. Only you can see your notifications.',
  },
  {
    id: 'guide-search',
    title: 'Searching people, posts, jobs and companies',
    source: 'guide',
    url: null,
    roles: [],
    keywords: ['search', 'find', 'look up', 'search bar', 'find person', 'find job', 'find company'],
    body:
      'Search covers four things at once: people (students and alumni who have accounts), posts, openings and companies. Every word you type has to match, and the last one can be partial, so results appear while you type. Names tolerate small typos. Use "quotes" for an exact phrase, or between alternatives, and -word to exclude. Posts and openings rank by relevance with newer ones first among equals; closed or past-deadline openings are left out unless you ask for them. Alumni who have not claimed their college record are not in search: the Alumni Directory lists them.',
  },
  {
    id: 'guide-assistant',
    title: 'What the help assistant can see and do',
    source: 'guide',
    url: '/{role}/help',
    roles: [],
    keywords: ['assistant', 'chatbot', 'bot', 'ai', 'help bot', 'what can you see', 'sources', 'citations'],
    body:
      'The assistant answers from this knowledge base, from open listings and recent posts on the network, and from your own account: your profile, your requests and their statuses, and your upcoming sessions. It numbers its sources like [1] so you can open and check them. It cannot read your messages or anyone else’s private data, and it cannot take actions for you: it tells you which page does. Any other question, from interview preparation and choosing a direction to studies and technology, it answers from general knowledge.',
  },
  {
    id: 'guide-career-tools',
    title: 'Readiness Check, Smart Matches and Analytics',
    source: 'guide',
    url: '/student/assistant',
    roles: ['student'],
    keywords: ['readiness', 'readiness check', 'smart matches', 'suggestions', 'analytics', 'career tools'],
    body:
      'Under Career tools, Readiness Check reviews your profile against what the matcher and alumni look for (target company, target role, skills, resume) and flags what to fix, with a link to the page that fixes it. Smart Matches is the Alumni Directory pre-ranked for you by match score. Analytics shows your own activity on the network over time.',
  },
  {
    id: 'guide-alumni-tools',
    title: 'My Impact and Students to Help',
    source: 'guide',
    url: '/alumni/analytics',
    roles: ['alumni'],
    keywords: ['impact', 'my impact', 'analytics', 'students to help', 'suggestions', 'reply time'],
    body:
      'My Impact shows what your time on the network has added up to: who asked, what you said yes to, how fast you answered, requests reaching you by week, and how many requests became sessions. Students to Help suggests students whose target company, role and skills match your experience, so you can offer help before being asked.',
  },
  {
    id: 'guide-admin-console',
    title: 'The admin console',
    source: 'guide',
    url: '/admin',
    roles: ['admin'],
    keywords: ['admin', 'console', 'overview', 'records', 'people', 'companies', 'audit', 'reports', 'moderation'],
    body:
      'The console runs the network rather than taking part in it. Verification is the claim queue. Alumni Records is the college register, read-only. People lists every account; Companies lists the employers on the network. Requests, Opportunities and Sessions show network activity; administrators can see that a session exists but never enter a room. Analytics tracks claim rate and coverage by batch; Reports exports CSVs without contact columns; the Audit Log records every administrative decision with who made it. Administrators can also remove posts and comments from the feed.',
  },

  /* ---- Policies ---- */
  {
    id: 'policy-community',
    title: 'Community guidelines for posts and comments',
    source: 'policy',
    url: '/{role}/home',
    roles: [],
    keywords: ['guidelines', 'rules', 'spam', 'abuse', 'report post', 'take down', 'moderation', 'allowed to post'],
    body:
      'Post as yourself, about careers, learning and the college. Be respectful in posts, comments and messages; no harassment, hate, spam or sales pitches. Do not share anyone else’s contact details or private messages. Openings must be real roles you can speak for, with no invented links. Administrators remove posts and comments that break these rules, and every removal is recorded in the audit log.',
  },
  {
    id: 'policy-data-visibility',
    title: 'Who can see what',
    source: 'policy',
    url: '/{role}/help',
    roles: [],
    keywords: ['privacy', 'visible', 'who can see', 'data', 'public', 'private', 'personal data', 'resume'],
    body:
      'Profiles, posts, comments and reactions are visible to every signed-in member and to nobody outside the network. Your email is visible only to administrators. The contact email, mobile number and claim token on a college record are used only to send claim invitations and never appear anywhere else. A request is visible to the student, the alumnus and administrators. Messages are between the two people in the thread. Notifications and profile-view lists are visible only to you. Video sessions are never recorded.',
  },
  {
    id: 'policy-verification',
    title: 'Claiming and verification policy',
    source: 'policy',
    url: null,
    roles: [],
    keywords: ['claim', 'verify', 'verification', 'identity', 'fake', 'impersonation', 'rejected claim'],
    body:
      'Alumni join by claiming their row in the college register, usually from an invitation link. An administrator compares each claim with the record before marking it verified, and a verified badge means that check was done. A claim that does not match is rejected and the record returns to the unclaimed pool. Claiming someone else’s record is impersonation, and the account is removed. Wrong details in the college record itself are corrected by the placement cell, not in the app.',
  },
  {
    id: 'policy-opportunities',
    title: 'Opportunity posting policy',
    source: 'policy',
    url: null,
    roles: [],
    keywords: ['posting policy', 'fake job', 'scam', 'fee', 'payment', 'job scam', 'referral policy'],
    body:
      'Openings are posted by verified alumni and must be roles they can speak for. No listing may ask students for money, a deposit or a training fee; report any that does to the placement cell. A referral means the alumnus will put a student forward, not that an offer is guaranteed. Close a posting once it is filled.',
  },
];

/** The curated help entries, as documents. */
export function factToDoc(f: Fact): KnowledgeDoc {
  return {
    id: `faq-${f.id}`,
    title: f.question,
    body: f.answer,
    source: 'faq',
    url: f.href ?? null,
    roles: f.roles ?? [],
    keywords: f.keywords,
  };
}

export const ALL_DOCS: KnowledgeDoc[] = [...FACTS.map(factToDoc), ...PRODUCT_DOCS];
