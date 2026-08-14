import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreFile, scoreRepo, normalizeQuery } from '../src/score.js';

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

test('scoreRepo boosts a file imported by a relevant file, even with no keyword matches of its own', () => {
  const files = [
    { path: 'src/auth/login.js', content: "import { createSession } from './session.js';\nlogin login login" },
    { path: 'src/auth/session.js', content: 'export function createSession() {}' },
    { path: 'src/utils/logger.js', content: 'export function log() {}' },
  ];
  const terms = normalizeQuery('login');

  const scored = scoreRepo(files, terms);
  const session = scored.find((f) => f.path === 'src/auth/session.js');
  const logger = scored.find((f) => f.path === 'src/utils/logger.js');

  assert.ok(session.score > 0, 'expected an import-derived score even without a keyword match');
  assert.ok(session.score > logger.score, 'expected the imported file to outscore the unrelated one');
});

test('scoreRepo does not boost a file that is merely imported by an irrelevant file', () => {
  const files = [
    { path: 'src/utils/logger.js', content: "import { format } from './format.js';\nlog log" },
    { path: 'src/utils/format.js', content: 'export function format() {}' },
  ];
  const terms = normalizeQuery('login');

  const scored = scoreRepo(files, terms);
  const format = scored.find((f) => f.path === 'src/utils/format.js');
  const formatAlone = scoreFile({ path: 'src/utils/format.js', content: 'export function format() {}' }, terms);

  // format.js should score exactly its own (zero-keyword-match) baseline -
  // being imported by a file that itself has no genuine keyword match must
  // not inject relevance from nowhere.
  assert.equal(format.score, formatAlone);
});

test('scoreRepo gives the most recently modified file a recency bonus over an older, equally-matching file', () => {
  const files = [
    { path: 'old.js', content: 'login', modifiedAt: 1000 },
    { path: 'new.js', content: 'login', modifiedAt: 2000 },
  ];
  const terms = normalizeQuery('login');

  const scored = scoreRepo(files, terms);
  const oldFile = scored.find((f) => f.path === 'old.js');
  const newFile = scored.find((f) => f.path === 'new.js');

  assert.ok(newFile.score > oldFile.score);
});

test('scoreRepo leaves recency neutral when no file supplies modifiedAt', () => {
  const files = [
    { path: 'a.js', content: 'login' },
    { path: 'b.js', content: 'login' },
  ];
  const terms = normalizeQuery('login');

  const scored = scoreRepo(files, terms);

  assert.equal(scored[0].score, scored[1].score);
});

test('scoreRepo is deterministic across repeated calls with the same inputs', () => {
  const files = [
    { path: 'src/auth/login.js', content: "import { createSession } from './session.js';\nlogin", modifiedAt: 500 },
    { path: 'src/auth/session.js', content: 'export function createSession() {}', modifiedAt: 900 },
  ];
  const terms = normalizeQuery('login');

  const first = scoreRepo(files, terms);
  const second = scoreRepo(files, terms);

  assert.deepEqual(first, second);
});
