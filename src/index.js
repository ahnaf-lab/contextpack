import { scoreFile, scoreRepo, normalizeQuery } from './score.js';
import { allocate } from './allocate.js';
import { estimateTokens } from './tokenize.js';
import { isBinaryContent } from './binary.js';

export { scoreFile, scoreRepo, normalizeQuery } from './score.js';
export { allocate } from './allocate.js';
export { headTruncate, tailTruncate, summaryTruncate } from './truncate.js';
export { estimateTokens } from './tokenize.js';
export { extractImportSpecifiers, resolveImportPath, buildImportGraph } from './imports.js';
export { isBinaryContent } from './binary.js';

/**
 * Score a set of files against a query (keywords + import graph + relative
 * recency, see `scoreRepo`), then greedily allocate a token budget across
 * them - the core algorithm this package exists for.
 *
 * Binary files (see `isBinaryContent`) are filtered out before scoring:
 * keyword/import signals are meaningless over raw bytes, and truncation
 * strategies that slice on token boundaries can split a multi-byte
 * character mid-sequence. They are reported in `excluded` like any other
 * file, so a caller can always see every input file was accounted for and
 * why it isn't in `included`.
 *
 * @param {{path: string, content: string, modifiedAt?: number}[]} files
 * @param {string} query - free-text description of what the prompt needs
 * @param {number} budgetTokens
 * @param {object} [options] - forwarded to allocate()
 * @returns {{query: string, budget: number, included: object[], excluded: object[], remaining: number}}
 */
export function buildContextPack(files, query, budgetTokens, options = {}) {
  const queryTerms = normalizeQuery(query);

  const textFiles = [];
  const binaryExcluded = [];
  for (const file of files) {
    if (isBinaryContent(file.content)) {
      binaryExcluded.push({ path: file.path, reason: 'binary file' });
    } else {
      textFiles.push(file);
    }
  }
  // Deterministic regardless of input order, matching allocate()'s own
  // tie-break rule for the same reason - a stable output for a given input.
  binaryExcluded.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const scored = scoreRepo(textFiles, queryTerms);
  const { included, excluded, budget, remaining } = allocate(scored, budgetTokens, options);

  return { query, budget, included, excluded: [...binaryExcluded, ...excluded], remaining };
}

export function tokenCount(text) {
  return estimateTokens(text);
}
