// Deterministic relevance scoring.
//
// A file's score is a pure function of (file path, file content, query
// terms) - no timestamps, randomness, or filesystem metadata. That is what
// makes the golden-file tests possible: the same fixture set and query must
// always produce the same score, in the same order, forever.

// A term matching in the path is a much stronger relevance signal than a
// term matching in the content - "auth/login.js" is almost certainly more
// relevant to "login" than a file that merely mentions the word once deep
// inside a comment.
const PATH_MATCH_WEIGHT = 10;
const CONTENT_MATCH_WEIGHT = 2;

/**
 * Split a free-text query into normalized, deduplicated terms.
 * @param {string} query
 * @returns {string[]}
 */
export function normalizeQuery(query) {
  if (!query) return [];
  const seen = new Set();
  for (const term of query.toLowerCase().split(/\s+/)) {
    if (term) seen.add(term);
  }
  return [...seen];
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let index = 0;
  while ((index = haystack.indexOf(needle, index)) !== -1) {
    count += 1;
    index += needle.length;
  }
  return count;
}

function pathDepth(path) {
  return path.split('/').filter(Boolean).length - 1;
}

/**
 * Score a single file's relevance against a set of query terms.
 *
 * Higher is more relevant. The score has no fixed range or unit - it is
 * only meaningful relative to other files scored with the same terms.
 *
 * @param {{path: string, content: string}} file
 * @param {string[]} queryTerms - already normalized (see normalizeQuery)
 * @returns {number}
 */
export function scoreFile(file, queryTerms) {
  const path = file.path.toLowerCase();
  const content = file.content.toLowerCase();

  let pathMatches = 0;
  let contentMatches = 0;

  for (const term of queryTerms) {
    if (path.includes(term)) pathMatches += 1;
    contentMatches += countOccurrences(content, term);
  }

  // Small tie-breaking bonus for shallower files, so two files with
  // identical keyword matches don't tie arbitrarily - root-level and
  // shallow files edge out deeply nested ones of otherwise equal relevance.
  const depthBonus = 1 / (pathDepth(file.path) + 1);

  return pathMatches * PATH_MATCH_WEIGHT + contentMatches * CONTENT_MATCH_WEIGHT + depthBonus;
}
