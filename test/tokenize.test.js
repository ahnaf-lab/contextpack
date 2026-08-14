import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateTokens } from '../src/tokenize.js';

test('estimateTokens returns 0 for empty input', () => {
  assert.equal(estimateTokens(''), 0);
  assert.equal(estimateTokens(undefined), 0);
});

test('estimateTokens scales with content length', () => {
  const short = estimateTokens('abcd');
  const long = estimateTokens('abcd'.repeat(10));
  assert.equal(short, 1);
  assert.equal(long, 10);
});

test('estimateTokens is deterministic across repeated calls', () => {
  const text = 'the quick brown fox jumps over the lazy dog';
  const first = estimateTokens(text);
  const second = estimateTokens(text);
  assert.equal(first, second);
});
