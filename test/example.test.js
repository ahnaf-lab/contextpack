import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const EXAMPLE_PATH = fileURLToPath(new URL('../examples/basic.js', import.meta.url));

test('examples/basic.js runs end-to-end against the fixture repo with default args', () => {
  const output = execFileSync(process.execPath, [EXAMPLE_PATH], { encoding: 'utf8' });

  assert.match(output, /contextpack: \d+ files discovered under fixtures\/sample-repo/);
  assert.match(output, /Included \(\d+\):/);
  assert.match(output, /Excluded \(\d+\):/);
});

test('examples/basic.js accepts a custom query and budget via argv', () => {
  const output = execFileSync(process.execPath, [EXAMPLE_PATH, 'billing invoice', '80'], { encoding: 'utf8' });

  assert.match(output, /query: "billing invoice"\s+budget: 80 tokens/);
  assert.match(output, /\[\+\] src\/payments\/invoice\.js/);
});

test('examples/basic.js exits cleanly (exit code 0)', () => {
  // execFileSync throws on a non-zero exit code, so simply not throwing here
  // is itself the assertion that the example script completed successfully.
  assert.doesNotThrow(() => execFileSync(process.execPath, [EXAMPLE_PATH], { encoding: 'utf8' }));
});
