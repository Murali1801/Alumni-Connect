import assert from 'assert';
import { strToU8, zipSync } from 'fflate';
import {
  currentPosition,
  experienceYears,
  extractUrls,
  formatRange,
  LinkedInExportError,
  parseCsv,
  parseLinkedInDate,
  readLinkedInZip,
  readTable,
  safeUrl,
} from './export';
import { linkedinImportSchema } from './schema';

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

  console.log('All linkedin export tests passed.');
}

run();
