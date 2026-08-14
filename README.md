# contextpack

A zero-dependency Node library that transforms a codebase into a
token-budgeted context bundle for LLM prompts, using deterministic relevance
scoring and pluggable truncation strategies instead of ad-hoc globbing. For
engineers building RAG or agent pipelines who need to know exactly *why* a
file was included, excluded, or cut.

The core algorithm: score every candidate file against a query, then
greedily allocate a fixed token budget across them, truncating or excluding
files as the budget runs out. Everything is a pure function of its inputs,
verified against a golden-file fixture so the output for a given file set,
query, and budget never silently drifts.

Scoring is a heuristic blend of three signals: keyword matches (path and
content), one-hop import propagation (a file another relevant file imports
inherits some of that relevance, even with no keyword match of its own), and
relative recency (an optional, caller-supplied `modifiedAt` per file). See
`## Usage` and `src/score.js` for how each is weighted.

## Install

```bash
npm install
```

(No runtime dependencies are installed - contextpack has none. `npm install`
just sets up the local dev environment for running tests.)

## Usage

```js
import { buildContextPack } from './src/index.js';

const files = [
  { path: 'src/auth/login.js', content: '...', modifiedAt: 1723680000000 },
  { path: 'src/utils/logger.js', content: '...' }, // modifiedAt is optional
];

const pack = buildContextPack(files, 'authentication login', /* budgetTokens */ 500);

console.log(pack.included); // [{ path, content, tokens, truncated, score }, ...]
console.log(pack.excluded); // [{ path, reason }, ...]
console.log(pack.remaining); // unused tokens left in the budget
```

`buildContextPack(files, query, budgetTokens, options?)`:

1. Scores each file with `scoreRepo` (`src/score.js`), which combines:
   - **Keywords** (`scoreFile`) - path matches count more than content
     matches, and shallower files win small ties.
   - **Imports** (`src/imports.js`) - relative `import`/`export ... from`/
     `require` specifiers are resolved against the candidate file set into a
     graph; a file imported by a relevant file inherits a fraction of that
     relevance, even with no keyword match of its own. Only one hop
     propagates, so relevance can't leak through a long incidental chain.
   - **Recency** - if a file supplies `modifiedAt` (an epoch-ms number from
     the caller, e.g. a `git log` or `fs.stat` timestamp - contextpack reads
     neither itself), the most recently modified file in the *given* set
     gets a small, capped bonus over the oldest. Recency is relative to the
     batch, not wall-clock time, so scoring stays deterministic. Omitting
     `modifiedAt` disables the signal entirely (bonus 0).
2. Sorts files by descending score, breaking ties by path for a fully
   deterministic order.
3. Greedily allocates the token budget (`src/allocate.js`): a file is
   included whole if it fits, truncated if the remaining budget is still
   large enough to be useful, or excluded with a stated `reason` otherwise.

Truncation is pluggable - pass `{ truncate: (content, maxTokens) => ({ content, tokens }) }`
to `buildContextPack`'s `options` (or `allocate` directly) to use a different
strategy than the default. `src/truncate.js` ships three, each unit-tested
independently in `test/truncate.test.js`:

- `headTruncate` (default) - keep the start of the file, drop the rest.
- `tailTruncate` - keep the end of the file, drop the start; useful for
  files where the signal is at the bottom, like a changelog or log file.
- `summaryTruncate` - keep both the start and end, joined by a
  `/* ... truncated ... */` marker, splitting the budget between them. Most
  source files carry their structure (imports, top-level declarations,
  exports) at the two ends rather than in the middle, so this strategy is a
  deterministic, non-ML "summary": nothing is generated, only selected.

```js
import { buildContextPack, tailTruncate } from './src/index.js';

const pack = buildContextPack(files, 'authentication', 500, { truncate: tailTruncate });
```

## Status

Built autonomously with [Claude Code](https://claude.com/claude-code) and
gated on passing tests - every change here was verified by a real test run
before being committed, including a golden-file test that pins the exact
score/allocation output for a fixture repository (`fixtures/sample-repo/`).

This covers the core score+allocate algorithm, the heuristic relevance
scorer (keywords, imports, recency), and pluggable truncation (head/tail/
summary). Discovering files from a real filesystem and a CLI/config surface
are not implemented yet.

## Design notes

- **Token estimation is approximate, on purpose.** `estimateTokens` uses a
  chars/4 heuristic rather than a model-specific tokenizer, so the whole
  library stays dependency-free and isn't tied to one vendor's encoding. It
  is deterministic and consistent, which is what the allocation algorithm
  needs - not perfect precision.
- **No dependencies.** Everything here (scoring, allocation, truncation,
  fixture loading) is built on Node's standard library.
