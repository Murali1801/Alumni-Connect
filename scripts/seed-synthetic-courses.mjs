/**
 * Fills the Learning hub: twelve courses written by synthetic alumni (the
 * SYNTH_* records from seed-synthetic-alumni.mjs), each matched to the
 * author's branch, with modules of readings, videos, resources and quizzes;
 * four upcoming live workshops; and enrolments with progress for the demo
 * student (student1@v3.demo.com) and the showcase demo students.
 *
 * Every course and workshop belongs to a synthetic author, so --purge removes
 * exactly what this script wrote: deleting the courses and workshops cascades
 * to their modules, lessons, enrolments, progress and seats. Nothing here
 * writes notifications.
 *
 * Videos are real public YouTube lectures (checked against YouTube's oEmbed
 * endpoint when this was written); resource links are official docs or
 * long-standing free references.
 *
 *   node scripts/seed-synthetic-courses.mjs           # dry run: checks content, prints a summary
 *   node scripts/seed-synthetic-courses.mjs --commit  # writes
 *   node scripts/seed-synthetic-courses.mjs --purge   # removes what this script wrote
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const COMMIT = process.argv.includes('--commit');
const PURGE = process.argv.includes('--purge');
const DEMO_STUDENT = 'student1@v3.demo.com';

const env = Object.fromEntries(
  fs
    .readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/* ---------- deterministic pseudo-randomness so reruns are stable ---------- */
let seed = 1010;
function rnd() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pickN = (arr, n) => {
  const copy = [...arr];
  const out = [];
  while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rnd() * copy.length), 1)[0]);
  return out;
};
const chance = (p) => rnd() < p;
const md = (...lines) => lines.join('\n');
const DAY = 86_400_000;

/* ------------------------------ lesson helpers --------------------------- */

const text = (t, min, body) => ({ t, k: 'text', min, body });
const video = (t, min, id, body = '') => ({ t, k: 'video', min, url: `https://www.youtube.com/watch?v=${id}`, body });
const link = (t, min, url, body) => ({ t, k: 'link', min, url, body });
/** q: prompt, o: options, a: index of the correct option, e: explanation */
const quiz = (t, min, questions, body = '') => ({ t, k: 'quiz', min, quiz: questions, body });

/* -------------------------------- courses -------------------------------- */

