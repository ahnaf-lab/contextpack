import test from 'node:test';
import assert from 'node:assert/strict';
import { allocate, headTruncate } from '../src/allocate.js';
import { estimateTokens } from '../src/tokenize.js';

test('allocate includes every file whole when the budget is large enough', () => {
  const files = [
    { path: 'a.js', content: 'aaaa', score: 5 },
    { path: 'b.js', content: 'bbbb', score: 3 },
  ];

  const result = allocate(files, 1000);

  assert.equal(result.included.length, 2);
  assert.equal(result.excluded.length, 0);
  assert.equal(result.included[0].path, 'a.js');
  assert.equal(result.included[0].truncated, false);
});

test('allocate orders included files by descending score', () => {
  const files = [
    { path: 'low.js', content: 'x', score: 1 },
    { path: 'high.js', content: 'x', score: 9 },
    { path: 'mid.js', content: 'x', score: 5 },
  ];

  const result = allocate(files, 1000);

  assert.deepEqual(
    result.included.map((f) => f.path),
    ['high.js', 'mid.js', 'low.js'],
  );
});

test('allocate breaks score ties deterministically by path', () => {
  const files = [
    { path: 'z.js', content: 'x', score: 5 },
    { path: 'a.js', content: 'x', score: 5 },
  ];

  const result = allocate(files, 1000);

  assert.deepEqual(
    result.included.map((f) => f.path),
    ['a.js', 'z.js'],
  );
});

test('allocate excludes a file that cannot fit and is too small to usefully truncate', () => {
  const files = [
    { path: 'big.js', content: 'x'.repeat(400), score: 5 },
    { path: 'tail.js', content: 'y'.repeat(400), score: 1 },
  ];

  // Budget fits nothing more after big.js is truncated to fill it exactly.
  const result = allocate(files, 90, { minTruncateTokens: 20 });

  assert.equal(result.included.length, 1);
  assert.equal(result.included[0].truncated, true);
  assert.equal(result.excluded.length, 1);
  assert.equal(result.excluded[0].path, 'tail.js');
  assert.equal(result.excluded[0].reason, 'budget exhausted');
});

test('allocate never spends more tokens than the budget', () => {
  const files = [
    { path: 'a.js', content: 'a'.repeat(1000), score: 3 },
    { path: 'b.js', content: 'b'.repeat(1000), score: 2 },
    { path: 'c.js', content: 'c'.repeat(1000), score: 1 },
  ];

  const result = allocate(files, 150);
  const spent = result.included.reduce((sum, f) => sum + f.tokens, 0);

  assert.ok(spent <= 150);
});

test('allocate accepts a custom truncation strategy', () => {
  const tailTruncate = (content, maxTokens) => {
    const maxChars = maxTokens * 4;
    const sliced = content.slice(-maxChars);
    return { content: sliced, tokens: estimateTokens(sliced) };
  };
  const files = [{ path: 'a.js', content: `head${'x'.repeat(200)}tail`, score: 1 }];

  const result = allocate(files, 10, { truncate: tailTruncate, minTruncateTokens: 1 });

  assert.equal(result.included[0].content.endsWith('tail'), true);
});

test('allocate still exposes headTruncate for backward compatibility', () => {
  const { content, tokens } = headTruncate('the quick brown fox jumps over the lazy dog', 3);
  assert.ok(tokens <= 3);
  assert.equal(estimateTokens(content), tokens);
});
