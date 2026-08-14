import test from 'node:test';
import assert from 'node:assert/strict';
import { headTruncate, tailTruncate, summaryTruncate } from '../src/truncate.js';
import { estimateTokens } from '../src/tokenize.js';
import { allocate } from '../src/allocate.js';

test('headTruncate keeps the start of the content', () => {
  const { content } = headTruncate('the quick brown fox jumps over the lazy dog', 3);
  assert.equal('the quick brown fox jumps over the lazy dog'.startsWith(content), true);
});

test('headTruncate never returns more tokens than requested', () => {
  const { content, tokens } = headTruncate('the quick brown fox jumps over the lazy dog', 3);
  assert.ok(tokens <= 3);
  assert.equal(estimateTokens(content), tokens);
});

test('headTruncate returns empty content for a zero or negative budget', () => {
  assert.deepEqual(headTruncate('anything', 0), { content: '', tokens: 0 });
  assert.deepEqual(headTruncate('anything', -5), { content: '', tokens: 0 });
});

test('tailTruncate keeps the end of the content', () => {
  const source = 'the quick brown fox jumps over the lazy dog';
  const { content } = tailTruncate(source, 3);
  assert.equal(source.endsWith(content), true);
});

test('tailTruncate never returns more tokens than requested', () => {
  const { content, tokens } = tailTruncate('the quick brown fox jumps over the lazy dog', 3);
  assert.ok(tokens <= 3);
  assert.equal(estimateTokens(content), tokens);
});

test('tailTruncate returns empty content for a zero budget', () => {
  const { content, tokens } = tailTruncate('anything', 0);
  assert.equal(content, '');
  assert.equal(tokens, 0);
});

test('tailTruncate and headTruncate disagree on which end they keep', () => {
  const source = 'head-marker' + 'x'.repeat(200) + 'tail-marker';
  const head = headTruncate(source, 5);
  const tail = tailTruncate(source, 5);

  assert.equal(head.content.includes('head-marker'), true);
  assert.equal(tail.content.includes('tail-marker'), true);
});

test('summaryTruncate never returns more tokens than requested', () => {
  const source = 'head-section\n' + 'body '.repeat(200) + '\ntail-section';
  const { content, tokens } = summaryTruncate(source, 20);

  assert.ok(tokens <= 20);
  assert.equal(estimateTokens(content), tokens);
});

test('summaryTruncate includes text from both the start and end of a long file', () => {
  const source = 'FILE-START\n' + 'filler '.repeat(500) + '\nFILE-END';
  const { content } = summaryTruncate(source, 40);

  assert.equal(content.includes('FILE-START'), true);
  assert.equal(content.includes('FILE-END'), true);
});

test('summaryTruncate returns the content whole when nothing needs cutting', () => {
  const source = 'short file';
  const { content, tokens } = summaryTruncate(source, 1000);

  assert.equal(content, source);
  assert.equal(tokens, estimateTokens(source));
});

test('summaryTruncate returns empty content for a zero budget', () => {
  const { content, tokens } = summaryTruncate('anything', 0);
  assert.equal(content, '');
  assert.equal(tokens, 0);
});

test('summaryTruncate falls back to a head slice when the budget is too small for a marker', () => {
  const source = 'x'.repeat(400);
  const { tokens } = summaryTruncate(source, 1);
  assert.ok(tokens <= 1);
});

test('allocate accepts tailTruncate as a pluggable strategy', () => {
  const files = [{ path: 'a.js', content: `head${'x'.repeat(200)}tail`, score: 1 }];
  const result = allocate(files, 10, { truncate: tailTruncate, minTruncateTokens: 1 });

  assert.equal(result.included[0].truncated, true);
  assert.equal(result.included[0].content.endsWith('tail'), true);
});

test('allocate accepts summaryTruncate as a pluggable strategy', () => {
  const files = [{ path: 'a.js', content: `START${'x'.repeat(400)}END`, score: 1 }];
  const result = allocate(files, 30, { truncate: summaryTruncate, minTruncateTokens: 1 });

  assert.equal(result.included[0].truncated, true);
  assert.equal(result.included[0].content.includes('START'), true);
  assert.equal(result.included[0].content.includes('END'), true);
});
