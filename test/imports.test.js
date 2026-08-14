import test from 'node:test';
import assert from 'node:assert/strict';
import { extractImportSpecifiers, resolveImportPath, buildImportGraph } from '../src/imports.js';

test('extractImportSpecifiers finds relative import, export-from, and require specifiers', () => {
  const content = `
    import { createSession } from './session.js';
    import '../shared/setup.js';
    export { verifyToken } from './session.js';
    const fs = require('/utils/fs.js');
  `;

  const specifiers = extractImportSpecifiers(content);

  assert.deepEqual(
    [...specifiers].sort(),
    ['../shared/setup.js', './session.js', '/utils/fs.js'].sort(),
  );
});

test('extractImportSpecifiers ignores bare package specifiers', () => {
  const content = `
    import React from 'react';
    import { z } from 'zod';
    import { createSession } from './session.js';
  `;

  assert.deepEqual(extractImportSpecifiers(content), ['./session.js']);
});

test('resolveImportPath matches a specifier against the known file set with common suffixes', () => {
  const knownPaths = new Set(['src/auth/login.js', 'src/auth/session.js', 'src/utils/index.js']);

  assert.equal(resolveImportPath('src/auth/login.js', './session.js', knownPaths), 'src/auth/session.js');
  assert.equal(resolveImportPath('src/auth/login.js', './session', knownPaths), 'src/auth/session.js');
  assert.equal(resolveImportPath('src/auth/login.js', '../utils', knownPaths), 'src/utils/index.js');
});

test('resolveImportPath returns null when nothing in the known set matches', () => {
  const knownPaths = new Set(['src/auth/login.js']);
  assert.equal(resolveImportPath('src/auth/login.js', './missing.js', knownPaths), null);
});

test('buildImportGraph resolves edges only between files present in the given set', () => {
  const files = [
    { path: 'src/auth/login.js', content: "import { createSession } from './session.js';" },
    { path: 'src/auth/session.js', content: 'export function createSession() {}' },
    { path: 'src/utils/logger.js', content: "import pino from 'pino';" },
  ];

  const graph = buildImportGraph(files);

  assert.deepEqual([...graph.get('src/auth/login.js')], ['src/auth/session.js']);
  assert.deepEqual([...graph.get('src/auth/session.js')], []);
  assert.deepEqual([...graph.get('src/utils/logger.js')], []);
});
