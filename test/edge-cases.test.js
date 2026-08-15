import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContextPack } from '../src/index.js';
import { allocate } from '../src/allocate.js';
import { isBinaryContent } from '../src/binary.js';

// --- Binary files --------------------------------------------------------

test('isBinaryContent flags content containing a NUL byte', () => {
  assert.equal(isBinaryContent('normal text'), false);
  assert.equal(isBinaryContent('PNG\u0000\u0000\u0000IHDR'), true);
});

test('isBinaryContent treats empty and undefined content as text', () => {
  assert.equal(isBinaryContent(''), false);
  assert.equal(isBinaryContent(undefined), false);
});

test('isBinaryContent does not flag ordinary unicode source text', () => {
  const content = '// caf\u00e9, \u65e5\u672c\u8a9e, emoji \ud83d\ude00\nexport const x = 1;';
  assert.equal(isBinaryContent(content), false);
});

test('isBinaryContent only samples the first chunk of very large content', () => {
  // A NUL byte far past the sample window must not be found - matches the
  // documented sampling trade-off, and keeps the check cheap on huge files.
  const content = 'a'.repeat(20000) + '\u0000';
  assert.equal(isBinaryContent(content), false);
});

test('buildContextPack excludes a binary file instead of scoring or truncating it', () => {
  const files = [
    { path: 'src/login.js', content: 'function login() {}' },
    { path: 'assets/logo.png', content: '\u0089PNG\u0000\u0000\u0000\u0000IHDR\u0000binarydata' },
  ];

  const pack = buildContextPack(files, 'login', 1000);

  assert.deepEqual(
    pack.included.map((f) => f.path),
    ['src/login.js'],
  );
  assert.deepEqual(pack.excluded, [{ path: 'assets/logo.png', reason: 'binary file' }]);
});

test('buildContextPack returns an empty pack when every file is binary', () => {
  const files = [
    { path: 'a.bin', content: 'AB\u0000CD' },
    { path: 'b.bin', content: 'EF\u0000GH' },
  ];

  const pack = buildContextPack(files, 'anything', 500);

  assert.equal(pack.included.length, 0);
  assert.deepEqual(
    pack.excluded.map((f) => f.reason),
    ['binary file', 'binary file'],
  );
});

test('buildContextPack orders binary exclusions deterministically by path regardless of input order', () => {
  const files = [
    { path: 'z.bin', content: '\u0000' },
    { path: 'a.bin', content: '\u0000' },
  ];

  const pack = buildContextPack(files, 'anything', 500);

  assert.deepEqual(
    pack.excluded.map((f) => f.path),
    ['a.bin', 'z.bin'],
  );
});

// --- Empty repos -----------------------------------------------------------

test('buildContextPack over an empty file list returns an empty, non-crashing pack', () => {
  const pack = buildContextPack([], 'login', 500);

  assert.deepEqual(pack, { query: 'login', budget: 500, included: [], excluded: [], remaining: 500 });
});

test('buildContextPack over an empty file list handles an empty query too', () => {
  const pack = buildContextPack([], '', 100);

  assert.deepEqual(pack.included, []);
  assert.deepEqual(pack.excluded, []);
  assert.equal(pack.remaining, 100);
});

test('allocate over an empty file list spends nothing and excludes nothing', () => {
  const result = allocate([], 200);

  assert.deepEqual(result, { included: [], excluded: [], budget: 200, remaining: 200 });
});

// --- Budget overflow ---------------------------------------------------------

test('buildContextPack never reports negative remaining budget, even under a zero budget', () => {
  const files = [{ path: 'a.js', content: 'x'.repeat(100) }];
  const pack = buildContextPack(files, 'x', 0);

  assert.equal(pack.included.length, 0);
  assert.equal(pack.excluded.length, 1);
  assert.equal(pack.excluded[0].reason, 'budget exhausted');
  assert.ok(pack.remaining <= 0);
});

test('buildContextPack excludes every file under a negative budget instead of crashing', () => {
  const files = [
    { path: 'a.js', content: 'aaaa' },
    { path: 'b.js', content: 'bbbb' },
  ];

  const pack = buildContextPack(files, 'a', -50);

  assert.equal(pack.included.length, 0);
  assert.equal(pack.excluded.length, 2);
  assert.ok(pack.excluded.every((f) => f.reason === 'budget exhausted'));
});

test('buildContextPack under a budget far larger than total content includes everything and reports leftover', () => {
  const files = [
    { path: 'a.js', content: 'a'.repeat(40) },
    { path: 'b.js', content: 'b'.repeat(40) },
  ];

  const pack = buildContextPack(files, 'a', 1_000_000);

  assert.equal(pack.included.length, 2);
  assert.equal(pack.excluded.length, 0);
  const spent = pack.included.reduce((sum, f) => sum + f.tokens, 0);
  assert.equal(pack.remaining, 1_000_000 - spent);
  assert.ok(pack.remaining > 0);
});

test('allocate never spends more than the budget across many files that together vastly exceed it', () => {
  const files = Array.from({ length: 200 }, (_, i) => ({
    path: `file-${String(i).padStart(3, '0')}.js`,
    content: 'x'.repeat(500),
    score: 200 - i,
  }));

  const result = allocate(files, 1000);
  const spent = result.included.reduce((sum, f) => sum + f.tokens, 0);

  assert.ok(spent <= 1000);
  assert.ok(result.remaining >= 0);
  assert.equal(result.included.length + result.excluded.length, 200);
});
