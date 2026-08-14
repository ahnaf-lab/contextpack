import { estimateTokens } from './tokenize.js';
import { headTruncate, DEFAULT_MIN_TRUNCATE_TOKENS } from './truncate.js';

// Re-exported so existing callers of `allocate.js` keep working - the
// strategies themselves now live in `truncate.js` alongside `tailTruncate`
// and `summaryTruncate`, which have no reason to be reachable through this
// module.
export { headTruncate };

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