const COURSES = [
  {
    key: 'dsa',
    branch: 'COMP',
    author: /SDE|Software Engineer|Backend/,
    title: 'DSA for placements',
    summary:
      'The data structures and algorithm patterns that keep coming up in campus coding rounds: complexity, arrays, hashing, linked lists, stacks, trees and graphs, with a practice plan that fits around college.',
    level: 'intermediate',
    cover: 'primary',
    topics: ['Placements', 'Programming'],
    skills: ['Data Structures', 'Algorithms', 'Problem Solving', 'Java'],
    hours: 18,
    modules: [
      {
        title: 'Complexity and arrays',
        lessons: [
          text('Big-O without the fear', 12, md(
            'Interviewers ask for the time and space complexity of every solution, so get comfortable estimating it quickly.',
            '',
            '## What Big-O measures',
            'Big-O describes how the work grows as the input size **n** grows. We drop constants and keep the dominant term: 3n² + 5n + 20 is O(n²).',
            '',
            '## The classes you will meet',
            '- O(1): array index, hash map lookup on average',
            '- O(log n): binary search, balanced tree height',
            '- O(n): one pass over the input',
            '- O(n log n): good comparison sorts such as merge sort',
            '- O(n²): two nested loops over the input',
            '',
            '## A useful rule of thumb',
            'A judge runs roughly 10⁸ simple operations per second. If n is 10⁵, an O(n²) solution does about 10¹⁰ steps and will time out, so you need O(n log n) or better.',
            '',
            '```',
            'for (int i = 0; i < n; i++)        // n times',
            '    for (int j = i; j < n; j++)    // n - i times',
            '        count++;                   // total n(n+1)/2, so O(n²)',
            '```',
            '',
            'Space complexity counts the extra memory you allocate, not the input itself.'
          )),
          video('Big-O notation in five minutes', 6, '__vX2sjlpXU', 'A short recap of the notation. Pause and predict the complexity of each example before the answer appears.'),
          text('Two pointers and sliding window', 15, md(
            'Two patterns turn many O(n²) array problems into O(n).',
            '',
            '## Two pointers on a sorted array',
            'To find a pair with a given sum, start one pointer at each end. If the sum is too small, move the left pointer right; if too large, move the right pointer left.',
            '',
            '```',
            'int l = 0, r = a.length - 1;',
            'while (l < r) {',
            '    int s = a[l] + a[r];',
            '    if (s == target) return true;',
            '    if (s < target) l++; else r--;',
            '}',
            'return false;',
            '```',
            '',
            'Each step moves one pointer, so it runs in O(n) time with O(1) extra space.',
            '',
            '## Sliding window',
            'For “longest substring without repeating characters”, grow the window on the right and shrink it from the left whenever a character repeats. Every character enters and leaves the window at most once, so the whole scan is O(n).'
          )),
          quiz('Complexity check', 8, [
            { q: 'Binary search on a sorted array of n elements takes how long in the worst case?', o: ['O(n)', 'O(log n)', 'O(n log n)', 'O(1)'], a: 1, e: 'Each comparison halves the remaining range, so about log₂ n steps are needed.' },
            { q: 'An outer loop runs i from 0 to n−1 and an inner loop runs j from i to n−1. What is the total complexity?', o: ['O(n)', 'O(n log n)', 'O(n²)', 'O(2ⁿ)'], a: 2, e: 'The inner loop runs n + (n−1) + … + 1 = n(n+1)/2 times, which is O(n²).' },
            { q: 'For n = 10⁶, which complexity is fastest as n grows?', o: ['O(n²)', 'O(n√n)', 'O(2ⁿ)', 'O(n log n)'], a: 3, e: 'n log n grows slower than n√n, n² and 2ⁿ.' },
            { q: 'Finding a pair with a given sum in a sorted array using two pointers needs:', o: ['O(n) time and O(1) extra space', 'O(n²) time and O(1) space', 'O(n log n) time and O(n) space', 'O(1) time'], a: 0, e: 'Each step moves one pointer inward, so at most n steps, and only two indices are stored.' },
          ]),
        ],
      },
      {
        title: 'Strings and hashing',
        lessons: [
          text('Hash maps: the placement superpower', 12, md(
            'A hash map gives average O(1) insert and lookup. Many “find a pair / count occurrences” questions become one pass with a map.',
            '',
            '## Two Sum in one pass',
            '```',
            'Map<Integer, Integer> seen = new HashMap<>();',
            'for (int i = 0; i < a.length; i++) {',
            '    Integer j = seen.get(target - a[i]);',
            '    if (j != null) return new int[] { j, i };',
            '    seen.put(a[i], i);',
            '}',
            '```',
            'This is O(n) time and O(n) space, compared with O(n²) for checking every pair.',
            '',
            '## Frequency counting',
            'To check if two lowercase strings are anagrams, count letters in an int[26] array: add for the first string, subtract for the second, and check that every count is zero. That is O(n) time.',
            '',
            '## The catch',
            'Lookups are O(1) on average. With many collisions the worst case degrades, which is why interviewers sometimes ask about it.'
          )),
          text('Prefix sums', 10, md(
            'Prefix sums answer “sum of a subarray” questions in O(1) after O(n) preparation.',
            '',
            'Define P[0] = 0 and P[i] = a[0] + … + a[i−1]. Then the sum of a[l..r] (inclusive) is **P[r+1] − P[l]**.',
            '',
            '## Counting subarrays with sum k',
            'Walk through the array keeping a running sum and a map from prefix sum to how often it has appeared. At each step, add map[running − k] to the answer, then record the running sum. One pass, O(n).'
          )),
          quiz('Hashing and prefix sums', 8, [
            { q: 'What is the average time for a lookup in a Java HashMap?', o: ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'], a: 0, e: 'Hashing jumps straight to a bucket; only collisions add work.' },
            { q: 'Two Sum on an unsorted array using a hash map runs in:', o: ['O(n²) time, O(1) space', 'O(n) time, O(n) space', 'O(n log n) time, O(1) space', 'O(log n) time, O(n) space'], a: 1, e: 'One pass over the array, storing each value seen so far in the map.' },
            { q: 'With P[0] = 0 and P[i] = sum of the first i elements, the sum of a[l..r] inclusive is:', o: ['P[r] − P[l]', 'P[r] − P[l−1]', 'P[r+1] − P[l]', 'P[r+1] − P[l+1]'], a: 2, e: 'P[r+1] covers a[0..r] and P[l] covers a[0..l−1]; the difference is a[l..r].' },
            { q: 'Checking whether two strings of length n are anagrams with a 26-letter count array takes:', o: ['O(n²)', 'O(n log n)', 'O(n)', 'O(1)'], a: 2, e: 'One pass over each string plus a fixed 26-entry check.' },
          ]),
        ],
      },
      {
        title: 'Linked lists, stacks and queues',
        lessons: [
          text('Pointer problems that repeat', 15, md(
            '## Reverse a linked list in place',
            'Keep three references: prev, curr and next. At each node, save next, point curr back to prev, then move both forward.',
            '```',
            'Node prev = null, curr = head;',
            'while (curr != null) {',
            '    Node next = curr.next;',
            '    curr.next = prev;',
            '    prev = curr;',
            '    curr = next;',
            '}',
            'return prev;',
            '```',
            'O(n) time, O(1) extra space.',
            '',
            '## Detect a cycle',
            'Floyd’s algorithm moves a slow pointer one step and a fast pointer two steps. If there is a cycle they meet; if fast reaches null there is none.',
            '',
            '## Stacks and queues',
            '- A stack is last in, first out. Use it for balanced brackets: push openers, pop and match on closers.',
            '- A queue is first in, first out. Breadth-first search uses one.',
            '- A monotonic stack finds the next greater element for every position in O(n).'
          )),
          quiz('Lists, stacks and queues', 6, [
            { q: 'Which structure is the natural fit for checking balanced brackets like {[()]}?', o: ['Queue', 'Stack', 'Heap', 'Hash set'], a: 1, e: 'The most recent unmatched opener must match the next closer: last in, first out.' },
            { q: 'Floyd’s cycle detection works by:', o: ['Sorting the nodes', 'Storing every visited node in a set', 'Moving two pointers at different speeds', 'Reversing the list twice'], a: 2, e: 'A fast pointer gains one step per move on the slow one, so inside a cycle they must meet. It needs only O(1) extra space.' },
            { q: 'Reversing a singly linked list of n nodes in place needs:', o: ['O(n) time, O(1) extra space', 'O(n) time, O(n) extra space', 'O(n²) time, O(1) extra space', 'O(log n) time'], a: 0, e: 'Each node is visited once and only three references are kept.' },
            { q: 'A queue removes elements in which order?', o: ['Last in, first out', 'First in, first out', 'Smallest first', 'Random'], a: 1, e: 'Queues are FIFO; a priority queue is the one that removes the smallest first.' },
          ]),
        ],
      },
      {
        title: 'Trees and graphs',
        lessons: [
          text('Traversals and searches', 15, md(
            '## Binary tree traversals',
            '- Preorder: node, left, right',
            '- Inorder: left, node, right. On a binary search tree this visits keys in ascending order.',
            '- Postorder: left, right, node',
            '- Level order: breadth-first with a queue',
            '',
            '## BFS and DFS on graphs',
            'Store a graph as an adjacency list and keep a visited set so each vertex is processed once: O(V + E).',
            '- BFS explores level by level, so in an unweighted graph it finds the shortest path in number of edges.',
            '- DFS goes deep first, using recursion or an explicit stack. It suits connected components, cycle detection and topological sort.',
            '',
            'A balanced BST with n nodes has height O(log n), which is why search, insert and delete are O(log n) there.'
          )),
          video('Algorithms and data structures, full lecture', 30, '8hly31xKli0', 'Watch the sections on recursion, sorting and searching. The whole lecture is long; it is fine to come back to it.'),
          quiz('Trees and graphs', 8, [
            { q: 'An inorder traversal of a binary search tree visits the keys in:', o: ['Ascending order', 'Descending order', 'Insertion order', 'Level order'], a: 0, e: 'Left subtree keys are smaller and right subtree keys larger, so left–node–right is sorted.' },
            { q: 'To find the path with the fewest edges in an unweighted graph, use:', o: ['DFS', 'BFS', 'Dijkstra with a max-heap', 'Binary search'], a: 1, e: 'BFS reaches every vertex at distance d before any vertex at distance d+1.' },
            { q: 'The height of a balanced binary search tree with n nodes is:', o: ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'], a: 1, e: 'Each level doubles the number of nodes it can hold.' },
            { q: 'Depth-first search is usually implemented with:', o: ['A queue', 'A stack, explicit or the recursion call stack', 'A hash map only', 'A sorted array'], a: 1, e: 'DFS backtracks to the most recent unexplored branch, which is stack behaviour.' },
          ]),
        ],
      },
      {
        title: 'Your practice plan',
        lessons: [
          text('Eight weeks to placement-ready', 8, md(
            'Practise by pattern, not by random problem.',
            '',
            '1. Weeks 1–2: arrays, two pointers, sliding window, prefix sums',
            '2. Weeks 3–4: hashing, strings, stacks and queues',
            '3. Weeks 5–6: linked lists, binary search, recursion and backtracking',
            '4. Weeks 7–8: trees, graphs (BFS and DFS) and a few easy dynamic programming problems',
            '',
            'Aim for two or three problems a day. After each one, write one line on the pattern it used. Before your campus drive, redo the problems you got wrong, out loud, as if an interviewer were listening.'
          )),
          link('NeetCode roadmap', 5, 'https://neetcode.io/roadmap', 'A free, pattern-wise list of problems that matches the order of this course. Start with the Arrays & Hashing group.'),
        ],
      },
    ],
  },

  {
    key: 'aptitude',
    branch: 'IT',
    author: /Consultant|Business Analyst|Project Manager/,
    title: 'Cracking aptitude rounds',
    summary:
      'The quantitative and logical reasoning topics that decide the first round of most campus drives, with shortcuts that save time and practice sets with worked answers.',
    level: 'beginner',
    cover: 'warning',
    topics: ['Placements', 'Aptitude'],
    skills: ['Quantitative Aptitude', 'Logical Reasoning'],
    hours: 10,
    modules: [
      {
        title: 'Percentages, profit and loss',
        lessons: [
          text('Percentages that come up every time', 12, md(
            '## Successive changes',
            'Two successive changes of a% and b% give a net change of **a + b + ab/100** percent. Use negative numbers for decreases.',
            '- Up 20% then down 20%: 20 − 20 − 400/100 = −4%, a net fall of 4%.',
            '- Up 10% then up 20%: 10 + 20 + 200/100 = 32%.',
            '',
            '## Profit and loss',
            'Profit and loss percentages are on the **cost price** unless the question says otherwise.',
            '- Bought at ₹400, sold at ₹500: profit ₹100, which is 25% of cost.',
            '',
            '## Discounts',
            'Discount is on the **marked price**. Marked at ₹1,000 with 10% off sells at ₹900; if it cost ₹750, the profit is ₹150, or 20%.',
            '',
            '## Keeping spending constant',
            'If a price rises by r%, consumption must fall by r/(100 + r) × 100% to keep spending the same. For a 25% rise: 25/125 = 20%.'
          )),
          quiz('Percentages practice', 10, [
            { q: 'A number is increased by 10% and then by 20%. What is the overall increase?', o: ['30%', '32%', '28%', '35%'], a: 1, e: '10 + 20 + (10 × 20)/100 = 32%.' },
            { q: 'An item bought for ₹800 is sold for ₹920. What is the profit percentage?', o: ['12%', '13.5%', '15%', '18%'], a: 2, e: 'Profit ₹120 on a cost of ₹800 is 120/800 = 15%.' },
            { q: 'Sugar becomes 25% more expensive. By how much must a family cut consumption to spend the same?', o: ['25%', '20%', '18%', '22.5%'], a: 1, e: '25/(100 + 25) = 1/5 = 20%.' },
            { q: 'An item marked ₹1,200 gets two successive discounts of 10% and 5%. What is the selling price?', o: ['₹1,020', '₹1,026', '₹1,032', '₹1,050'], a: 1, e: '1,200 × 0.90 = 1,080, then 1,080 × 0.95 = 1,026.' },
          ]),
        ],
      },
      {
        title: 'Time, speed, distance and work',
        lessons: [
          text('Formulas worth memorising', 12, md(
            '- km/h to m/s: multiply by 5/18. So 72 km/h = 20 m/s.',
            '- Average speed over two equal distances at x and y: **2xy / (x + y)**, not (x + y)/2.',
            '- A train crosses a pole in (its length ÷ its speed), and a platform in (train + platform length) ÷ speed.',
            '- Moving in opposite directions, speeds add; in the same direction, subtract.',
            '',
            '## Work',
            'Think in rates. If A finishes a job in a days, A does 1/a of it per day. Together, A and B take **ab / (a + b)** days.',
            '',
            'Example: A takes 10 days and B 15 days. Together: 150/25 = 6 days.'
          )),
          quiz('Speed and work practice', 10, [
            { q: 'What is 72 km/h in metres per second?', o: ['18 m/s', '20 m/s', '24 m/s', '25 m/s'], a: 1, e: '72 × 5/18 = 20.' },
            { q: 'A car goes from A to B at 40 km/h and returns at 60 km/h. What is the average speed for the round trip?', o: ['50 km/h', '48 km/h', '45 km/h', '52 km/h'], a: 1, e: '2 × 40 × 60 / (40 + 60) = 4,800/100 = 48 km/h.' },
            { q: 'A 150 m train runs at 54 km/h. How long does it take to pass a pole?', o: ['8 s', '10 s', '12 s', '15 s'], a: 1, e: '54 km/h = 15 m/s; 150/15 = 10 seconds.' },
            { q: 'A can finish a job in 10 days and B in 15 days. Working together, they take:', o: ['5 days', '6 days', '7.5 days', '12.5 days'], a: 1, e: '10 × 15 / (10 + 15) = 6 days.' },
            { q: 'Trains of 120 m and 180 m run towards each other at 40 km/h and 50 km/h. How long do they take to cross each other?', o: ['10 s', '12 s', '15 s', '18 s'], a: 1, e: 'Relative speed 90 km/h = 25 m/s; total length 300 m; 300/25 = 12 s.' },
          ]),
        ],
      },
      {
        title: 'Numbers, ratios and averages',
        lessons: [
          text('Shortcuts for number questions', 12, md(
            '## Divisibility',
            '- By 3 or 9: the sum of the digits is divisible by 3 or 9.',
            '- By 4: the last two digits form a multiple of 4. By 8: the last three digits.',
            '- By 11: the difference between the sums of alternate digits is 0 or a multiple of 11.',
            '',
            '## HCF and LCM',
            'For two numbers, **HCF × LCM = product of the numbers**.',
            '',
            '## Combining ratios',
            'If A:B = 2:3 and B:C = 4:5, make B the same in both: 8:12 and 12:15, so A:B:C = 8:12:15.',
            '',
            '## Averages',
            'Work with totals. Five numbers averaging 20 total 100.'
          )),
          quiz('Numbers practice', 8, [
            { q: 'Which of these is divisible by 11?', o: ['123456', '918082', '456789', '234567'], a: 1, e: 'For 918082: (9 + 8 + 8) − (1 + 0 + 2) = 22, a multiple of 11. The others give −3.' },
            { q: 'The HCF of two numbers is 12 and their LCM is 360. One number is 72. What is the other?', o: ['48', '60', '90', '120'], a: 1, e: '12 × 360 / 72 = 60.' },
            { q: 'The average of five numbers is 20. After removing one, the average of the rest is 18. Which number was removed?', o: ['22', '24', '28', '30'], a: 2, e: 'Total was 100; the remaining four total 72; 100 − 72 = 28.' },
            { q: 'If A:B = 2:3 and B:C = 4:5, then A:B:C is:', o: ['2:3:5', '8:12:15', '6:9:10', '4:6:5'], a: 1, e: 'Scale to make B equal: 8:12 and 12:15.' },
          ]),
        ],
      },
      {
        title: 'Logical reasoning',
        lessons: [
          text('Series, codes, relations and syllogisms', 12, md(
            '- **Number series:** write the differences between terms; if they are not constant, take differences again or look for squares and cubes.',
            '- **Coding–decoding:** compare letter positions (A = 1 … Z = 26) between the word and its code.',
            '- **Blood relations:** draw a small family tree as you read; never solve it in your head.',
            '- **Seating arrangements:** fix one person first, then place the others clue by clue.',
            '- **Syllogisms:** draw Venn diagrams. A conclusion follows only if it is true in every possible diagram.'
          )),
          quiz('Reasoning practice', 8, [
            { q: 'What comes next: 2, 6, 12, 20, 30, ?', o: ['40', '42', '44', '36'], a: 1, e: 'The differences are 4, 6, 8, 10, so the next is 12: 30 + 12 = 42.' },
            { q: 'If CAT is written as DBU, how is DOG written?', o: ['EPH', 'EOH', 'CNF', 'EPG'], a: 0, e: 'Each letter moves one place forward: D→E, O→P, G→H.' },
            { q: 'Pointing to a man, Riya says, “He is the son of my mother’s only brother.” How is the man related to Riya?', o: ['Brother', 'Uncle', 'Cousin', 'Nephew'], a: 2, e: 'Her mother’s brother is her maternal uncle; his son is her cousin.' },
            { q: 'All pens are books. Some books are bags. Does “Some pens are bags” follow?', o: ['Yes, definitely', 'Not necessarily', 'It is definitely false', 'Only if all books are bags'], a: 1, e: 'The books that are bags may not be the ones that are pens, so the conclusion is possible but not certain.' },
          ]),
          link('IndiaBix aptitude practice sets', 20, 'https://www.indiabix.com/aptitude/questions-and-answers/', 'Topic-wise practice questions with solutions. Time yourself: about one minute per question is the pace most online tests need.'),
        ],
      },
    ],
  },

  {
    key: 'autocad',
    branch: 'CIVIL',
    author: /Site Engineer|Design Engineer|Project Engineer/,
    title: 'AutoCAD for site engineers',
    summary:
      'Draw, read and mark up building drawings the way site and design offices do: precise input, editing, layers, dimensions, blocks and plotting to scale.',
    level: 'beginner',
    cover: 'chart-4',
    topics: ['Civil', 'Tools'],
    skills: ['AutoCAD', 'Drafting', 'Construction Drawings'],
    hours: 8,
    modules: [
      {
        title: 'Getting around AutoCAD',
        lessons: [
          text('The screen, units and drawing aids', 12, md(
            '## Model and layout',
            'Draw everything in **model space at full size** (1:1, in millimetres for building work in India). Layouts (paper space) arrange scaled views of the model for printing.',
            '',
            '## Navigation',
            '- Scroll the mouse wheel to zoom; hold the wheel to pan.',
            '- Type Z, Enter, E, Enter to zoom to the extents of everything drawn.',
            '',
            '## Drawing aids worth knowing by key',
            '- F3: object snap on or off',
            '- F8: Ortho (horizontal and vertical lines only)',
            '- F10: polar tracking',
            '- F12: dynamic input near the cursor',
            '',
            'Watch the command line. AutoCAD tells you what it expects next, and most mistakes come from not reading the prompt.'
          )),
          link('AutoCAD help: getting started', 10, 'https://help.autodesk.com/view/ACD/2025/ENU/', 'Autodesk’s official help. Use the search for any command name you meet in this course.'),
          quiz('Navigation check', 5, [
            { q: 'Which function key toggles Ortho mode?', o: ['F3', 'F8', 'F10', 'F12'], a: 1, e: 'F8 is Ortho. F3 is object snap, F10 polar tracking and F12 dynamic input.' },
            { q: 'Which keystrokes zoom to show everything in the drawing?', o: ['Z, Enter, E, Enter', 'P, Enter', 'R, Enter, E', 'Ctrl+E'], a: 0, e: 'ZOOM with the Extents option.' },
            { q: 'At what scale do you draw a building plan in model space?', o: ['1:100', '1:50', 'Full size, 1:1', 'Whatever fits the screen'], a: 2, e: 'Model space is always full size. Scale is applied when you set up viewports in a layout.' },
            { q: 'Which key turns object snap (OSNAP) on and off?', o: ['F3', 'F7', 'F9', 'F11'], a: 0, e: 'F3 toggles running object snaps. F7 is the grid and F9 snap.' },
          ]),
        ],
      },
      {
        title: 'Drawing and editing a floor plan',
        lessons: [
          text('Precise input and the editing commands', 15, md(
            '## Typing exact geometry',
            '- Relative Cartesian: @500,200 means 500 to the right and 200 up from the last point.',
            '- Relative polar: @3000<45 means 3,000 long at 45°.',
            '- With Ortho on, point the mouse and type a distance (direct distance entry).',
            '',
            '## Commands you will use every day',
            '- OFFSET: draw the outer face of a wall, then offset it by 230 for a 230 mm brick wall, or 115 for a half-brick partition.',
            '- TRIM and EXTEND: clean up wall junctions.',
            '- FILLET with radius 0: join two lines into a sharp corner.',
            '- MIRROR and ARRAY: repeat symmetric rooms, columns or stairs.',
            '- HATCH: fill sections, such as brickwork or concrete, with a pattern.'
          )),
          quiz('Drafting practice', 8, [
            { q: 'Which input draws a line 3,000 mm long at 45° from the last point?', o: ['3000,45', '@3000<45', '@45<3000', '<45@3000'], a: 1, e: '@ makes it relative; distance comes before the angle.' },
            { q: 'What is the quickest way to draw the inner face of a 230 mm wall from its outer face?', o: ['COPY the line', 'OFFSET by 230', 'MOVE the line 230', 'SCALE the line'], a: 1, e: 'OFFSET creates a parallel line at an exact distance.' },
            { q: 'What does FILLET with a radius of 0 do?', o: ['Deletes both lines', 'Draws a tiny arc', 'Trims or extends two lines so they meet in a sharp corner', 'Nothing'], a: 2, e: 'A zero radius gives a clean corner, which is ideal for wall junctions.' },
            { q: 'How do you enter a point 500 to the right of and 200 above the last point?', o: ['500,200', '@500,200', '@200,500', '#500,200'], a: 1, e: 'Relative Cartesian input uses @x,y.' },
          ]),
        ],
      },
      {
        title: 'Layers, dimensions and blocks',
        lessons: [
          text('Organising a drawing other people can use', 12, md(
            '## Layers',
            'Put walls, doors, windows, columns, dimensions and text on separate layers (for example A-WALL, A-DOOR, S-COLM, DIM). You can then switch them off, colour them and set lineweights independently.',
            '',
            '## Dimensions',
            'Set up one dimension style (DIMSTYLE) with text height and arrows that read well at the plotting scale. DIMLINEAR measures horizontal or vertical distances; DIMCONTINUE chains dimensions from the last one, which is how room sizes along a wall are shown.',
            '',
            '## Blocks',
            'Make a block of anything you repeat: doors, windows, columns, a north arrow. Redefining the block in the Block Editor (BEDIT) updates every copy at once, and blocks keep files smaller.'
          )),
          quiz('Layers and blocks check', 6, [
            { q: 'Why put walls, doors and dimensions on separate layers?', o: ['AutoCAD requires it', 'To control their visibility, colour and lineweight independently', 'It makes the file smaller', 'Layers are needed to print'], a: 1, e: 'Layers are how you manage what shows and how it plots.' },
            { q: 'Which command adds a chain of dimensions continuing from the last one?', o: ['DIMLINEAR', 'DIMALIGNED', 'DIMCONTINUE', 'DIMSTYLE'], a: 2, e: 'DIMCONTINUE picks up from the second extension line of the previous dimension.' },
            { q: 'A door drawn once and used 40 times in a plan should be:', o: ['Copied 40 times', 'A block', 'An external reference', 'Exploded'], a: 1, e: 'Blocks keep every instance consistent and easy to update.' },
            { q: 'How do you change all 40 inserted doors at once?', o: ['Edit each one', 'Redefine the block in the Block Editor', 'Use MATCHPROP', 'Change the layer colour'], a: 1, e: 'Every insertion of a block refers to one definition.' },
          ]),
        ],
      },
      {
        title: 'Plotting and using drawings on site',
        lessons: [
          text('From model to a PDF the site can trust', 12, md(
            '1. Open a layout and insert your title block.',
            '2. Create a viewport and set its scale, for example 1:100 for a floor plan.',
            '3. Lock the viewport so the scale cannot change by accident.',
            '4. Plot with a plot style (CTB) to control lineweights, to the DWG To PDF printer.',
            '',
            '## On site',
            '- At 1:100, 1 mm on paper is 100 mm on site. Never scale off a print: use the written dimensions.',
            '- Mark changes with REVCLOUD and update the revision table.',
            '- Attach the architect’s or consultant’s drawings with XREF instead of copying them in, so you always see their latest version.'
          )),
          quiz('Plotting check', 5, [
            { q: 'On a 1:100 drawing, 1 mm on paper represents:', o: ['1 m on site', '100 mm on site', '10 mm on site', '1 cm on site'], a: 1, e: '1:100 means one unit on paper is a hundred of the same unit on site.' },
            { q: 'Which command draws a revision cloud around a change?', o: ['REVCLOUD', 'CLOUD', 'MARKUP', 'HATCH'], a: 0, e: 'REVCLOUD is the standard way to highlight revisions.' },
            { q: 'How should you use an architect’s drawing in your own file without copying it in?', o: ['INSERT it as a block', 'Attach it as an external reference (XREF)', 'Paste it with Ctrl+V', 'Trace over a PDF'], a: 1, e: 'An XREF stays linked to the source file, so updates come through.' },
          ]),
        ],
      },
    ],
  },

  {
    key: 'embedded',
    branch: 'EXTC',
    author: /Embedded|Firmware/,
    title: 'Embedded C basics',
    summary:
      'C as firmware engineers use it: fixed-width types, bit manipulation, memory-mapped registers and volatile, interrupts, and the serial buses that connect sensors.',
    level: 'beginner',
    cover: 'success',
    topics: ['Embedded', 'Programming'],
    skills: ['Embedded C', 'Microcontrollers', 'Debugging'],
    hours: 12,
    modules: [
      {
        title: 'C for hardware',
        lessons: [
          text('Types and bits', 15, md(
            '## Use fixed-width types',
            'The size of int depends on the compiler and the chip. Firmware uses the types from **stdint.h** so sizes are exact: uint8_t, int16_t, uint32_t and so on.',
            '',
            'Unsigned types wrap around: a uint8_t holding 250 plus 10 becomes 4 (260 − 256).',
            '',
            '## Bit manipulation',
            '```',
            'reg |=  (1U << n);    // set bit n',
            'reg &= ~(1U << n);    // clear bit n',
            'reg ^=  (1U << n);    // toggle bit n',
            'if ((reg >> n) & 1U)  // test bit n',
            '```',
            'The U suffix keeps the shift unsigned, which avoids undefined behaviour when shifting into the top bit.',
            '',
            'Remember: 0x0F | 0xF0 = 0xFF, and 0b1010 ^ 0b0110 = 0b1100.'
          )),
          video('What a microcontroller actually runs', 15, 'hnj-7XwTYRI', 'The first lesson of Miro Samek’s free course. Notice how one line of C becomes a few machine instructions.'),
          quiz('Bits and types', 8, [
            { q: 'Which statement clears bit 3 of reg and leaves the others unchanged?', o: ['reg |= (1U << 3);', 'reg &= ~(1U << 3);', 'reg ^= (1U << 3);', 'reg = 0;'], a: 1, e: 'AND with a mask that has every bit set except bit 3.' },
            { q: 'What is 0x0F | 0xF0?', o: ['0x00', '0xFF', '0x0F', '0xF0'], a: 1, e: 'OR combines the low and high nibbles into all ones.' },
            { q: 'uint8_t x = 250; x += 10; What is x now?', o: ['260', '4', '255', '10'], a: 1, e: 'uint8_t holds 0–255, so 260 wraps to 260 − 256 = 4.' },
            { q: 'Which header defines uint32_t?', o: ['stdio.h', 'stdlib.h', 'stdint.h', 'string.h'], a: 2, e: 'stdint.h provides the exact-width integer types.' },
            { q: 'What is 0b1010 ^ 0b0110?', o: ['0b1110', '0b0010', '0b1100', '0b0000'], a: 2, e: 'XOR is 1 where the bits differ: 1010 and 0110 differ in the top two positions.' },
          ]),
        ],
      },
      {
        title: 'Registers, volatile and memory-mapped I/O',
        lessons: [
          text('Talking to peripherals through memory', 12, md(
            'On a microcontroller, peripherals appear as addresses. Writing to a GPIO output register drives pins high or low. On an STM32F4, for example, GPIOA’s output data register sits at 0x40020014:',
            '```',
            '#define GPIOA_ODR (*(volatile uint32_t *)0x40020014u)',
            'GPIOA_ODR |= (1U << 5);   // drive PA5 high',
            '```',
            '',
            '## Why volatile',
            '**volatile** tells the compiler that a value can change, or that an access matters, outside the code it can see. It must then perform every read and write you wrote, in order, instead of caching or removing them. Use it for:',
            '- hardware registers',
            '- variables changed in an interrupt service routine and read in main',
            '- memory shared with DMA',
            '',
            'A status register you may only read is declared **const volatile**: the program must not write it, but its value can still change.',
            '',
            'volatile does not make an operation atomic and is not a lock.'
          )),
          link('cppreference: volatile in C', 8, 'https://en.cppreference.com/w/c/language/volatile', 'The precise rules, if you want to see what the standard guarantees.'),
          quiz('volatile check', 6, [
            { q: 'Why is a pointer to a hardware register declared volatile?', o: ['To make it faster', 'So the compiler does not cache or optimise away its reads and writes', 'To make the access atomic', 'To put it in flash'], a: 1, e: 'Without volatile, the compiler may read once and reuse the value, or drop writes it thinks are redundant.' },
            { q: 'A flag is set in an interrupt and polled in the main loop. It should be declared:', o: ['static', 'const', 'volatile', 'register'], a: 2, e: 'Otherwise the main loop may never see the change because the read was hoisted out of the loop.' },
            { q: 'Does volatile make counter++ atomic?', o: ['Yes, always', 'No, it is still a separate read, modify and write', 'Only on 32-bit chips', 'Only inside interrupts'], a: 1, e: 'An interrupt can still arrive between the read and the write. Use a critical section or an atomic operation.' },
            { q: 'What does const volatile uint32_t *status mean?', o: ['The value never changes', 'The program must not write it, but its value can change outside the program', 'It is stored in RAM only', 'It is an error'], a: 1, e: 'This is the usual declaration for read-only hardware status registers.' },
          ]),
        ],
      },
      {
        title: 'Interrupts and timing',
        lessons: [
          text('Interrupts without the bugs', 12, md(
            'Polling checks a flag in a loop; an interrupt makes the hardware call your function when the event happens.',
            '',
            '## Rules for interrupt service routines',
            '- Keep them short: read the data, set a flag, clear the interrupt flag, return.',
            '- Do not block, wait or call printf inside them.',
            '- Do the real work in the main loop when it sees the flag.',
            '',
            '## Buttons bounce',
            'A mechanical switch contact bounces for a few milliseconds, producing several edges for one press. Debounce in software by accepting a change only after the input has been stable for roughly 10 to 50 ms, or with an RC filter.',
            '',
            '## Shared multi-byte variables',
            'On an 8-bit chip, reading a 16-bit counter takes two instructions. If the interrupt updates it between them, main sees half old and half new: a torn read. Briefly disable interrupts around the read.'
          )),
          quiz('Interrupts check', 6, [
            { q: 'Which is good practice inside an ISR?', o: ['Print debug messages with printf', 'Wait for the next byte in a loop', 'Set a flag and leave the processing to the main loop', 'Call delay_ms(100)'], a: 2, e: 'Long ISRs delay other interrupts and can miss events.' },
            { q: 'Why does a push button need debouncing?', o: ['Its contacts bounce and produce several transitions per press', 'It draws too much current', 'It needs a pull-down resistor', 'Microcontrollers cannot read buttons'], a: 0, e: 'The bouncing lasts a few milliseconds, long enough to count as several presses.' },
            { q: 'On an 8-bit MCU, main reads a 16-bit counter that an ISR updates. What can go wrong?', o: ['Nothing', 'A torn read: the ISR changes it between the two byte reads', 'The counter overflows faster', 'The compiler refuses to build it'], a: 1, e: 'Protect the read with a short critical section.' },
          ]),
        ],
      },
      {
        title: 'Talking to sensors: UART, I2C and SPI',
        lessons: [
          text('Three buses, compared', 15, md(
            '## UART',
            'Asynchronous, two data lines (TX and RX, crossed between devices). Both ends must use the same baud rate. With the common 8N1 format each byte takes 10 bits (start, 8 data, stop), so 9600 baud carries about 960 bytes per second.',
            '',
            '## I2C',
            'Two shared lines, SDA (data) and SCL (clock). Devices only pull the lines low (open drain), so the bus needs **pull-up resistors**. Each device has an address, commonly 7-bit, so many sensors share the same two wires.',
            '',
            '## SPI',
            'Clock (SCLK), MOSI, MISO and one chip-select line per device. Full duplex and usually much faster than I2C, at the cost of more pins.'
          )),
          video('Arduino course for beginners', 30, 'zJ-LqeX_fLU', 'A hands-on way to try GPIO, serial and sensors before moving to bare-metal C. Skim to the serial communication section.'),
          quiz('Buses check', 6, [
            { q: 'Which two lines does I2C use?', o: ['TX and RX', 'SDA and SCL', 'MOSI and MISO', 'D+ and D−'], a: 1, e: 'Serial data and serial clock.' },
            { q: 'Why does an I2C bus need pull-up resistors?', o: ['To limit current to the sensor', 'Devices only pull the lines low (open drain), so something must pull them high', 'To set the baud rate', 'They are optional decoration'], a: 1, e: 'The resistors return each line to high when nobody is pulling it low.' },
            { q: 'At 9600 baud with 8N1 framing, about how many bytes per second can a UART send?', o: ['9600', '1200', '960', '96'], a: 2, e: 'Each byte takes 10 bits on the wire: 9600 / 10 = 960.' },
            { q: 'Which bus selects each device with its own chip-select line?', o: ['UART', 'I2C', 'SPI', 'CAN'], a: 2, e: 'SPI devices listen only while their CS line is active.' },
          ]),
        ],
      },
    ],
  },

  {
    key: 'sql',
    branch: 'IT',
    author: /Business Analyst|Systems Analyst|Consultant/,
    title: 'SQL for analysts',
    summary:
      'Answer real business questions with SQL: filtering, grouping, joins without double counting, and window functions for rankings and running totals.',
    level: 'beginner',
    cover: 'info',
    topics: ['Data', 'Programming'],
    skills: ['SQL', 'Data Analysis', 'PostgreSQL'],
    hours: 10,
    modules: [
      {
        title: 'SELECT basics',
        lessons: [
          text('Filtering and sorting', 12, md(
            'Every example uses two tables: customers(id, name, city) and orders(id, customer_id, amount, ordered_at).',
            '```',
            'SELECT name, city',
            'FROM customers',
            'WHERE city = \'Mumbai\'',
            'ORDER BY name',
            'LIMIT 10;',
            '```',
            '',
            '## NULL is not a value',
            'Missing values are NULL, and nothing equals NULL, not even NULL. Write **WHERE city IS NULL**, never WHERE city = NULL.',
            '',
            '## The order SQL runs in',
            'FROM, then WHERE, then GROUP BY, then HAVING, then SELECT, then ORDER BY. That is why you cannot use a SELECT alias inside WHERE.'
          )),
          video('SQL full course for beginners', 30, 'HXV3zeQKqGY', 'Follow along in any free database. The first hour covers everything in this module.'),
          quiz('SELECT check', 6, [
            { q: 'How do you find customers whose city is missing?', o: ['WHERE city = NULL', 'WHERE city IS NULL', "WHERE city = ''", 'WHERE NOT city'], a: 1, e: 'Comparisons with NULL are never true; IS NULL is the test for missing values.' },
            { q: 'In which order are these clauses evaluated?', o: ['SELECT, FROM, WHERE, ORDER BY', 'FROM, WHERE, SELECT, ORDER BY', 'WHERE, FROM, SELECT, ORDER BY', 'FROM, SELECT, WHERE, ORDER BY'], a: 1, e: 'Rows are found and filtered before columns are picked; sorting comes last.' },
            { q: 'What does SELECT DISTINCT city FROM customers return?', o: ['Every row', 'Each city once', 'The number of cities', 'Only cities with one customer'], a: 1, e: 'DISTINCT removes duplicate rows from the result.' },
          ]),
        ],
      },
      {
        title: 'Aggregates and GROUP BY',
        lessons: [
          text('Summaries that managers ask for', 12, md(
            '```',
            'SELECT customer_id, COUNT(*) AS orders, SUM(amount) AS spend',
            'FROM orders',
            'GROUP BY customer_id',
            'HAVING SUM(amount) > 10000',
            'ORDER BY spend DESC;',
            '```',
            '- COUNT(*) counts rows; COUNT(column) counts only rows where that column is not NULL.',
            '- WHERE filters rows before grouping. HAVING filters groups after.',
            '- Every column in SELECT must either be in GROUP BY or be inside an aggregate.'
          )),
          quiz('Aggregates check', 6, [
            { q: 'A table has 10 rows and 3 of them have a NULL email. What does COUNT(email) return?', o: ['10', '7', '3', 'NULL'], a: 1, e: 'COUNT(column) skips NULLs; COUNT(*) would return 10.' },
            { q: 'Which clause keeps only customers whose total spend is over 10,000?', o: ['WHERE', 'HAVING', 'ORDER BY', 'LIMIT'], a: 1, e: 'The total exists only after grouping, so the filter goes in HAVING.' },
            { q: 'In standard SQL, a non-aggregated column in SELECT must:', o: ['Be numeric', 'Appear in GROUP BY', 'Be indexed', 'Come first'], a: 1, e: 'Otherwise the database would not know which row’s value to show for the group.' },
          ]),
        ],
      },
      {
        title: 'Joins without surprises',
        lessons: [
          text('INNER, LEFT and the fan-out trap', 12, md(
            '- **INNER JOIN** keeps only rows that match on both sides.',
            '- **LEFT JOIN** keeps every row from the left table, with NULLs where nothing matched.',
            '',
            '## Customers who never ordered',
            '```',
            'SELECT c.name',
            'FROM customers c',
            'LEFT JOIN orders o ON o.customer_id = c.id',
            'WHERE o.id IS NULL;',
            '```',
            '',
            '## Fan-out',
            'Joining one customer to three orders gives three rows. If you then SUM a customer-level column, it is counted three times. Aggregate orders first, then join the totals.'
          )),
          link('W3Schools: SQL joins with diagrams', 8, 'https://www.w3schools.com/sql/sql_join.asp', 'Try each join type in the editor on that page.'),
          quiz('Joins check', 6, [
            { q: 'Which query finds customers with no orders?', o: ['INNER JOIN orders and WHERE o.id IS NULL', 'LEFT JOIN orders and WHERE o.id IS NULL', 'LEFT JOIN orders and WHERE o.id IS NOT NULL', 'CROSS JOIN orders'], a: 1, e: 'The LEFT JOIN keeps every customer; the unmatched ones have NULL order columns.' },
            { q: 'An INNER JOIN returns:', o: ['All rows from both tables', 'Only rows with a match in both tables', 'All rows from the left table', 'Only unmatched rows'], a: 1, e: 'Unmatched rows on either side are dropped.' },
            { q: 'Five customers each have three orders. How many rows does customers LEFT JOIN orders return?', o: ['5', '8', '15', '3'], a: 2, e: 'Each customer row repeats once per matching order: 5 × 3 = 15.' },
          ]),
        ],
      },
      {
        title: 'Window functions and CTEs',
        lessons: [
          text('Rankings and running totals', 15, md(
            'Window functions compute across related rows **without collapsing them** the way GROUP BY does.',
            '```',
            'WITH ranked AS (',
            '  SELECT customer_id, id, amount,',
            '         ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY amount DESC) AS rn',
            '  FROM orders',
            ')',
            'SELECT * FROM ranked WHERE rn = 1;   -- each customer’s biggest order',
            '```',
            '- ROW_NUMBER gives 1, 2, 3 even for ties.',
            '- RANK leaves gaps after ties: 1, 1, 3.',
            '- DENSE_RANK does not: 1, 1, 2.',
            '- SUM(amount) OVER (ORDER BY ordered_at) is a running total.',
            '',
            'A CTE (the WITH part) names a subquery so the final query reads top to bottom.'
          )),
          link('PostgreSQL tutorial: window functions', 10, 'https://www.postgresql.org/docs/current/tutorial-window.html', 'The official tutorial is short and has good examples.'),
          quiz('Window functions check', 6, [
            { q: 'Scores are 90, 90 and 80. What do RANK and DENSE_RANK give?', o: ['RANK 1, 2, 3; DENSE_RANK 1, 1, 2', 'RANK 1, 1, 3; DENSE_RANK 1, 1, 2', 'RANK 1, 1, 2; DENSE_RANK 1, 1, 3', 'Both give 1, 2, 3'], a: 1, e: 'RANK skips a position after a tie; DENSE_RANK does not.' },
            { q: 'How do you keep only each customer’s largest order?', o: ['GROUP BY customer_id with MAX(id)', 'ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY amount DESC), keeping row 1', 'ORDER BY amount DESC LIMIT 1', 'DISTINCT customer_id'], a: 1, e: 'The window numbers each customer’s orders from largest down.' },
            { q: 'How do window functions differ from GROUP BY?', o: ['They are slower', 'They keep every row while adding the computed value', 'They only work on numbers', 'They need an index'], a: 1, e: 'GROUP BY returns one row per group; a window adds a column to each row.' },
          ]),
        ],
      },
    ],
  },

  {
    key: 'resume',
    branch: 'IT',
    author: /Product Manager|Delivery Manager|Technical Program Manager|IT Manager/,
    title: 'Resume and LinkedIn for freshers',
    summary:
      'A one-page resume that gets past screening, project write-ups that show what you actually did, and a LinkedIn profile alumni will want to reply to.',
    level: 'beginner',
    cover: 'chart-2',
    topics: ['Career', 'Placements'],
    skills: ['Resume Writing', 'LinkedIn', 'Personal Branding'],
    hours: 4,
    modules: [
      {
        title: 'One page that gets shortlisted',
        lessons: [
          text('Structure and format', 12, md(
            '## Order for a fresher',
            '1. Name, phone, email, LinkedIn and GitHub links',
            '2. Education: degree, college, year, CGPA',
            '3. Skills: languages, tools, frameworks, only ones you can be questioned on',
            '4. Projects: two or three, each with three short bullets',
            '5. Internships or experience',
            '6. Achievements and positions of responsibility',
            '',
            '## Format',
            '- One page. Recruiters skim it in under a minute.',
            '- Simple single-column layout with standard headings, so applicant tracking systems can read it. Keep text out of images and tables.',
            '- Send it as a PDF named like Firstname_Lastname_Resume.pdf.'
          )),
          text('Bullets that prove something', 10, md(
            'Write each bullet as **action verb + what you did + result**, with a number where you have one.',
            '',
            '- Weak: “Worked on an attendance system.”',
            '- Strong: “Built a Flask API for attendance used by 3 departments; cut manual entry time by 40%.”',
            '',
            'Start with verbs such as built, designed, reduced, automated, led. Leave out “responsible for”.'
          )),
          link('Tech Interview Handbook: resume guide', 10, 'https://www.techinterviewhandbook.org/resume/', 'A free, detailed guide with examples of strong and weak resume lines.'),
        ],
      },
      {
        title: 'Projects that speak for you',
        lessons: [
          text('Choosing and describing projects', 10, md(
            'Pick projects where you can explain every decision for ten minutes. For each one, say:',
            '- the problem it solves and who for',
            '- the stack, briefly',
            '- the part you built, if it was a team project',
            '- a result: users, speed, accuracy, or simply that it is deployed and works',
            '',
            'Link the GitHub repository with a clear README and, if possible, a live demo. An interviewer opening a working link is worth more than another skill in your list.'
          )),
          quiz('Resume check', 6, [
            { q: 'Which bullet is strongest?', o: ['Responsible for the backend of a project', 'Worked on attendance system using Python', 'Built a Flask API for attendance used by 3 departments; cut manual entry time by 40%', 'Good knowledge of Python and teamwork'], a: 2, e: 'It names the action, the work and a measurable result.' },
            { q: 'How long should a fresher’s resume be?', o: ['One page', 'Two pages', 'Three pages with certificates', 'As long as needed'], a: 0, e: 'Recruiters skim quickly; one focused page reads best.' },
            { q: 'What helps an applicant tracking system read your resume?', o: ['A two-column design with icons', 'Text inside images', 'A simple single-column layout with standard headings', 'Fancy fonts'], a: 2, e: 'Parsers handle plain structure reliably.' },
          ]),
        ],
      },
      {
        title: 'A LinkedIn profile alumni reply to',
        lessons: [
          text('Profile basics and reaching out', 10, md(
            '## Profile',
            '- A clear, friendly photo and a simple banner.',
            '- Headline: who you are, your skills, what you are looking for. For example: “Final-year Computer Engineering student at SJCEM | Java, Spring Boot, SQL | Seeking SDE roles”.',
            '- About: three or four sentences in your own voice.',
            '- Featured: your best project or a short write-up.',
            '- A custom profile URL with your name.',
            '',
            '## Reaching out',
            'When you send an alumnus a connection request, add a two-line note: who you are and why you are writing to them specifically. Ask one clear question, not “please refer me”.'
          )),
          link('LinkedIn Help', 5, 'https://www.linkedin.com/help/linkedin', 'Official help for profile sections, custom URLs and privacy settings.'),
          quiz('LinkedIn check', 5, [
            { q: 'Which headline is best for a final-year student?', o: ['Student', 'Looking for job', 'Final-year Computer Engineering student at SJCEM | Java, Spring Boot, SQL | Seeking SDE roles', 'Aspiring engineer passionate about everything'], a: 2, e: 'It says who you are, what you know and what you want, in one line.' },
            { q: 'What should a connection request to an alumnus include?', o: ['Nothing, just send it', 'A short personal note on who you are and why them', 'Your full resume pasted in', 'A request for a job'], a: 1, e: 'A specific note gets far more replies than a blank request.' },
          ]),
        ],
      },
    ],
  },

  {
    key: 'mock',
    branch: 'COMP',
    author: /Engineering Manager|Tech Lead|Staff Engineer|Principal Engineer/,
    title: 'Mock interview prep',
    summary:
      'How technical and HR rounds are run and scored, a repeatable approach to coding questions, the CS fundamentals interviewers probe, and STAR answers for behavioural questions.',
    level: 'intermediate',
    cover: 'chart-3',
    topics: ['Placements', 'Interviews'],
    skills: ['Problem Solving', 'Communication', 'Behavioural Interviews'],
    hours: 6,
    modules: [
      {
        title: 'How interviews are run',
        lessons: [
          text('What the interviewer is scoring', 8, md(
            'A typical campus process: an online test, one or two technical interviews, sometimes a managerial round, then HR.',
            '',
            'In technical rounds, interviewers usually score four things:',
            '- problem solving: how you break the problem down',
            '- coding: correct, readable code',
            '- communication: whether they can follow your thinking',
            '- fundamentals: data structures, OOP, DBMS, OS and networks',
            '',
            'Thinking aloud matters. A silent correct answer often scores lower than a talked-through answer with a small bug you then find and fix.'
          )),
        ],
      },
      {
        title: 'The coding round',
        lessons: [
          text('A six-step approach', 10, md(
            '1. **Clarify:** input size, ranges, duplicates, empty input. Repeat the problem back.',
            '2. **Examples:** work one small example by hand, plus an edge case.',
            '3. **Brute force:** say it and its complexity, even if it is slow.',
            '4. **Optimise:** look for a pattern: sorting, hashing, two pointers, BFS.',
            '5. **Code:** clean names, small helper functions.',
            '6. **Test:** walk through your example and the edge cases line by line, then state the final time and space complexity.'
          )),
          video('Ten common coding interview problems, solved', 30, 'Peq4GCPNC5c', 'Pause before each solution and try the six steps yourself.'),
          quiz('Coding round check', 5, [
            { q: 'What should you do first after hearing a coding question?', o: ['Start coding immediately', 'Ask clarifying questions and confirm an example', 'Ask for the answer', 'Write the complexity'], a: 1, e: 'Clarifying avoids solving the wrong problem and shows structured thinking.' },
            { q: 'You cannot see the optimal solution. What is the best move?', o: ['Stay silent until you do', 'State a brute-force approach and its complexity, then improve it', 'Say you have not studied this', 'Change the topic'], a: 1, e: 'A working baseline earns credit and often leads to the optimisation.' },
            { q: 'After writing the code, you should:', o: ['Say “done”', 'Walk through a test case, including edge cases such as empty input', 'Rewrite it in another language', 'Ask for the next question'], a: 1, e: 'Testing your own code is part of what is being scored.' },
          ]),
        ],
      },
      {
        title: 'CS fundamentals they ask',
        lessons: [
          text('The usual questions, briefly', 15, md(
            '## OOP',
            'Encapsulation, abstraction, inheritance and polymorphism. Have one small example of each from your own projects.',
            '',
            '## DBMS',
            '- ACID: Atomicity, Consistency, Isolation, Durability.',
            '- Normalisation removes redundancy; indexes speed up reads at some cost to writes.',
            '',
            '## Operating systems',
            '- A process has its own address space. Threads of one process share its memory (code, heap, globals) but each has its own stack and registers.',
            '- Deadlock needs four conditions together: mutual exclusion, hold and wait, no preemption, and circular wait.',
            '',
            '## Networks',
            '- TCP is connection-oriented and gives reliable, ordered delivery. UDP sends independent datagrams with no such guarantees, and less overhead.',
            '- Be ready to explain what happens when you type a URL: DNS lookup, TCP (and TLS) handshake, HTTP request and response, rendering.'
          )),
          quiz('Fundamentals check', 6, [
            { q: 'Which of these is NOT one of the four conditions for deadlock?', o: ['Mutual exclusion', 'Hold and wait', 'Preemption', 'Circular wait'], a: 2, e: 'The condition is no preemption: resources cannot be taken away from a process.' },
            { q: 'In ACID, what does the I stand for?', o: ['Integrity', 'Isolation', 'Indexing', 'Idempotence'], a: 1, e: 'Concurrent transactions must not see each other’s partial work.' },
            { q: 'Which statement about TCP and UDP is correct?', o: ['UDP guarantees ordered delivery', 'TCP is connection-oriented and provides reliable, ordered delivery', 'Both are connectionless', 'TCP has no overhead'], a: 1, e: 'TCP sets up a connection and retransmits lost segments; UDP does neither.' },
            { q: 'Threads of the same process share:', o: ['Nothing', 'Their stacks', 'The process’s memory, such as the heap and globals, but not their stacks', 'Only registers'], a: 2, e: 'Each thread has its own stack and registers.' },
          ]),
        ],
      },
      {
        title: 'HR and behavioural rounds',
        lessons: [
          text('STAR answers and “Tell me about yourself”', 10, md(
            '## STAR',
            'Answer behavioural questions (“Tell me about a time you…”) with **Situation, Task, Action, Result**. Keep the situation and task to a sentence or two; spend most of the answer on what you did and what came of it.',
            '',
            '## Tell me about yourself',
            'Aim for 60 to 90 seconds: who you are now, one or two things you have built or done that fit the role, and why this company.',
            '',
            '## Close well',
            'Prepare two questions to ask them, such as what a new engineer works on in the first three months.'
          )),
          link('Tech Interview Handbook: behavioural interviews', 10, 'https://www.techinterviewhandbook.org/behavioral-interview/', 'Common questions with guidance on structuring answers.'),
          quiz('Behavioural check', 4, [
            { q: 'What does STAR stand for?', o: ['Skills, Tools, Approach, Review', 'Situation, Task, Action, Result', 'Start, Think, Answer, Repeat', 'Story, Theme, Argument, Resolution'], a: 1, e: 'It keeps behavioural answers concrete and complete.' },
            { q: 'In a STAR answer, where should most of the time go?', o: ['Situation', 'Task', 'Action and Result', 'Equal time on all four'], a: 2, e: 'Interviewers want to hear what you did and what it achieved.' },
          ]),
        ],
      },
    ],
  },

  {
    key: 'java',
    branch: 'COMP',
    author: /Backend|Software Developer|Full Stack/,
    title: 'Java OOP essentials for interviews',
    summary:
      'The Java and object-oriented questions that come up in almost every technical round: classes and encapsulation, inheritance and polymorphism, equals and hashCode, and exceptions.',
    level: 'beginner',
    cover: 'primary',
    topics: ['Programming', 'Interviews'],
    skills: ['Java', 'OOP'],
    hours: 8,
    modules: [
      {
        title: 'Classes, objects and encapsulation',
        lessons: [
          text('Encapsulation in practice', 12, md(
            'Encapsulation means an object guards its own state: fields are private and changed only through methods that keep the object valid.',
            '```',
            'public class Account {',
            '    private long balance;',
            '',
            '    public void deposit(long amount) {',
            '        if (amount <= 0) throw new IllegalArgumentException("amount must be positive");',
            '        balance += amount;',
            '    }',
            '',
            '    public long getBalance() { return balance; }',
            '}',
            '```',
            '- **static** members belong to the class; instance members belong to each object.',
            '- **this** refers to the current object, often to tell a field from a parameter of the same name.'
          )),
          video('Object-oriented programming crash course', 35, 'SiBw7os-_zI', 'The four pillars explained with examples. The ideas carry over directly to Java.'),
        ],
      },
      {
        title: 'Inheritance and polymorphism',
        lessons: [
          text('Overloading, overriding, interfaces', 15, md(
            '- **Overloading:** same method name, different parameter lists, in one class. Chosen at compile time.',
            '- **Overriding:** a subclass redefines an inherited instance method with the same signature. Chosen at run time from the object’s actual class (dynamic dispatch).',
            '- Static methods are not overridden; a subclass static method with the same signature hides the parent’s.',
            '',
            '## Abstract classes and interfaces',
            'A class extends **one** class but can implement **many** interfaces. Since Java 8, interfaces can have default methods; abstract classes can still hold state and constructors.',
            '```',
            'Shape s = new Circle(2);',
            's.area();   // runs Circle.area(), decided at run time',
            '```'
          )),
          quiz('OOP check', 8, [
            { q: 'Method overloading is resolved:', o: ['At compile time', 'At run time', 'By the garbage collector', 'By the JVM at class loading only'], a: 0, e: 'The compiler picks the overload from the argument types.' },
            { q: 'How many classes can a Java class extend, and how many interfaces can it implement?', o: ['One; one', 'Many; one', 'One; many', 'Many; many'], a: 2, e: 'Java has single inheritance of classes and multiple inheritance of interfaces.' },
            { q: 'Can a static method be overridden?', o: ['Yes', 'No; a subclass method with the same signature hides it instead', 'Only in abstract classes', 'Only if it is final'], a: 1, e: 'Static methods are bound at compile time, so there is no dynamic dispatch.' },
            { q: 'Encapsulation is mainly achieved by:', o: ['Making every field public', 'Private fields with controlled access through methods', 'Using inheritance', 'Using static methods'], a: 1, e: 'The object controls how its state changes.' },
          ]),
        ],
      },
      {
        title: 'equals, hashCode and strings',
        lessons: [
          text('The contract interviewers love', 12, md(
            '- **==** compares references for objects; **equals** compares meaning, as the class defines it.',
            '- If two objects are equal by equals, they **must** have the same hashCode. Override both together, or HashMap and HashSet will misbehave.',
            '- Strings are immutable. Literals are pooled, so two identical literals are the same object, but new String("hi") creates a separate one.',
            '```',
            'String a = new String("hi");',
            'String b = "hi";',
            'a == b        // false: different objects',
            'a.equals(b)   // true: same characters',
            '```',
            '- ArrayList gives O(1) access by index; LinkedList gives O(1) insertion at a known node but O(n) access by index.'
          )),
          quiz('equals and strings check', 5, [
            { q: 'If you override equals(), you must also override:', o: ['toString()', 'hashCode()', 'finalize()', 'clone()'], a: 1, e: 'Equal objects must produce equal hash codes for hash-based collections to work.' },
            { q: 'String a = new String("hi"); String b = "hi"; What are a == b and a.equals(b)?', o: ['true and true', 'false and true', 'true and false', 'false and false'], a: 1, e: 'They are different objects with the same characters.' },
          ]),
        ],
      },
      {
        title: 'Exceptions',
        lessons: [
          text('Checked, unchecked and cleanup', 10, md(
            '- **Checked** exceptions (such as IOException) must be caught or declared with throws.',
            '- **Unchecked** exceptions extend RuntimeException (such as NullPointerException or ArithmeticException) and need not be declared.',
            '- **finally** runs whether or not an exception is thrown.',
            '- **try-with-resources** closes anything that implements AutoCloseable automatically:',
            '```',
            'try (BufferedReader r = Files.newBufferedReader(path)) {',
            '    return r.readLine();',
            '}',
            '```'
          )),
          video('Java programming for beginners, full course', 30, 'A74TOX803D0', 'Use the chapter list to jump to exceptions and to object-oriented programming.'),
          quiz('Exceptions check', 4, [
            { q: 'Which of these is a checked exception?', o: ['NullPointerException', 'ArithmeticException', 'IOException', 'ArrayIndexOutOfBoundsException'], a: 2, e: 'The others extend RuntimeException and are unchecked.' },
            { q: 'What must a resource implement to be used in try-with-resources?', o: ['Serializable', 'AutoCloseable', 'Runnable', 'Comparable'], a: 1, e: 'The resource’s close() is called automatically at the end of the block.' },
          ]),
        ],
      },
    ],
  },

  {
    key: 'git',
    branch: 'IT',
    author: /Software Developer|Technical Lead|Cloud Engineer/,
    title: 'Git and GitHub for your first job',
    summary:
      'The Git you will use from week one at work: clean commits, branches and merges, resolving conflicts, pull requests, and undoing mistakes safely.',
    level: 'beginner',
    cover: 'chart-3',
    topics: ['Tools', 'Programming'],
    skills: ['Git', 'GitHub'],
    hours: 4,
    modules: [
      {
        title: 'Commits and history',
        lessons: [
          text('The everyday loop', 10, md(
            '```',
            'git status            # what changed',
            'git add file.js       # stage it for the next commit',
            'git commit -m "Add login form validation"',
            'git log --oneline     # history',
            'git diff              # unstaged changes',
            '```',
            '- Commit small, related changes with a message that says what and why.',
            '- List build output, secrets and dependencies (node_modules, .env) in **.gitignore** so they are never committed.'
          )),
          video('Git and GitHub crash course', 60, 'RGOj5yH7evk', 'Follow along in a test repository; typing the commands yourself is what makes them stick.'),
        ],
      },
      {
        title: 'Branches and merging',
        lessons: [
          text('Working on a branch', 10, md(
            '```',
            'git switch -c feature/search   # create a branch and move to it',
            'git switch main',
            'git merge feature/search',
            '```',
            '## Conflicts',
            'When two branches change the same lines, Git marks the file:',
            '```',
            '<<<<<<< HEAD',
            'your version',
            '=======',
            'their version',
            '>>>>>>> feature/search',
            '```',
            'Edit it to the correct result, remove the markers, then add and commit.',
            '',
            'Rebase rewrites history: fine on your own branch, never on a branch others have pulled.'
          )),
          link('Learn Git Branching (interactive)', 20, 'https://learngitbranching.js.org/', 'A visual sandbox for branching, merging and rebasing. Do the first two levels.'),
        ],
      },
      {
        title: 'Pull requests and undoing mistakes',
        lessons: [
          text('Teamwork on GitHub', 10, md(
            '1. Push your branch: git push -u origin feature/search',
            '2. Open a pull request with a short description of what changed and how you tested it.',
            '3. Respond to review comments with new commits.',
            '4. Keep the branch current with main by merging or rebasing main into it before it is merged.',
            '',
            '## Undoing',
            '- git restore file: throw away uncommitted changes to a file.',
            '- git revert <commit>: make a new commit that undoes an old one. Safe on shared branches.',
            '- git reset: moves your branch pointer and rewrites history. Use only on commits nobody else has.'
          )),
          link('Pro Git book', 15, 'https://git-scm.com/book/en/v2', 'The free, official book. Chapters 2 and 3 cover everything in this course in more depth.'),
          quiz('Git check', 6, [
            { q: 'What does git add do?', o: ['Creates a commit', 'Stages changes for the next commit', 'Uploads to GitHub', 'Creates a branch'], a: 1, e: 'Staging chooses what goes into the next commit.' },
            { q: 'A bad commit is already on the shared main branch. How do you undo it safely?', o: ['git reset --hard and force-push', 'git revert that commit', 'Delete the repository', 'git commit --amend'], a: 1, e: 'Revert adds a new commit and leaves everyone’s history intact.' },
            { q: 'Which markers does Git use to show a merge conflict?', o: ['<<<<<<<, =======, >>>>>>>', '[[[, ]]]', '/* conflict */', '#### and ####'], a: 0, e: 'The section between the markers shows both versions.' },
            { q: 'Which command creates a new branch and switches to it?', o: ['git branch -d feature', 'git switch -c feature', 'git merge feature', 'git push feature'], a: 1, e: 'switch -c creates and checks out the branch in one step.' },
            { q: 'What is .gitignore for?', o: ['Listing files Git should not track', 'Ignoring merge conflicts', 'Hiding commits', 'Skipping code review'], a: 0, e: 'Use it for build output, dependencies and secrets.' },
          ]),
        ],
      },
    ],
  },

  {
    key: 'estimation',
    branch: 'CIVIL',
    author: /Quantity Surveyor|Billing Engineer|Planning Engineer/,
    title: 'Estimation and quantity surveying basics',
    summary:
      'Take off quantities for concrete, steel and masonry, work out material requirements, and prepare a bill of quantities and running bills the way site billing teams do.',
    level: 'beginner',
    cover: 'warning',
    topics: ['Civil', 'Site Execution'],
    skills: ['Estimation', 'Quantity Surveying', 'BOQ'],
    hours: 8,
    modules: [
      {
        title: 'Units and methods of measurement',
        lessons: [
          text('Measure it the way it will be billed', 12, md(
            'Measurement in India follows IS 1200. The common units:',
            '- Excavation, concrete, and brickwork one brick thick or more: cubic metres (m³)',
            '- Half-brick walls, plastering, painting, formwork and flooring: square metres (m²)',
            '- Reinforcement steel: kilograms or tonnes',
            '- Skirting, pipes and similar items: running metres',
            '',
            '## Taking off walls',
            '- Long wall–short wall method: measure long walls out to out and short walls in to in.',
            '- Centre line method: total centre-line length × width × height, with a deduction at each junction. Quick for symmetric plans.'
          )),
          link('Bureau of Indian Standards', 5, 'https://www.bis.gov.in/', 'The home of IS 1200 (method of measurement) and the other codes estimators refer to.'),
        ],
      },
      {
        title: 'Concrete and steel',
        lessons: [
          text('Materials for concrete', 12, md(
            '## Dry volume',
            'Dry ingredients shrink in volume once mixed with water, as voids fill. For 1 m³ of wet concrete, take about **1.54 m³** of dry materials.',
            '',
            '## Cement for M20 (nominal mix 1 : 1.5 : 3)',
            '- Total parts: 1 + 1.5 + 3 = 5.5',
            '- Cement volume: 1.54 × 1/5.5 = 0.28 m³',
            '- Cement weight: 0.28 × 1,440 kg/m³ ≈ 403 kg, about 8 bags of 50 kg',
            '',
            '## Steel weight',
            'Weight per metre of a bar of diameter D mm is **D² / 162 kg**.',
            '- 10 mm: 100/162 ≈ 0.617 kg/m',
            '- 12 mm: 144/162 ≈ 0.889 kg/m',
            '- 16 mm: 256/162 ≈ 1.58 kg/m',
            '',
            'Prepare a bar bending schedule for each member: bar mark, diameter, number, cut length, total length and weight.'
          )),
          quiz('Concrete and steel check', 8, [
            { q: 'What is the weight per metre of a 10 mm bar?', o: ['0.395 kg', '0.617 kg', '0.888 kg', '1.58 kg'], a: 1, e: '10² / 162 = 0.617 kg/m.' },
            { q: 'Why is the wet volume of concrete multiplied by about 1.54 to get dry material volume?', o: ['To add a safety margin for theft', 'Dry ingredients lose volume when mixed as voids are filled', 'Cement expands when wet', 'It converts m³ to bags'], a: 1, e: 'The loose dry materials pack down once water is added.' },
            { q: 'About how much does 12 m of 16 mm bar weigh?', o: ['7.4 kg', '10.7 kg', '19 kg', '24 kg'], a: 2, e: '16² / 162 ≈ 1.58 kg/m; × 12 ≈ 19 kg.' },
            { q: 'For M20 nominal mix (1 : 1.5 : 3), roughly how much cement does 1 m³ of concrete need?', o: ['4 bags', '6 bags', '8 bags', '12 bags'], a: 2, e: '1.54/5.5 × 1,440 ≈ 403 kg, about eight 50 kg bags.' },
          ]),
        ],
      },
      {
        title: 'Masonry and finishes',
        lessons: [
          text('Bricks, mortar and plaster', 10, md(
            '- A modular brick is 190 × 90 × 90 mm; with 10 mm joints it occupies 200 × 100 × 100 mm, so **500 bricks per m³** before wastage.',
            '- Add wastage, commonly a few per cent, as your organisation specifies.',
            '- Plaster is measured in m² of surface. Deduct openings according to the rules in IS 1200 instead of deducting every opening in full.'
          )),
          quiz('Masonry check', 4, [
            { q: 'How many modular bricks (190 × 90 × 90 mm with 10 mm joints) are in 1 m³ of brickwork, before wastage?', o: ['400', '450', '500', '550'], a: 2, e: '1 m³ ÷ (0.2 × 0.1 × 0.1 m³) = 500.' },
            { q: 'Plastering is measured in:', o: ['m³', 'm²', 'Running metres', 'kg'], a: 1, e: 'Plaster is a surface finish, so it is measured by area.' },
          ]),
        ],
      },
      {
        title: 'BOQ and billing',
        lessons: [
          text('From quantities to payments', 10, md(
            '- A **bill of quantities (BOQ)** lists each item with its description, unit, quantity, rate and amount. Contractors price it at tender.',
            '- Work done on site is recorded in the **measurement book (MB)**.',
            '- Contractors are paid as work progresses through **running account (RA) bills**, with a final bill at the end.',
            '- Keep every quantity traceable: drawing reference, location and calculation.'
          )),
          quiz('Billing check', 3, [
            { q: 'What are the interim bills paid to a contractor as work progresses called?', o: ['Final bills', 'Running account (RA) bills', 'Purchase orders', 'Tender bills'], a: 1, e: 'RA bills are based on measurements recorded during the work.' },
            { q: 'Where is measured work on site recorded?', o: ['The measurement book', 'The drawing register', 'The site diary only', 'The BOQ'], a: 0, e: 'The MB is the formal record that bills are prepared from.' },
          ]),
        ],
      },
    ],
  },

  {
    key: 'networks',
    branch: 'EXTC',
    author: /Network Engineer|Network Architect/,
    title: 'Computer networks for interviews',
    summary:
      'Layers, IP addressing and subnetting, TCP and UDP, and the core protocols that interviewers ask about, explained from the point of view of a working network engineer.',
    level: 'intermediate',
    cover: 'info',
    topics: ['Networking', 'Interviews'],
    skills: ['Networking', 'TCP/IP', 'Subnetting'],
    hours: 6,
    modules: [
      {
        title: 'Layers and the life of a request',
        lessons: [
          text('OSI, TCP/IP and typing a URL', 12, md(
            'The OSI model has seven layers: physical, data link, network, transport, session, presentation and application. The TCP/IP model groups them into four: link, internet, transport and application.',
            '- Switches work mainly at layer 2 with MAC addresses; routers at layer 3 with IP addresses.',
            '',
            '## What happens when you type a URL',
            '1. DNS resolves the name to an IP address.',
            '2. The browser opens a TCP connection, then a TLS handshake for HTTPS.',
            '3. It sends an HTTP request and receives the response.',
            '4. The browser renders the page and fetches its other resources.'
          )),
          video('Computer networking course', 45, 'qiQR5rTSshw', 'A long, thorough course. Watch the OSI model and IP addressing sections first.'),
        ],
      },
      {
        title: 'IP addressing and subnetting',
        lessons: [
          text('Subnetting without a calculator', 15, md(
            'An IPv4 address has 32 bits. In CIDR notation, /n means the first n bits are the network part.',
            '- A /24 has 2⁸ = 256 addresses; minus the network and broadcast addresses, 254 usable hosts.',
            '- A /26 has 2⁶ = 64 addresses, 62 usable. Its mask is 255.255.255.192.',
            '- Usable hosts = 2^(32 − n) − 2 for ordinary subnets.',
            '',
            '## Private ranges',
            '- 10.0.0.0/8',
            '- 172.16.0.0/12 (172.16.0.0 to 172.31.255.255)',
            '- 192.168.0.0/16'
          )),
          quiz('Addressing check', 6, [
            { q: 'How many usable host addresses does a /26 subnet have?', o: ['64', '62', '30', '126'], a: 1, e: '2⁶ = 64 addresses, minus network and broadcast.' },
            { q: 'Which of these is a private IPv4 address?', o: ['8.8.8.8', '172.32.0.1', '172.20.5.4', '11.0.0.1'], a: 2, e: '172.16.0.0/12 runs from 172.16 to 172.31, so 172.20 is private and 172.32 is not.' },
            { q: 'Which prefix length matches the mask 255.255.255.192?', o: ['/24', '/25', '/26', '/27'], a: 2, e: '192 is 11000000, two more network bits after /24.' },
          ]),
        ],
      },
      {
        title: 'TCP, UDP and core protocols',
        lessons: [
          text('Handshakes, ports and helpers', 12, md(
            '- TCP opens a connection with a three-way handshake: **SYN, SYN-ACK, ACK**. It retransmits lost data and keeps it in order.',
            '- UDP just sends datagrams. DNS queries usually use UDP on port 53; voice and video often use UDP too.',
            '- Ports to know: HTTP 80, HTTPS 443, SSH 22, DNS 53.',
            '- ARP finds the MAC address for an IP address on the local network.',
            '- DHCP gives a device its address in four messages: Discover, Offer, Request, Acknowledge.'
          )),
          quiz('Protocols check', 6, [
            { q: 'What is the order of the TCP three-way handshake?', o: ['ACK, SYN, SYN-ACK', 'SYN, SYN-ACK, ACK', 'SYN, ACK, FIN', 'SYN-ACK, SYN, ACK'], a: 1, e: 'The client sends SYN, the server answers SYN-ACK, the client confirms with ACK.' },
            { q: 'Which protocol maps an IP address to a MAC address on a LAN?', o: ['DNS', 'DHCP', 'ARP', 'ICMP'], a: 2, e: 'ARP broadcasts “who has this IP?” and the owner replies with its MAC.' },
            { q: 'What is the default port for HTTPS?', o: ['80', '443', '22', '8080'], a: 1, e: 'HTTP uses 80; HTTPS uses 443.' },
            { q: 'At which OSI layer does a router mainly operate?', o: ['Physical', 'Data link', 'Network', 'Transport'], a: 2, e: 'Routers forward packets by IP address, a layer 3 function.' },
          ]),
        ],
      },
    ],
  },

  {
    key: 'excel',
    branch: 'IT',
    author: /Business Analyst|Consultant|Product Manager/,
    title: 'Excel for data reporting',
    summary:
      'Clean messy data, combine sheets with lookups, summarise with pivot tables and build reports managers can read, the Excel skills analyst and support roles test first.',
    level: 'beginner',
    cover: 'success',
    topics: ['Data', 'Tools'],
    skills: ['Excel', 'Pivot Tables', 'Data Cleaning'],
    hours: 6,
    modules: [
      {
        title: 'Clean the data first',
        lessons: [
          text('Tidy data in five moves', 10, md(
            '1. Convert the range to a Table with **Ctrl+T**, so formulas and formatting extend to new rows.',
            '2. Remove extra spaces with TRIM and fix capitalisation with PROPER.',
            '3. Remove duplicates from the Data tab.',
            '4. Split combined fields with Text to Columns or Flash Fill.',
            '5. Add data validation (drop-downs) so new entries stay consistent.',
            '',
            'Check that dates are real dates, not text: a real date aligns to the right by default and can be sorted correctly.'
          )),
          video('Excel full course for beginners', 40, 'Vl0H-qTclOg', 'Watch the sections on tables, sorting and filtering, then try them on your own data.'),
        ],
      },
      {
        title: 'Lookups and logic',
        lessons: [
          text('VLOOKUP, XLOOKUP and conditional sums', 12, md(
            '- **VLOOKUP(value, table, column_number, FALSE)** finds value in the first column of table and returns the given column. Use FALSE (or 0) for an exact match.',
            '- **XLOOKUP** (Excel 2021 and Microsoft 365) looks up in any column and returns from any other, exact by default.',
            '- **SUMIFS** and **COUNTIFS** sum or count rows matching several conditions, such as region = West and month = Jan.',
            '- Press **F4** to cycle references: $A$1 locks both column and row; A$1 locks only the row.'
          )),
          quiz('Formulas check', 6, [
            { q: 'What does =VLOOKUP(A2, D:F, 3, FALSE) return?', o: ['The value in column F of the first row where column D exactly matches A2', 'The value in column D', 'The third row of column D', 'An approximate match from column E'], a: 0, e: 'Column 3 of the range D:F is column F; FALSE asks for an exact match.' },
            { q: 'Which reference stays fixed in both column and row when copied?', o: ['A1', '$A1', 'A$1', '$A$1'], a: 3, e: 'A $ before each part locks it.' },
            { q: 'Which function sums sales where region is “West” and month is “Jan”?', o: ['SUMIF', 'SUMIFS', 'COUNTIFS', 'SUMPRODUCT only'], a: 1, e: 'SUMIFS accepts several criteria ranges.' },
            { q: 'Which function removes extra spaces from text?', o: ['CLEAN', 'TRIM', 'PROPER', 'SUBSTITUTE'], a: 1, e: 'TRIM leaves single spaces between words and none at the ends.' },
          ]),
        ],
      },
      {
        title: 'Pivot tables and reports',
        lessons: [
          text('Summaries in a minute', 10, md(
            '1. Click inside your Table and choose Insert, then PivotTable.',
            '2. Drag a category (region) to Rows, a time field (month) to Columns and a number (sales) to Values.',
            '3. Add a slicer so readers can filter without touching the pivot.',
            '4. Choose a chart that fits: columns to compare categories, a line for trends over time.',
            '',
            'When reports need refreshing from several sources every week, Power BI is the next step.'
          )),
          link('Power BI Desktop: getting started', 15, 'https://learn.microsoft.com/en-us/power-bi/fundamentals/desktop-getting-started', 'Microsoft’s official tutorial for building your first report.'),
          quiz('Pivot check', 3, [
            { q: 'Which shortcut converts a range into an Excel Table?', o: ['Ctrl+T', 'Ctrl+P', 'Ctrl+Shift+L', 'Alt+F4'], a: 0, e: 'Ctrl+T, or Insert, then Table.' },
            { q: 'A pivot table is best for:', o: ['Typing data in', 'Summarising large data by category quickly', 'Formatting cells', 'Writing macros'], a: 1, e: 'It groups and totals without formulas.' },
          ]),
        ],
      },
    ],
  },
];

const WORKSHOPS = [
  {
    course: 'dsa',
    title: 'Live DSA mock round: arrays and hashing',
    description:
      'A live coding round run like a real interview. Volunteers solve a problem while the rest of us follow along; we finish with how I would score each attempt. Bring a laptop with your editor ready.',
    days: 5,
    hour: [18, 30],
    duration: 90,
    capacity: 40,
    location: 'Online',
    topics: ['Placements', 'DSA'],
  },
  {
    course: 'aptitude',
    title: 'Aptitude speed drill: 30 questions in 30 minutes',
    description:
      'A timed practice test in the format most campus drives use, followed by a walkthrough of the shortcuts for every question. The joining link is shared with everyone who has a seat a day before.',
    days: 8,
    hour: [17, 0],
    duration: 60,
    capacity: 100,
    location: 'Online',
    topics: ['Placements', 'Aptitude'],
  },
  {
    course: 'autocad',
    title: 'AutoCAD on site: reading and marking up drawings',
    description:
      'Hands-on session with real (anonymised) site drawings: reading grids and levels, checking dimensions, and marking revisions. Laptops with AutoCAD student edition installed help but are not required.',
    days: 12,
    hour: [11, 0],
    duration: 120,
    capacity: 30,
    location: 'SJCEM campus, Civil drawing hall',
    topics: ['Civil', 'AutoCAD'],
  },
  {
    course: 'resume',
    title: 'Resume review clinic',
    description:
      'Bring your current resume. I review a few live on screen, anonymised, and everyone leaves with a checklist to fix their own. The joining link is shared with seat holders a day before.',
    days: 15,
    hour: [19, 0],
    duration: 60,
    capacity: 25,
    location: 'Online',
    topics: ['Career', 'Placements'],
  },
];

/* ----------------------------- content checks ---------------------------- */

function check() {
  const problems = [];
  for (const c of COURSES) {
    if (c.modules.length < 3 || c.modules.length > 5) problems.push(`${c.title}: ${c.modules.length} modules`);
    for (const m of c.modules) {
      if (!m.lessons.length) problems.push(`${c.title} / ${m.title}: no lessons`);
      for (const l of m.lessons) {
        const where = `${c.title} / ${l.t}`;
        if (l.k === 'text' && !l.body?.trim()) problems.push(`${where}: empty text`);
        if ((l.k === 'video' || l.k === 'link') && !/^https:\/\//.test(l.url ?? '')) problems.push(`${where}: bad url`);
        if (l.body && l.body.length > 20000) problems.push(`${where}: body too long`);
        if (l.k === 'quiz') {
          if (!l.quiz.length) problems.push(`${where}: no questions`);
          for (const [i, q] of l.quiz.entries()) {
            if (!q.q?.trim()) problems.push(`${where} Q${i + 1}: no prompt`);
            if (q.o.length < 2 || q.o.length > 6) problems.push(`${where} Q${i + 1}: ${q.o.length} options`);
            if (new Set(q.o.map((o) => o.trim().toLowerCase())).size !== q.o.length) problems.push(`${where} Q${i + 1}: repeated option`);
            if (!Number.isInteger(q.a) || q.a < 0 || q.a >= q.o.length) problems.push(`${where} Q${i + 1}: answer out of range`);
            if (!q.e) problems.push(`${where} Q${i + 1}: no explanation`);
          }
        }
      }
    }
  }
  if (problems.length) throw new Error(`Content problems:\n  ${problems.join('\n  ')}`);
}

/* --------------------------------- run ----------------------------------- */

async function fetchAll(table, columns, build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(db.from(table).select(columns)).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

/** Starts at an IST wall-clock time, `days` from today. */
function istAt(days, [h, m]) {
  const d = new Date(Date.now() + days * DAY);
  const ymd = new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);
  return new Date(`${ymd}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+05:30`).toISOString();
}

const scoreOf = (questions, answers) => Math.round((questions.filter((q, i) => answers[i] === q.a).length / questions.length) * 100);

/** Answers that get roughly `accuracy` of the questions right. */
function answersFor(questions, accuracy) {
  return questions.map((q) => (chance(accuracy) ? q.a : (q.a + 1 + Math.floor(rnd() * (q.o.length - 1))) % q.o.length));
}

async function main() {
  check();
  const lessonCount = COURSES.reduce((a, c) => a + c.modules.reduce((b, m) => b + m.lessons.length, 0), 0);
  const questionCount = COURSES.reduce((a, c) => a + c.modules.flatMap((m) => m.lessons).reduce((b, l) => b + (l.quiz?.length ?? 0), 0), 0);
  console.log(`Content checks passed: ${COURSES.length} courses, ${lessonCount} lessons, ${questionCount} quiz questions.`);

  const records = await fetchAll(
    'alumni_records',
    'student_id, branch, claimed_by, alumni_profiles!record_id(designation)',
    (q) => q.like('student_id', 'SYNTH_%').not('claimed_by', 'is', null).order('student_id')
  );
  const alumni = records
    .map((r) => {
      const p = Array.isArray(r.alumni_profiles) ? r.alumni_profiles[0] : r.alumni_profiles;
      return { id: r.claimed_by, branch: r.branch, designation: p?.designation ?? '' };
    })
    .filter((a) => a.id);
  const synthIds = alumni.map((a) => a.id);
  if (!synthIds.length) throw new Error('No synthetic alumni; run seed-synthetic-alumni.mjs --commit first.');

  const chunks = (arr, n = 100) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
  const existing = [];
  for (const part of chunks(synthIds)) existing.push(...(await fetchAll('courses', 'id', (q) => q.in('author_id', part))));

  if (PURGE) {
    let workshops = 0;
    for (const part of chunks(synthIds)) {
      const { data, error } = await db.from('workshops').delete().in('host_id', part).select('id');
      if (error) throw new Error(`workshops: ${error.message}`);
      workshops += data.length;
      const res = await db.from('courses').delete().in('author_id', part);
      if (res.error) throw new Error(`courses: ${res.error.message}`);
    }
    console.log(`Removed ${existing.length} synthetic courses (with their modules, lessons, enrolments and progress) and ${workshops} workshops.`);
    return;
  }
  if (existing.length) {
    console.log(`${existing.length} synthetic courses already exist. Run with --purge first to regenerate.`);
    return;
  }

  // Authors: a synthetic alumnus from the course's branch whose role fits, each used once.
  const used = new Set();
  const authorFor = (c) => {
    const pool = alumni.filter((a) => a.branch === c.branch && !used.has(a.id));
    const fit = pool.filter((a) => c.author.test(a.designation));
    const pick = (fit.length ? fit : pool)[Math.floor(rnd() * (fit.length || pool.length))];
    if (!pick) throw new Error(`No synthetic ${c.branch} alumnus for ${c.title}`);
    used.add(pick.id);
    return pick;
  };

  const { data: students, error: sErr } = await db
    .from('users')
    .select('id, email, full_name, student_profiles(branch)')
    .eq('role', 'student')
    .like('email', '%@v3.demo.com');
  if (sErr) throw new Error(`users: ${sErr.message}`);
  const demo = students.find((s) => s.email === DEMO_STUDENT);
  if (!demo) throw new Error(`${DEMO_STUDENT} not found`);
  const others = students.filter((s) => s.id !== demo.id);
  const branchOf = (s) => (Array.isArray(s.student_profiles) ? s.student_profiles[0] : s.student_profiles)?.branch ?? 'COMP';

  const now = Date.now();
  const plan = COURSES.map((c, i) => {
    const author = authorFor(c);
    const publishedAt = new Date(now - (90 - i * 6) * DAY - Math.floor(rnd() * DAY)).toISOString();
    return { c, author, publishedAt };
  });

  if (!COMMIT) {
    for (const p of plan) console.log(`  ${p.c.title} (${p.c.branch}) by ${p.author.designation || 'alumnus'} ${p.author.id.slice(0, 8)}`);
    console.log(`Would enrol ${demo.email} and ${others.length} showcase students. Dry run; pass --commit to write.`);
    return;
  }

  // Courses, modules and lessons.
  const lessonsByCourse = new Map();
  for (const p of plan) {
    const { c } = p;
    const { data: course, error } = await db
      .from('courses')
      .insert({
        author_id: p.author.id,
        title: c.title,
        summary: c.summary,
        cover: c.cover,
        level: c.level,
        topics: c.topics,
        skills: c.skills,
        est_hours: c.hours,
        published: true,
        published_at: p.publishedAt,
        created_at: p.publishedAt,
        updated_at: p.publishedAt,
      })
      .select('id')
      .single();
    if (error) throw new Error(`courses: ${error.message} (run with --purge to clean up)`);
    p.id = course.id;
    const ordered = [];
    for (const [mi, m] of c.modules.entries()) {
      const { data: mod, error: mErr } = await db
        .from('course_modules')
        .insert({ course_id: course.id, title: m.title, position: mi, created_at: p.publishedAt })
        .select('id')
        .single();
      if (mErr) throw new Error(`course_modules: ${mErr.message} (run with --purge to clean up)`);
      const rows = m.lessons.map((l, li) => ({
        module_id: mod.id,
        course_id: course.id,
        title: l.t,
        kind: l.k,
        position: li,
        body: l.body ?? '',
        url: l.url ?? null,
        quiz: l.k === 'quiz' ? l.quiz.map((q) => ({ prompt: q.q, options: q.o, correct: q.a, explanation: q.e })) : [],
        duration_min: l.min,
        created_at: p.publishedAt,
        updated_at: p.publishedAt,
      }));
      const { data: inserted, error: lErr } = await db.from('course_lessons').insert(rows).select('id, position');
      if (lErr) throw new Error(`course_lessons: ${lErr.message} (run with --purge to clean up)`);
      for (const r of [...inserted].sort((a, b) => a.position - b.position)) ordered.push({ id: r.id, src: m.lessons[r.position] });
    }
    lessonsByCourse.set(c.key, { id: course.id, lessons: ordered });
  }

  // Progress: complete the first `done` lessons, spread over the days since enrolment.
  const enrolments = [];
  const progress = [];
  function enrol(userId, key, done, accuracy, enrolledDaysAgo) {
    const course = lessonsByCourse.get(key);
    const total = course.lessons.length;
    const n = Math.min(done, total);
    const enrolledAt = now - enrolledDaysAgo * DAY;
    const span = Math.max(1, enrolledDaysAgo - 1) * DAY;
    const scores = [];
    let last = null;
    let lastAt = enrolledAt;
    for (let i = 0; i < n; i++) {
      const l = course.lessons[i];
      const at = enrolledAt + Math.round(((i + 1) / (n + 1)) * span);
      const row = { user_id: userId, lesson_id: l.id, course_id: course.id, completed_at: new Date(at).toISOString(), attempts: 0, updated_at: new Date(at).toISOString() };
      if (l.src.k === 'quiz') {
        const answers = answersFor(l.src.quiz, accuracy);
        row.quiz_answers = answers;
        row.quiz_score = scoreOf(l.src.quiz, answers);
        row.attempts = 1;
        scores.push(row.quiz_score);
      }
      progress.push(row);
      last = l.id;
      lastAt = at;
    }
    const complete = n === total;
    enrolments.push({
      course_id: course.id,
      user_id: userId,
      enrolled_at: new Date(enrolledAt).toISOString(),
      last_lesson_id: last,
      last_seen_at: new Date(lastAt).toISOString(),
      completed_at: complete ? new Date(lastAt).toISOString() : null,
      score: complete && scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    });
  }

  // The demo student: one finished long ago, one finished recently, one half done, two just started.
  const lessonsIn = (key) => lessonsByCourse.get(key).lessons.length;
  enrol(demo.id, 'aptitude', lessonsIn('aptitude'), 0.85, 24);
  enrol(demo.id, 'resume', lessonsIn('resume'), 1, 9);
  enrol(demo.id, 'dsa', 8, 0.75, 14);
  enrol(demo.id, 'git', 1, 1, 3);
  enrol(demo.id, 'mock', 0, 1, 1);

  // Showcase students: courses that suit their branch plus the general ones.
  const BY_BRANCH = {
    COMP: ['dsa', 'java', 'git', 'mock', 'sql'],
    IT: ['sql', 'excel', 'git', 'networks', 'dsa'],
    EXTC: ['embedded', 'networks', 'dsa'],
    CIVIL: ['autocad', 'estimation', 'excel'],
  };
  const GENERAL = ['aptitude', 'resume', 'mock'];
  for (const s of others) {
    const pool = [...new Set([...(BY_BRANCH[branchOf(s)] ?? BY_BRANCH.COMP), ...GENERAL])];
    for (const key of pickN(pool, 2 + Math.floor(rnd() * 3))) {
      const total = lessonsIn(key);
      const done = chance(0.35) ? total : Math.floor(rnd() * total);
      enrol(s.id, key, done, 0.55 + rnd() * 0.45, 4 + Math.floor(rnd() * 40));
    }
  }

  for (const part of chunks(enrolments, 500)) {
    const { error } = await db.from('course_enrolments').insert(part);
    if (error) throw new Error(`course_enrolments: ${error.message} (run with --purge to clean up)`);
  }
  for (const part of chunks(progress, 500)) {
    const { error } = await db.from('lesson_progress').insert(part);
    if (error) throw new Error(`lesson_progress: ${error.message} (run with --purge to clean up)`);
  }

  // Workshops by the matching course authors, with some seats taken.
  const rsvps = [];
  for (const w of WORKSHOPS) {
    const p = plan.find((x) => x.c.key === w.course);
    const { data, error } = await db
      .from('workshops')
      .insert({
        host_id: p.author.id,
        course_id: p.id,
        title: w.title,
        description: w.description,
        starts_at: istAt(w.days, w.hour),
        duration_min: w.duration,
        capacity: w.capacity,
        location: w.location,
        topics: w.topics,
        created_at: new Date(now - 3 * DAY).toISOString(),
      })
      .select('id')
      .single();
    if (error) throw new Error(`workshops: ${error.message} (run with --purge to clean up)`);
    const seats = pickN(others, Math.min(w.capacity - 1, 3 + Math.floor(rnd() * 6)));
    if (w.course === 'dsa' || w.course === 'resume') seats.push(demo);
    for (const s of seats) rsvps.push({ workshop_id: data.id, user_id: s.id });
  }
  const { error: rErr } = await db.from('workshop_rsvps').insert(rsvps);
  if (rErr) throw new Error(`workshop_rsvps: ${rErr.message} (run with --purge to clean up)`);

  const completed = enrolments.filter((e) => e.completed_at).length;
  console.log(
    `Created ${plan.length} courses (${lessonCount} lessons), ${WORKSHOPS.length} workshops with ${rsvps.length} seats taken, ` +
      `${enrolments.length} enrolments (${completed} completed) and ${progress.length} lesson completions.`
  );
  console.log(`${DEMO_STUDENT}: ${enrolments.filter((e) => e.user_id === demo.id).length} enrolments, 2 workshop seats.`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
