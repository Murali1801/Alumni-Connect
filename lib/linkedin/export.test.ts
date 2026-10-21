import assert from 'assert';
import { strToU8, zipSync } from 'fflate';
import {
  currentPosition,
  experienceYears,
  extractUrls,
  formatRange,
  LinkedInExportError,
  parseArticle,
  parseCsv,
  parseLinkedInDate,
  parseShareDate,
  parseShares,
  readLinkedInZip,
  readTable,
  safeUrl,
} from './export';
import { linkedinImportSchema, linkedinPostsSchema, toPostPayload } from './schema';

// Synthetic data only. Never commit a real export: it is someone's personal data.

const PROFILE_CSV =
  '﻿First Name,Last Name,Maiden Name,Address,Birth Date,Headline,Summary,Industry,Zip Code,Geo Location,Twitter Handles,Websites,Instant Messengers\r\n' +
  'Test,Person,,"1 Secret Street, Mumbai",01 Jan 1995,Senior Engineer at Example Corp,"Builds things.\nLikes mentoring.",Software Development,400001,"Mumbai, Maharashtra, India",,"[PORTFOLIO:https://test.dev,COMPANY:www.example.com]",\r\n';

const POSITIONS_CSV =
  'Company Name,Title,Description,Location,Started On,Finished On\n' +
  'Example Corp,Senior Engineer,"Leads the ""payments"" team.\nHires interns.","Pune, India",Mar 2021,\n' +
  'First Job Ltd,Engineer,,Mumbai,Jul 2017,Feb 2021\n' +
  'Side Gig,Consultant,,,Jan 2020,Dec 2020\n';

// LinkedIn puts notes above the header in some files.
const SKILLS_CSV = 'Notes:\n"Some text LinkedIn adds"\n\nName\nReact\nreact\nSystem Design\n';

const EDUCATION_CSV =
  'School Name,Start Date,End Date,Notes,Degree Name,Activities\n' +
  'St John College of Engineering and Management,2013,2017,,B.E. Computer Engineering,\n';

const CERTS_CSV = 'Name,Url,Authority,Started On,Finished On,License Number\nAWS SAA,https://aws.example/c,Amazon,Jan 2022,,X1\n';
const PROJECTS_CSV = 'Title,Description,Url,Started On,Finished On\nOpen Tool,A CLI,javascript:alert(1),2019,2020\n';

const SHARES_CSV =
  'Date,ShareLink,ShareCommentary,SharedUrl,MediaUrl,Visibility\n' +
  '2024-03-10 09:15:00,https://www.linkedin.com/feed/update/urn%3Ali%3Ashare%3A111,"Hiring two interns for the ""payments"" team.\n\n\n\nDM me.",,,MEMBER_NETWORK\n' +
  '2023-11-02 18:00:00,https://www.linkedin.com/feed/update/urn%3Ali%3Ashare%3A222,Notes from my talk,https://slides.example/talk,,CONNECTIONS_ONLY\n' +
  '2023-06-01 08:00:00,https://www.linkedin.com/feed/update/urn%3Ali%3Ashare%3A333,,,,MEMBER_NETWORK\n' +
  '2022-01-20 12:30:00,https://www.linkedin.com/feed/update/urn%3Ali%3Ashare%3A444,,,https://media.example/p.jpg,MEMBER_NETWORK\n' +
  'not a date,javascript:alert(1),Broken row,,,MEMBER_NETWORK\n' +
  '2024-03-10 09:15:00,https://www.linkedin.com/feed/update/urn%3Ali%3Ashare%3A111,Duplicate of the first,,,MEMBER_NETWORK\n';

const ARTICLE_HTML =
  '<html><head><title>Ignored title</title><style>p{color:red}</style></head><body>' +
  '<h1><a href="https://www.linkedin.com/pulse/system-design-tips-test-person">System Design &amp; You</a></h1>' +
  '<p class="created">Created on 2023-08-01 10:00</p><p class="published">Published on 2023-08-02 11:30</p>' +
  '<div><p>First paragraph with &quot;quotes&quot; &#8212; and a dash.</p><ul><li>One</li><li>Two</li></ul>' +
  '<img src="https://media.example/a.png"><script>alert(1)</script><p>Last line.</p></div></body></html>';

function zip(files: Record<string, string>): Uint8Array {
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));
}

