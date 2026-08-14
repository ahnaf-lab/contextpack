import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES_DIR = fileURLToPath(new URL('../../fixtures/sample-repo', import.meta.url));

/**
 * Load every file under fixtures/sample-repo as {path, content}, sorted by
 * path so the result is stable across platforms and directory-read orders -
 * required for the golden-file test to be deterministic.
 *
 * @returns {{path: string, content: string}[]}
 */
export function loadFixtureFiles() {
  const entries = readdirSync(FIXTURES_DIR, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const absoluteDir = entry.parentPath ?? entry.path;
      const absolutePath = join(absoluteDir, entry.name);
      const relativePath = relative(FIXTURES_DIR, absolutePath).split(sep).join('/');
      return {
        path: relativePath,
        content: readFileSync(absolutePath, 'utf8'),
      };
    });

  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return files;
}
