# lib/ml

Three small models, trained offline in Node and shipped as JSON in `lib/ml/models/`. Runtime code is plain TypeScript with no dependencies, so it runs in Workers.

| Model | Trainer | Output | Used by |
|---|---|---|---|
| Semantic role/skill embeddings | `scripts/ml/train-semantic-model.mjs` | `models/semantic.json` (~17 KB) | `lib/ml/semantic.ts`, `lib/matching.ts`, `lib/ml/feed-rank.ts` |
| Match weights | `scripts/ml/train-match-weights.mjs` | `models/match-weights.json` | `lib/matching.ts` |
| Top-feed ranker | `scripts/ml/train-feed-ranker.mjs` | `models/feed-ranker.json` | `lib/ml/feed-rank.ts`, `lib/ml/top-feed.ts` |

## Semantic model (unsupervised)

TF-IDF over short "career documents", reduced by a truncated SVD (latent semantic analysis). Words that keep the same company end up close: "developer" and "engineer", "React" and "frontend", "STAAD" and "structural".

- **Text normalisation** (`tokenize.ts`, shared by trainer and runtime): placement-sheet shorthand is expanded (`Engg`, `GET`, `SDE`, `Sr.`, `Jr.`, `Asst.`, `S/W`, `N/W`...), common misspellings fixed, word families stemmed (`developer`/`development`), seniority words (`senior`, `trainee`, `intern`) dropped. Generic words such as "engineer" count only when a title has nothing else, so "Site Engineer" and "Software Engineer" don't match on that word alone.
- **Training data**: institutional records' first job titles with their branch (real, used only in aggregate: nothing row-level is stored, and a word needs 3 documents to enter the vocabulary); alumni profiles (designation, industry, skills); opportunity titles and skills; student targets and skills; and a hand-written seed lexicon of ~40 skill families, weighted 4x.
- **Selection**: dimension `k`, singular-value power and term normalisation are picked on 35 hand-written (anchor, closer, further) triplets; 10 more are reported as a holdout.
- **Runtime**: `embed(text)` returns a unit-length `Float32Array`; `similarity(a, b)` is the larger of the cosine and exact token overlap (0..1); `relatedness(a, b)` rescales the cosine so unrelated families score 0 (the floor is measured on civil vs computing titles). Use `relatedness` wherever the number feeds a score.

## Match weights (supervised, currently priors)

Logistic regression on request outcomes (accepted/closed = yes; declined, or pending more than 21 days = no), with the five match signals from `scoreMatch` as features. An L2 penalty pulls the coefficients toward the hand-set weights, and the result is normalised to sum to 1 so scores stay 0..100. Requests from seeded demo or synthetic accounts don't count. Under 50 real outcomes, the priors are kept and the JSON says so.

## Top-feed ranker

`rankFeed(posts, viewer)` scores each post with a logistic model over: connected to author, same branch, batch proximity, opportunity relevance (semantic similarity of the viewer's target role and skills to the listing), author relevance, kind preference (students favour openings), recency (48 h half-life), the author's engagement (log of reactions + comments + reposts), closed or lapsed listing, and own post. Then a diversity pass discounts repeated authors. `getTopFeed({ viewerId, limit, cursor, filter?, tag? })` in `top-feed.ts` ranks the newest 150 posts and pages with `top:<offset>` cursors.

The trainer uses first reactions, comments and reposts as positives, featurised as of that moment (age and engagement then, so the label doesn't leak). Negatives are 2 untouched posts per positive from the member's 14-day window. Weights are pulled toward the priors, with sign constraints. Members are split 80/20 for a test AUC.

## Retraining

Trainers only read. They use `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from `.env.local`. Run them from the repo root:

```sh
npx tsx scripts/ml/train-semantic-model.mjs   # first: the others use its embeddings
npx tsx scripts/ml/train-match-weights.mjs
npx tsx scripts/ml/train-feed-ranker.mjs      # about 2 minutes
# add --dry-run to any of them to print results without writing
```

Then run the tests:

```sh
npx tsx lib/ml/semantic.test.ts
npx tsx lib/ml/feed-rank.test.ts
npx tsx lib/matching.test.ts
```

The semantic tests check orderings on real titles. If a retrain breaks them, look at the data before loosening a test.

## Limitations

- **Data is mostly synthetic.** Most profile, opportunity and post text comes from the seed scripts, so the role/skill associations partly reflect the generator's assumptions. The seed lexicon is hand-written domain knowledge. Real records add titles and branches but no skills.
- **Evaluation is tiny.** 35 selection triplets and 10 holdout triplets are sanity checks, not a benchmark. The seed-lexicon weight was chosen by eye with the holdout visible, so the holdout is not pristine. Known miss: "Jr. Programmer" is not placed near "Software Developer".
- **Small vocabulary** (~220 words). Unknown words embed to zero; matching then falls back to exact token overlap.
- **No real match outcomes.** At the last training, 0 of 158 labelled requests involved two real accounts, so the match weights are the hand-set priors. A diagnostic fit on the seeded demo requests (CV AUC ~0.45) confirms those outcomes don't depend on the signals.
- **No real feed interactions.** Every reaction and comment comes from synthetic accounts that react at random. Fitting on the data alone mostly learns the generator: reactions land within 3 days of a post (test AUC 0.91, almost all from recency and engagement), and relevance and connection weights come out near 0. The shipped weights therefore stay close to the priors (test AUC 0.66 vs 0.65 for the priors). Retrain once real members have been active for a few weeks. With more than half the interactions real, the trainer automatically drops to a light penalty.
- Match features are computed from current profiles, not profiles as they were when a request was sent.
