import { posix } from 'node:path';

// Static import/require detection, on purpose limited to relative
// specifiers ('./x', '../x', '/x') - bare specifiers ('react', 'lodash')
// point outside the repo being packed and can never resolve to one of the
// candidate files, so they carry no relevance signal here.
const IMPORT_PATTERNS = [
  /import\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g,
  /export\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g,
  /require\(\s*['"]([^'"]+)['"]\s*\)/g,
];

/**
 * Pull every relative import/require specifier out of a file's source text.
 *
 * This is deliberately a regex scan, not a parser - contextpack has no
 * dependencies and doesn't need a full AST to find `from '...'` strings. It
 * only ever reads specifier text out of quotes, so it can't be tricked into
 * executing anything.
 *
 * @param {string} content
 * @returns {string[]} unique relative specifiers, in first-seen order
 */
export function extractImportSpecifiers(content) {
  const specifiers = new Set();
  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const specifier = match[1];
      if (specifier.startsWith('.') || specifier.startsWith('/')) {
        specifiers.add(specifier);
      }
    }
  }
  return [...specifiers];
}

// Suffixes tried, in order, when resolving a relative specifier against the
// known file set - mirrors how Node/bundlers resolve extensionless imports.
const RESOLUTION_SUFFIXES = ['', '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '/index.js', '/index.mjs', '/index.ts'];

/**
 * Resolve a relative import specifier to one of the known repo-relative
 * file paths, if any suffix variant matches.
 *
 * @param {string} fromPath - repo-relative path of the file doing the importing
 * @param {string} specifier - the relative specifier text, e.g. './session'
 * @param {Set<string>} knownPaths - every repo-relative path in the candidate set
 * @returns {string|null} the matched path, or null if nothing in the set resolves
 */
export function resolveImportPath(fromPath, specifier, knownPaths) {
  const fromDir = posix.dirname(fromPath);
  const target = posix.normalize(posix.join(fromDir, specifier));

  for (const suffix of RESOLUTION_SUFFIXES) {
    const candidate = target + suffix;
    if (knownPaths.has(candidate)) return candidate;
  }
  return null;
}

/**
 * Build a directed import graph over a candidate file set: for each file,
 * the set of other candidate files it imports. Specifiers that don't
 * resolve to a file in the set (external packages, files outside the
 * candidate set) are dropped rather than guessed at.
 *
 * @param {{path: string, content: string}[]} files
 * @returns {Map<string, Set<string>>}
 */
export function buildImportGraph(files) {
  const knownPaths = new Set(files.map((file) => file.path));
  const graph = new Map();

  for (const file of files) {
    const resolved = new Set();
    for (const specifier of extractImportSpecifiers(file.content)) {
      const target = resolveImportPath(file.path, specifier, knownPaths);
      if (target && target !== file.path) resolved.add(target);
    }
    graph.set(file.path, resolved);
  }

  return graph;
}
