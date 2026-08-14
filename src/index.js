import { scoreFile, normalizeQuery } from './score.js';
import { allocate } from './allocate.js';
import { estimateTokens } from './tokenize.js';

export { scoreFile, normalizeQuery } from './score.js';
export { allocate, headTruncate } from './allocate.js';
export { estimateTokens } from './tokenize.js';

/**
 * Score a set of files against a query, then greedily allocate a token
 * budget across them - the core algorithm this package exists for.
 *
 * @param {{path: string, content: string}[]} files
 * @param {string} query - free-text description of what the prompt needs
 * @param {number} budgetTokens
 * @param {object} [options] - forwarded to allocate()
 * @returns {{query: string, budget: number, included: object[], excluded: object[], remaining: number}}
 */
export function buildContextPack(files, query, budgetTokens, options = {}) {
  const queryTerms = normalizeQuery(query);
  const scored = files.map((file) => ({
    ...file,
    score: scoreFile(file, queryTerms),
  }));

  const { included, excluded, budget, remaining } = allocate(scored, budgetTokens, options);

  return { query, budget, included, excluded, remaining };
}

export function tokenCount(text) {
  return estimateTokens(text);
}
