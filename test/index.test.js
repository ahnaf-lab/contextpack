import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContextPack, tokenCount } from '../src/index.js';

test('buildContextPack echoes back the query and budget', () => {
  const files = [{ path: 'a.js', content: 'login' }];
  const pack = buildContextPack(files, 'login', 50);

  assert.equal(pack.query, 'login');
  assert.equal(pack.budget, 50);
});

test('buildContextPack ranks a relevant file above an unrelated one', () => {
  const files = [
    { path: 'src/auth/login.js', content: 'login login login' },
    { path: 'src/utils/logger.js', content: 'log log log' },
  ];

  const pack = buildContextPack(files, 'login', 1000);

  assert.deepEqual(
    pack.included.map((f) => f.path),
    ['src/auth/login.js', 'src/utils/logger.js'],
  );
});

test('tokenCount delegates to the same estimator used internally', () => {
  assert.equal(tokenCount('abcd'), 1);
  assert.equal(tokenCount(''), 0);
});
