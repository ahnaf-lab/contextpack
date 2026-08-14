// Deterministic relevance scoring.
//
// A file's score is a pure function of its inputs - path, content, query
// terms, the rest of the candidate set (for import propagation), and an
// optional caller-supplied `modifiedAt` (for recency). No randomness, no
// internal clock or filesystem access. That is what makes the golden-file
// tests possible: the same fixture set and query must always produce the
// same score, in the same order, forever.

import { buildImportGraph } from './imports.js';

// A term matching in the path is a much stronger relevance signal than a
// term matching in the content - "auth/login.js" is almost certainly more
// relevant to "login" than a file that merely mentions the word once deep
// inside a comment.
const PATH_MATCH_WEIGHT = 10;
const CONTENT_MATCH_WEIGHT = 2;

// Fraction of an importing file's own keyword score that flows to each file
// it imports. A file with no keyword matches of its own can still matter -
// "session.js" is relevant to a "login" query if "login.js" (which matches)
// depends on it - but that inherited relevance should never outweigh a
// direct match, hence a fraction well under 1.
const IMPORT_BOOST_RATIO = 0.3;

// Upper bound on the bonus given to the most recently modified file in a
// scored set, relative to the oldest. Recency is a weak, tie-breaking-scale
// signal on purpose: a stale but on-topic file should still outscore a
// fresh but unrelated one.
const RECENCY_WEIGHT = 3;

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
 * The keyword-matching component alone: how strongly a file's own path and
 * content match the query terms, with no tie-breaking or cross-file signal
 * mixed in. Kept separate from `scoreFile` because the import-boost signal
 * (see `computeImportBoosts`) must propagate genuine keyword relevance
 * only - mixing in the depth tie-break would let an importer's mere
 * shallowness leak relevance into everything it imports.
 *
 * @param {{path: string, content: string}} file
 * @param {string[]} queryTerms - already normalized (see normalizeQuery)
 * @returns {number}
 */
function keywordMatchScore(file, queryTerms) {
  const path = file.path.toLowerCase();
  const content = file.content.toLowerCase();

  let pathMatches = 0;
  let contentMatches = 0;

  for (const term of queryTerms) {
    if (path.includes(term)) pathMatches += 1;
    contentMatches += countOccurrences(content, term);
  }

  return pathMatches * PATH_MATCH_WEIGHT + contentMatches * CONTENT_MATCH_WEIGHT;
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
  // Small tie-breaking bonus for shallower files, so two files with
  // identical keyword matches don't tie arbitrarily - root-level and
  // shallow files edge out deeply nested ones of otherwise equal relevance.
  const depthBonus = 1 / (pathDepth(file.path) + 1);

  return keywordMatchScore(file, queryTerms) + depthBonus;
}

/**
 * Propagate keyword relevance across the import graph, one hop.
 *
 * A file that a relevant file imports is itself relevant, even if it never
 * mentions the query terms - "session.js" backs "login.js" whether or not
 * it happens to contain the word "login". Only a fraction of the importer's
 * score transfers (see IMPORT_BOOST_RATIO), and only one hop is walked: a
 * transitive n-hop propagation would let an unrelated file inherit
 * relevance through a long, incidental import chain.
 *
 * @param {{path: string, content: string}[]} files
 * @param {Map<string, number>} keywordScores - path -> keywordMatchScore() result
 * @returns {Map<string, number>} path -> import-derived bonus
 */
function computeImportBoosts(files, keywordScores) {
  const graph = buildImportGraph(files);
  const boosts = new Map(files.map((file) => [file.path, 0]));

  for (const [importerPath, importedPaths] of graph) {
    const importerScore = keywordScores.get(importerPath) ?? 0;
    if (importerScore <= 0) continue;

    for (const importedPath of importedPaths) {
      if (!boosts.has(importedPath)) continue;
      boosts.set(importedPath, boosts.get(importedPath) + importerScore * IMPORT_BOOST_RATIO);
    }
  }

  return boosts;
}

/**
 * Score each file's recency relative to the others being scored together.
 *
 * Recency is deliberately relative to the batch, not to wall-clock time:
 * "modifiedAt" is caller-supplied (e.g. from a git log or fs.stat, neither
 * of which this library touches itself), so the same batch always scores
 * the same way regardless of when the scorer happens to run. A file is
 * only ever nudged relative to its neighbours in this call, on a scale
 * capped by RECENCY_WEIGHT so it can break ties without ever burying a
 * strong keyword or import match.
 *
 * @param {{path: string, modifiedAt?: number}[]} files
 * @returns {Map<string, number>} path -> recency bonus (0 if no timestamps given)
 */
function computeRecencyBonuses(files) {
  const timestamps = files
    .map((file) => file.modifiedAt)
    .filter((value) => typeof value === 'number' && Number.isFinite(value));

  const bonuses = new Map(files.map((file) => [file.path, 0]));
  if (timestamps.length === 0) return bonuses;

  const oldest = Math.min(...timestamps);
  const newest = Math.max(...timestamps);
  const range = newest - oldest;

  for (const file of files) {
    if (typeof file.modifiedAt !== 'number' || !Number.isFinite(file.modifiedAt)) continue;
    const normalized = range === 0 ? 1 : (file.modifiedAt - oldest) / range;
    bonuses.set(file.path, normalized * RECENCY_WEIGHT);
  }

  return bonuses;
}

/**
 * Score every file in a candidate set against a query, combining three
 * heuristic signals: keyword matches (path + content, see scoreFile),
 * one-hop import propagation, and relative recency.
 *
 * This is the scorer contextpack actually ships: `scoreFile` alone only
 * ever sees one file at a time and can't know what imports what, or which
 * file in the set is newest - both require the whole candidate set at once.
 *
 * @param {{path: string, content: string, modifiedAt?: number}[]} files
 * @param {string[]} queryTerms - already normalized (see normalizeQuery)
 * @returns {object[]} each input file plus a combined `score`
 */
export function scoreRepo(files, queryTerms) {
  const matchScores = new Map(files.map((file) => [file.path, keywordMatchScore(file, queryTerms)]));
  const importBoosts = computeImportBoosts(files, matchScores);
  const recencyBonuses = computeRecencyBonuses(files);

  return files.map((file) => ({
    ...file,
    score: scoreFile(file, queryTerms) + importBoosts.get(file.path) + recencyBonuses.get(file.path),
  }));
}