function run() {
  console.log('Running linkedin/export.test.ts...');

  // CSV: quotes, doubled quotes, embedded newline, BOM
  const rows = parseCsv('﻿a,b\n"x, y","say ""hi""\nthere"\n');
  assert.deepStrictEqual(rows, [['a', 'b'], ['x, y', 'say "hi"\nthere']]);
  assert.strictEqual(readTable(SKILLS_CSV, 'Name').length, 3);

  // Dates
  assert.strictEqual(parseLinkedInDate('Jan 2020'), '2020-01');
  assert.strictEqual(parseLinkedInDate('Sept 2019'), '2019-09');
  assert.strictEqual(parseLinkedInDate('2018'), '2018');
  assert.strictEqual(parseLinkedInDate('2018-3-05'), '2018-03');
  assert.strictEqual(parseLinkedInDate('4/2016'), '2016-04');
  assert.strictEqual(parseLinkedInDate(''), null);
  assert.strictEqual(parseLinkedInDate('soon'), null);
  assert.strictEqual(formatRange('2021-03', null), 'Mar 2021 – Present');
  assert.strictEqual(formatRange('2013', '2017'), '2013 – 2017');

  // URLs: only http(s), bare www. upgraded, script schemes dropped
  assert.strictEqual(safeUrl('javascript:alert(1)'), null);
  assert.strictEqual(safeUrl('www.a.com'), 'https://www.a.com/');
  assert.deepStrictEqual(extractUrls('[PORTFOLIO:https://a.dev,OTHER:https://a.dev]'), ['https://a.dev/']);

  // Whole archive: nested folder, extra files that must be ignored
  const result = readLinkedInZip(
    zip({
      'Basic_LinkedInDataExport_10-16-2026/Profile.csv': PROFILE_CSV,
      'Basic_LinkedInDataExport_10-16-2026/Positions.csv': POSITIONS_CSV,
      'Basic_LinkedInDataExport_10-16-2026/Skills.csv': SKILLS_CSV,
      'Basic_LinkedInDataExport_10-16-2026/Education.csv': EDUCATION_CSV,
      'Basic_LinkedInDataExport_10-16-2026/Certifications.csv': CERTS_CSV,
      'Basic_LinkedInDataExport_10-16-2026/Projects.csv': PROJECTS_CSV,
      'Basic_LinkedInDataExport_10-16-2026/messages.csv': 'FROM,TO,CONTENT\nA,B,private\n',
      'Basic_LinkedInDataExport_10-16-2026/Connections.csv': 'First Name,Last Name\nA,B\n',
    }),
  );

  assert.strictEqual(result.headline, 'Senior Engineer at Example Corp');
  assert.strictEqual(result.summary, 'Builds things.\nLikes mentoring.');
  assert.strictEqual(result.location, 'Mumbai, Maharashtra, India');
  assert.deepStrictEqual(result.websites, ['https://test.dev/', 'https://www.example.com/']);
  assert.deepStrictEqual(result.filesFound.length, 6);

  // Nothing private leaks into the result
  const flat = JSON.stringify(result);
  assert.ok(!flat.includes('Secret Street'), 'address must not be read');
  assert.ok(!flat.includes('1995'), 'birth date must not be read');
  assert.ok(!flat.includes('400001'), 'zip code must not be read');
  assert.ok(!flat.includes('private'), 'messages must not be read');

  // Positions: current first, multi-line description kept, quotes unescaped
  assert.strictEqual(result.positions.length, 3);
  assert.strictEqual(result.positions[0].company, 'Example Corp');
  assert.strictEqual(result.positions[0].end, null);
  assert.strictEqual(result.positions[0].description, 'Leads the "payments" team.\nHires interns.');
  assert.strictEqual(currentPosition(result.positions)?.title, 'Senior Engineer');

  // Skills deduped case-insensitively
  assert.deepStrictEqual(result.skills, ['React', 'System Design']);

  assert.strictEqual(result.education[0].degree, 'B.E. Computer Engineering');
  assert.strictEqual(result.certifications[0].url, 'https://aws.example/c');
  assert.strictEqual(result.projects[0].url, null, 'javascript: link must be dropped');

  // Experience: Jul 2017 → Oct 2026 continuous (side gig overlaps) = 9 full years
  assert.strictEqual(experienceYears(result.positions, new Date(2026, 9, 16)), 9);
  assert.strictEqual(experienceYears([], new Date()), null);

  // Bad input
  assert.throws(() => readLinkedInZip(strToU8('not a zip')), LinkedInExportError);
  assert.throws(() => readLinkedInZip(zip({ 'readme.txt': 'hi' })), LinkedInExportError);

  // Schema accepts what the parser produces, rejects unknown keys and bad links
  const ok = linkedinImportSchema.safeParse({
    headline: result.headline,
    positions: result.positions,
    education: result.education,
    certifications: result.certifications,
    projects: result.projects,
    skills: result.skills,
    websites: result.websites,
  });
  assert.ok(ok.success, JSON.stringify(!ok.success && ok.error.issues));
  assert.ok(!linkedinImportSchema.safeParse({ user_id: 'x' }).success, 'unknown keys rejected');
  assert.ok(
    !linkedinImportSchema.safeParse({ projects: [{ ...result.projects[0], url: 'javascript:alert(1)' }] }).success,
    'script links rejected',
  );

  // A profile-only archive has no posts
  assert.deepStrictEqual(result.posts, []);

  // Share dates are UTC; impossible dates rejected
  assert.strictEqual(parseShareDate('2024-03-10 09:15:00'), '2024-03-10T09:15:00.000Z');
  assert.strictEqual(parseShareDate('2024-03-10'), '2024-03-10T00:00:00.000Z');
  assert.strictEqual(parseShareDate('2024-02-30 10:00:00'), null);
  assert.strictEqual(parseShareDate('yesterday'), null);

  // Posts: blank lines collapsed, quotes unescaped, bare reposts and undated rows skipped
  const shares = parseShares(SHARES_CSV);
  assert.strictEqual(shares.length, 4, 'bare repost and undated row skipped; duplicate kept until merge');
  assert.strictEqual(shares[0].body, 'Hiring two interns for the "payments" team.\n\nDM me.');
  assert.strictEqual(shares[0].externalId, 'https://www.linkedin.com/feed/update/urn%3Ali%3Ashare%3A111');
  assert.strictEqual(shares[1].sharedUrl, 'https://slides.example/talk');
  assert.strictEqual(shares[1].connectionsOnly, true);
  assert.strictEqual(shares[0].connectionsOnly, false);
  const mediaOnly = shares.find((p) => p.externalId.endsWith('444'));
  assert.ok(mediaOnly && mediaOnly.hasMedia && mediaOnly.body === '', 'media-only post kept');
  assert.ok(!shares.some((p) => p.externalId.endsWith('333')), 'post with nothing in it skipped');

  // Articles: title from <h1>, published date, text only, no script, entities decoded
  const article = parseArticle('2023-08-01 10:00:00.0-system-design.html', ARTICLE_HTML);
  assert.ok(article);
  assert.strictEqual(article.kind, 'article');
  assert.strictEqual(article.title, 'System Design & You');
  assert.strictEqual(article.url, 'https://www.linkedin.com/pulse/system-design-tips-test-person');
  assert.strictEqual(article.postedAt, '2023-08-02T11:30:00.000Z');
  assert.strictEqual(article.body, 'First paragraph with "quotes" — and a dash.\n\n• One\n\n• Two\n\nLast line.');
  assert.ok(article.hasMedia);
  assert.ok(!article.body.includes('alert') && !article.body.includes('<'), 'no markup or script in article text');
  assert.ok(!article.body.includes('Published on'), 'date lines stripped');
  assert.strictEqual(parseArticle('undated.html', '<h1>No date anywhere</h1><p>Body</p>'), null);

  // A posts-only archive is accepted; posts merged newest first, deduplicated by link
  const postsOnly = readLinkedInZip(
    zip({
      'Complete_LinkedInDataExport/Shares.csv': SHARES_CSV,
      'Complete_LinkedInDataExport/Articles/Articles/2023-08-01 10:00:00.0-system-design.html': ARTICLE_HTML,
      'Complete_LinkedInDataExport/messages.csv': 'FROM,TO,CONTENT\nA,B,private\n',
    }),
  );
  assert.strictEqual(postsOnly.filesFound.length, 0);
  assert.deepStrictEqual(
    postsOnly.posts.map((p) => p.kind + ':' + p.postedAt.slice(0, 10)),
    ['post:2024-03-10', 'post:2023-11-02', 'article:2023-08-02', 'post:2022-01-20'],
  );
  assert.ok(!JSON.stringify(postsOnly).includes('private'), 'messages must not be read');

  // Posts schema accepts parser output and rejects what the database would
  const postsOk = linkedinPostsSchema.safeParse({ posts: postsOnly.posts.map(toPostPayload) });
  assert.ok(postsOk.success, JSON.stringify(!postsOk.success && postsOk.error.issues));
  const one = toPostPayload(postsOnly.posts[0]);
  assert.ok(!linkedinPostsSchema.safeParse({ posts: [] }).success, 'empty batch rejected');
  assert.ok(!linkedinPostsSchema.safeParse({ posts: [{ ...one, user_id: 'x' }] }).success, 'unknown keys rejected');
  assert.ok(!linkedinPostsSchema.safeParse({ posts: [{ ...one, body: 'x'.repeat(3001) }] }).success, 'long post rejected');
  assert.ok(linkedinPostsSchema.safeParse({ posts: [{ ...one, kind: 'article', body: 'x'.repeat(3001) }] }).success, 'long article allowed');
  assert.ok(!linkedinPostsSchema.safeParse({ posts: [{ ...one, shared_url: 'javascript:alert(1)' }] }).success, 'script links rejected');
  assert.ok(!linkedinPostsSchema.safeParse({ posts: [{ ...one, posted_at: 'last week' }] }).success, 'bad dates rejected');

  console.log('All linkedin export tests passed.');
}

run();
