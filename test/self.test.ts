// Dogfood check: this repository's own Square Graph must stay valid.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadGraph } from '../src/load.ts';
import { validateGraph } from '../src/validate.ts';
import { messagesOf } from './helpers.ts';

const REPO_ROOT = path.join(import.meta.dirname, '..');

test("this repository's own Square Graph validates with zero errors", () => {
  const graph = loadGraph(REPO_ROOT);
  assert.ok(graph.squares.size > 0, 'the squaring repo should carry its own Squares');
  const diagnostics = validateGraph(graph);
  assert.deepEqual(messagesOf(diagnostics, 'error'), []);
  assert.deepEqual(messagesOf(diagnostics, 'warning'), []);
});
