# SJCEM Alumni Network

The alumni network for St John College of Engineering and Management — mentorship,
mock interviews, referrals, placement support and in-browser video sessions.

Built on the college's own institutional record rather than on self-signup: every
alumnus in the directory starts as a row from the college register and becomes
reachable only when they claim it and an administrator verifies the claim.

## What it does

**Three roles, three workspaces.** Students and alumni are *members* of the
network; the administrator *operates* it. They share one console layout and
almost no destinations.

| | Student | Alumnus | Administrator |
|---|---|---|---|
| Core job | Find and ask | Triage and give back | Verify and observe |
| Directory | Search 3,700+ records, ranked against their profile | — | Full dataset browser |
| Requests | Send, track | Accept or decline with a reason | Read-only oversight |
| Messaging | Persistent DMs with connections | Same | — |
| Video | Join sessions | Join sessions | Monitor only, cannot enter |
| Analytics | Own outreach funnel | Own impact | Network-wide coverage |

**Matching is inspectable.** Every score shows its terms — company (35%), role
(25%), skills (20%), availability (15%), location (5%). Records with no claimed
profile fall back to branch and batch proximity and are capped at 40, so a
dormant record can never outrank a live one. The weights are fixed in code
because each request freezes the score it had when it was sent; changing them
silently would invalidate that history.

**Video sessions are peer-to-peer.** WebRTC directly between the two browsers,
with Supabase Realtime used only for signalling. Screen sharing and chat
included. Nothing is recorded or relayed through a server. A session can only be
created against an accepted request — that acceptance is the consent record.

## Stack

- **Next.js 16** (App Router, Turbopack) with React 19
- **Supabase** — Postgres, Auth, Realtime
- **Tailwind CSS 4** with shadcn/ui on Base UI primitives
- **Recharts** for the analytics
- **WebRTC** for video, signalled over Supabase Realtime broadcast

## Running locally

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase keys
npm run dev
```

Apply the migrations in `supabase/migrations/` to your Supabase project, in
order, before first run.

`0001_fix_recursive_rls.sql` is not optional. The original admin policies were
written as `exists (select 1 from users ...)` on the `users` table itself, which
recurses under RLS and makes any anon read fail with *infinite recursion
detected in policy for relation "users"*. It replaces them with a
`security definer` function, and narrows the `alumni_records` grant so the
contact columns cannot be selected even by a client that tries.

### Scripts

| Script | Purpose |
|---|---|
| `node scripts/purge-demo-data.mjs` | Dry-run a wipe of all fabricated rows |
| `node scripts/purge-demo-data.mjs --commit` | Actually wipe them |
| `node scripts/bootstrap-connection.mjs` | Put the demo accounts into a usable state |
| `npm test` | Run the match-scoring tests |

## Getting in

Two doors, deliberately different:

- **Students** register themselves at `/register`. They are not in the college
  register, so there is nothing to verify them against; the role is fixed to
  `student` server-side and cannot be set by the caller. Set
  `STUDENT_EMAIL_DOMAINS` to restrict sign-ups to college addresses.
- **Alumni** never register. They arrive on a `/claim/<token>` link, confirm the
  record shown is theirs, and choose a password. That claim is what links an
  account to the institutional record, and an administrator verifies it after.

Both paths mint the account server-side already confirmed, so neither depends on
SMTP being configured.

## Data handling

The college register is the source of truth and is never edited from the app.

Three columns on `alumni_records` — `contact_email`, `contact_mobile` and
`claim_token` — exist solely to send claim invitations. They are never selected
into a page, an API response or a CSV export.

**The ingest source and its CSV output are gitignored on purpose.** They contain
real names, email addresses and claim tokens for roughly 3,800 people, and a
claim token is an account-takeover credential. Keep them local; never commit
them, and never attach them to an issue.

## Deploying

The app is a stock Next.js deployment. Set these environment variables on the
host:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` *(server-only — never expose to the browser)*
- `NEXT_PUBLIC_APP_URL` — the deployed origin

Add the deployed origin to Supabase's allowed redirect URLs under
Authentication → URL Configuration, or sign-in will fail in production.

### TURN, for video calls that cross restrictive networks

Video rooms connect the two browsers directly, using public STUN to discover a
route. That works whenever at least one side is directly reachable. It does not
work behind symmetric NAT — most mobile data, and plenty of campus and
corporate wifi — where the media has to be relayed. Those calls sign in fine,
show both people as present, and then sit on *Connecting…* until they fail.

Set these three to give them a relay:

- `NEXT_PUBLIC_TURN_URL` — comma-separated
- `NEXT_PUBLIC_TURN_USERNAME`
- `NEXT_PUBLIC_TURN_CREDENTIAL`

Any provider works — Metered, Cloudflare Calls, Twilio Network Traversal, or a
self-hosted coturn. With Metered's free tier: create an app in their dashboard,
open its ICE servers list, and use every `turn:`/`turns:` URL it gives you as
one comma-separated string, with the single username and credential shown
alongside them. Listing several is worth it — port 443 over TCP is what gets
through the strictest firewalls.

    NEXT_PUBLIC_TURN_URL=turn:global.relay.metered.ca:80,turn:global.relay.metered.ca:80?transport=tcp,turn:global.relay.metered.ca:443,turns:global.relay.metered.ca:443?transport=tcp

**These are inlined at build time.** Adding them to a host's environment does
nothing until the next deploy — a redeploy is required, not just a restart. To
confirm they took, join a room and open **Participants**: the Connection
readout shows whether a relay is configured, which route types each side
gathered, and which one the call is actually using. A working relayed call
reads `via TURN`.

They are `NEXT_PUBLIC_` because the browser is what opens the connection, so
treat the credential as public: scope it to TURN only, and prefer a provider
that issues short-lived ones.

## Licence

Coursework project for St John College of Engineering and Management.
