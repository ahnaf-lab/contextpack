import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreFile, normalizeQuery } from '../src/score.js';

test('normalizeQuery lowercases, splits, and dedupes terms', () => {
  const terms = normalizeQuery('Login  Login Session');
  assert.deepEqual(terms, ['login', 'session']);
});

test('normalizeQuery returns an empty array for empty input', () => {
  assert.deepEqual(normalizeQuery(''), []);
  assert.deepEqual(normalizeQuery(undefined), []);
});

test('a file matching the query in path and content outscores an unrelated file', () => {
  const relevant = { path: 'src/auth/login.js', content: 'function login() { authenticate(); }' };
  const unrelated = { path: 'src/utils/logger.js', content: 'function log() {}' };
  const terms = normalizeQuery('login');

  const relevantScore = scoreFile(relevant, terms);
  const unrelatedScore = scoreFile(unrelated, terms);

  assert.ok(relevantScore > unrelatedScore);
});

test('scoreFile is a pure function of its inputs', () => {
  const file = { path: 'src/auth/session.js', content: 'session session token' };
  const terms = normalizeQuery('session token');

  const first = scoreFile(file, terms);
  const second = scoreFile(file, terms);

  assert.equal(first, second);
});

test('a shallower file scores higher than an equally-matching deeper file', () => {
  const shallow = { path: 'auth.js', content: 'login login' };
  const deep = { path: 'src/a/b/c/auth.js', content: 'login login' };
  const terms = normalizeQuery('login');

  assert.ok(scoreFile(shallow, terms) > scoreFile(deep, terms));
});
