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

Edge cases are handled explicitly, not left to whatever happens to fall out:

- **Binary files** - a file whose content looks binary (`isBinaryContent`,
  `src/binary.js`) is filtered out before scoring and reported in `excluded`
  with reason `'binary file'`, the same way a budget-excluded file is.
  Scoring keywords against raw bytes is meaningless, and it keeps a
  multi-byte character from being split mid-sequence by a truncation
  strategy. Detection follows the same heuristic git uses: a NUL byte
  anywhere in a leading sample of the content.
- **Empty input** - an empty file list, or a zero/negative/empty query,
  never throws; `buildContextPack` returns `{ included: [], excluded: [] }`
  (or excludes every file with reason `'budget exhausted'` for a
  non-positive budget) rather than crashing on empty arrays or maps.
- **Budget overflow** - a budget far larger than the total content spends
  exactly what's needed and reports the true leftover in `remaining`; a
  budget of zero or below excludes every file cleanly instead of allocating
  negative space. `allocate` never reports `remaining < 0` or spends more
  tokens than the budget it was given. See `test/edge-cases.test.js` for the
  regression coverage of all of the above.

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

## Example

`examples/basic.js` is a small, runnable script that shows how a real caller
uses the public API end to end: it discovers files under
`fixtures/sample-repo` from disk (`buildContextPack` itself never touches the
filesystem - see `## Design notes`), then packs them against a query and
prints what was included, truncated, or excluded, and why.

```bash
npm run example
# or with a custom query and budget:
node examples/basic.js "billing invoice" 80
```

## Public API

Everything below is exported from `src/index.js`:

- `buildContextPack(files, query, budgetTokens, options?)` - the top-level
  function documented in `## Usage`; scores and allocates in one call.
- `scoreRepo(files, queryTerms)` / `scoreFile(file, queryTerms)` /
  `normalizeQuery(query)` - the scoring stage on its own, for callers who
  want scores without allocation.
- `allocate(scoredFiles, budgetTokens, options?)` - the allocation stage on
  its own, for callers who want to plug in their own scorer.
- `headTruncate` / `tailTruncate` / `summaryTruncate` - the built-in
  truncation strategies, each usable directly or via `options.truncate`.
- `buildImportGraph(files)` / `extractImportSpecifiers(content)` /
  `resolveImportPath(fromPath, specifier, knownPaths)` - the import-graph
  signal `scoreRepo` uses internally, exposed for callers who want it
  standalone.
- `estimateTokens(text)` / `tokenCount(text)` - the token estimator
  `allocate` and the truncation strategies use internally (both names refer
  to the same function; `tokenCount` is the public-facing alias).
- `isBinaryContent(content)` - the binary-file detector `buildContextPack`
  uses internally to exclude non-text files before scoring; see
  `## Design notes` above.

## Status

Built autonomously and
gated on passing tests - every change here was verified by a real test run
before being committed, including a golden-file test that pins the exact
score/allocation output for a fixture repository (`fixtures/sample-repo/`).

This covers the core score+allocate algorithm, the heuristic relevance
scorer (keywords, imports, recency), pluggable truncation (head/tail/
summary), a stable public API with a runnable, filesystem-backed example
(`examples/basic.js`, see `## Example`), and edge-case handling for binary
files, empty input, and budget overflow (`test/edge-cases.test.js`). A
CLI/config surface is not implemented yet.

## Design notes

- **Token estimation is approximate, on purpose.** `estimateTokens` uses a
  chars/4 heuristic rather than a model-specific tokenizer, so the whole
  library stays dependency-free and isn't tied to one vendor's encoding. It
  is deterministic and consistent, which is what the allocation algorithm
  needs - not perfect precision.
- **No dependencies.** Everything here (scoring, allocation, truncation,
  fixture loading) is built on Node's standard library.
