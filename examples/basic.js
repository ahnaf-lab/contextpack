#!/usr/bin/env node
// Runnable, filesystem-backed example of contextpack's public API.
//
// contextpack's core (`buildContextPack`) is deliberately pure - it never
// touches disk, so its output is a function of its arguments alone and can
// be golden-file tested. Reading a real repo off disk is therefore the
// caller's job, not the library's. This script is that caller: it discovers
// files under fixtures/sample-repo, reads each one's content and mtime, and
// hands the result to buildContextPack exactly as any consumer would.
//
// Run it with:
//   node examples/basic.js
//   node examples/basic.js "authentication login session" 140

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildContextPack, tailTruncate } from '../src/index.js';

const REPO_DIR = fileURLToPath(new URL('../fixtures/sample-repo', import.meta.url));

/**
 * Walk a directory on disk into the {path, content, modifiedAt}[] shape
 * buildContextPack expects. This is example glue code, not part of the
 * library - contextpack never reads the filesystem itself (see src/index.js).
 *
 * @param {string} dir - absolute path to walk
 * @returns {{path: string, content: string, modifiedAt: number}[]}
 */
function discoverFiles(dir) {
  const entries = readdirSync(dir, { recursive: true, withFileTypes: true });

  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const absoluteDir = entry.parentPath ?? entry.path;
      const absolutePath = join(absoluteDir, entry.name);
      const relativePath = relative(dir, absolutePath).split(sep).join('/');

      return {
        path: relativePath,
        content: readFileSync(absolutePath, 'utf8'),
        modifiedAt: statSync(absolutePath).mtimeMs,
      };
    });

  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return files;
}

function formatIncluded(file) {
  const flag = file.truncated ? '(truncated)' : '';
  return `  [+] ${file.path}  score=${file.score.toFixed(2)} tokens=${file.tokens} ${flag}`.trimEnd();
}

function formatExcluded(file) {
  return `  [-] ${file.path}  (${file.reason})`;
}

function main() {
  const query = process.argv[2] ?? 'authentication login session';
  const budget = Number(process.argv[3] ?? 140);

  const files = discoverFiles(REPO_DIR);

  // Swap in tailTruncate to show the strategy is genuinely pluggable, not
  // just a config flag that happens to exist - see src/truncate.js.
  const pack = buildContextPack(files, query, budget, { truncate: tailTruncate });

  console.log(`contextpack: ${files.length} files discovered under fixtures/sample-repo`);
  console.log(`query: "${pack.query}"   budget: ${pack.budget} tokens   remaining: ${pack.remaining} tokens\n`);

  console.log(`Included (${pack.included.length}):`);
  for (const file of pack.included) console.log(formatIncluded(file));

  console.log(`\nExcluded (${pack.excluded.length}):`);
  for (const file of pack.excluded) console.log(formatExcluded(file));
}

main();
