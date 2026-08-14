import { estimateTokens } from './tokenize.js';

// Files smaller than this many tokens are never worth truncating - the
// remaining slice would be too small to carry any useful context, so it is
// better to spend the budget on a fuller file elsewhere. Exported so callers
// building their own strategy (or their own allocate() options) can reuse the
// same default `allocate.js` uses.
export const DEFAULT_MIN_TRUNCATE_TOKENS = 20;

const APPROX_CHARS_PER_TOKEN = 4;

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

  let sliced = content.slice(0, maxTokens * APPROX_CHARS_PER_TOKEN);
  let tokens = estimateTokens(sliced);

  // The chars/4 estimate is approximate, so trim in small steps until the
  // slice actually fits the budget - this keeps allocate()'s bookkeeping
  // exact instead of merely "close".
  while (tokens > maxTokens && sliced.length > 0) {
    sliced = sliced.slice(0, Math.max(0, sliced.length - APPROX_CHARS_PER_TOKEN));
    tokens = estimateTokens(sliced);
  }

  return { content: sliced, tokens };
}

/**
 * Keep the tail of the file and cut the start.
 *
 * The mirror image of `headTruncate`: useful for files where the signal is
 * at the bottom - a changelog, a log file, or a source file whose top is
 * mostly a long license header the query doesn't care about.
 *
 * @param {string} content
 * @param {number} maxTokens
 * @returns {{content: string, tokens: number}}
 */
export function tailTruncate(content, maxTokens) {
  if (maxTokens <= 0) return { content: '', tokens: 0 };

  let sliced = content.slice(-(maxTokens * APPROX_CHARS_PER_TOKEN));
  let tokens = estimateTokens(sliced);

  // Same iterative correction as headTruncate, but shrinking from the front
  // so the kept text stays anchored to the end of the file.
  while (tokens > maxTokens && sliced.length > 0) {
    sliced = sliced.slice(APPROX_CHARS_PER_TOKEN);
    tokens = estimateTokens(sliced);
  }

  return { content: sliced, tokens };
}

// Inserted between the head and tail slices in summaryTruncate's output, so
// a reader (human or model) can tell the gap is an intentional cut, not a
// file that genuinely ends mid-statement.
const SUMMARY_MARKER = '\n/* ... truncated ... */\n';

/**
 * Split the budget between the head and tail of the file, on the
 * observation that a source file's most structurally informative parts are
 * usually its start (imports, top-level docstring, opening declarations)
 * and its end (exports, closing braces) - the middle is often
 * implementation detail that the head/tail already imply the shape of.
 *
 * This is a deterministic, non-ML "summary": no content is generated, only
 * selected and stitched together with a marker showing where the cut is.
 *
 * @param {string} content
 * @param {number} maxTokens
 * @returns {{content: string, tokens: number}}
 */
export function summaryTruncate(content, maxTokens) {
  if (maxTokens <= 0) return { content: '', tokens: 0 };

  const markerTokens = estimateTokens(SUMMARY_MARKER);

  // Not enough budget to fit the marker plus any real content on both
  // sides - falling back to a plain head slice is strictly better than
  // spending the whole budget on the marker itself.
  if (maxTokens <= markerTokens) {
    return headTruncate(content, maxTokens);
  }

  const contentBudget = maxTokens - markerTokens;
  const headBudget = Math.ceil(contentBudget / 2);
  const tailBudget = contentBudget - headBudget;

  const head = headTruncate(content, headBudget);
  const tail = tailTruncate(content, tailBudget);

  // If the head and tail slices are together at least as long as the whole
  // file, they'd overlap or exactly cover it - there is nothing left in the
  // middle to cut, so return the file whole rather than inserting a marker
  // into content that was never actually truncated.
  if (head.content.length + tail.content.length >= content.length) {
    return { content, tokens: estimateTokens(content) };
  }

  const combined = head.content + SUMMARY_MARKER + tail.content;
  return { content: combined, tokens: estimateTokens(combined) };
}
