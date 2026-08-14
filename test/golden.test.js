import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildContextPack } from '../src/index.js';
import { loadFixtureFiles } from './helpers/loadFixtures.js';

const GOLDEN_PATH = fileURLToPath(new URL('./golden/expected-pack.json', import.meta.url));

test('buildContextPack matches the golden fixture output exactly', () => {
  const files = loadFixtureFiles();
  const pack = buildContextPack(files, 'authentication login session', 140);

  const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));

  assert.deepEqual(pack, golden);
});

test('buildContextPack over the fixture set exercises inclusion, truncation, and exclusion', () => {
  const files = loadFixtureFiles();
  const pack = buildContextPack(files, 'authentication login session', 140);

  const truncatedCount = pack.included.filter((f) => f.truncated).length;

  assert.ok(pack.included.length > 0, 'expected at least one included file');
  assert.ok(pack.excluded.length > 0, 'expected at least one excluded file');
  assert.ok(truncatedCount > 0, 'expected at least one truncated file');
});

test('buildContextPack is deterministic across repeated runs over the same fixtures', () => {
  const files = loadFixtureFiles();
  const first = buildContextPack(files, 'authentication login session', 140);
  const second = buildContextPack(files, 'authentication login session', 140);

  assert.deepEqual(first, second);
});
