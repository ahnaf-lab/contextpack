import { estimateTokens } from './tokenize.js';

// Files smaller than this many tokens are never worth truncating - the
// remaining slice would be too small to carry any useful context, so it is
// better to spend the budget on a fuller file elsewhere.
const DEFAULT_MIN_TRUNCATE_TOKENS = 20;

/**
 * Default truncation strategy: keep the head of the file and cut the rest.
 *
 * Truncation strategies are pluggable (see `allocate`'s `truncate` option) -
 * this "head" strategy is the sensible default because file headers
 * (imports, top-level docstrings, function signatures) tend to carry the
 * highest information density per token in source files.
 *
 * @param {string} content
 * @param {number} maxTokens
 * @returns {{content: string, tokens: number}}
 */
export function headTruncate(content, maxTokens) {
  if (maxTokens <= 0) return { content: '', tokens: 0 };

  const approxCharsPerToken = 4;
  let sliced = content.slice(0, maxTokens * approxCharsPerToken);
  let tokens = estimateTokens(sliced);

  // The chars/4 estimate is approximate, so trim in small steps until the
  // slice actually fits the budget - this keeps allocate()'s bookkeeping
  // exact instead of merely "close".
  while (tokens > maxTokens && sliced.length > 0) {
    sliced = sliced.slice(0, Math.max(0, sliced.length - approxCharsPerToken));
    tokens = estimateTokens(sliced);
  }

  return { content: sliced, tokens };
}

function compareForAllocation(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  // Deterministic tie-break: stable, total order regardless of input order.
  if (a.path < b.path) return -1;
  if (a.path > b.path) return 1;
  return 0;
}

/**
 * Greedily allocate a token budget across pre-scored files.
 *
 * Files are considered in descending score order (deterministic tie-break
 * by path). Each file is included whole if it fits the remaining budget,
 * truncated if a truncation strategy can still make meaningful use of the
 * remaining budget, or excluded otherwise. Once a file is excluded, every
 * later (lower-scored) file is also excluded for the same reason: the
 * ordering is monotonic, so nothing further down the list can fit either.
 *
 * @param {{path: string, content: string, score: number}[]} files
 * @param {number} budgetTokens
 * @param {{truncate?: (content: string, maxTokens: number) => {content: string, tokens: number}, minTruncateTokens?: number}} [options]
 * @returns {{included: object[], excluded: object[], budget: number, remaining: number}}
 */
export function allocate(files, budgetTokens, options = {}) {
  const truncate = options.truncate ?? headTruncate;
  const minTruncateTokens = options.minTruncateTokens ?? DEFAULT_MIN_TRUNCATE_TOKENS;

  const ordered = [...files].sort(compareForAllocation);

  let remaining = budgetTokens;
  const included = [];
  const excluded = [];

  for (const file of ordered) {
    if (remaining <= 0) {
      excluded.push({ path: file.path, reason: 'budget exhausted' });
      continue;
    }

    const fileTokens = estimateTokens(file.content);

    if (fileTokens <= remaining) {
      included.push({
        path: file.path,
        content: file.content,
        tokens: fileTokens,
        truncated: false,
        score: file.score,
      });
      remaining -= fileTokens;
      continue;
    }

    if (remaining >= minTruncateTokens) {
      const result = truncate(file.content, remaining);
      included.push({
        path: file.path,
        content: result.content,
        tokens: result.tokens,
        truncated: true,
        score: file.score,
      });
      remaining -= result.tokens;
      continue;
    }

    excluded.push({ path: file.path, reason: 'insufficient budget remaining' });
  }

  return { included, excluded, budget: budgetTokens, remaining };
}
