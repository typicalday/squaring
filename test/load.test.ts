import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGraph } from '../src/load.ts';
import { DEMO, makeRepo, rmRepo, squareFile } from './helpers.ts';

test('loads the demo fixture graph cleanly', () => {
  const graph = loadGraph(DEMO);
  assert.deepEqual(graph.diagnostics, []);
  assert.deepEqual([...graph.squares.keys()].sort(), ['orders', 'payments', 'security']);
  assert.deepEqual([...graph.changes.keys()].sort(), ['add-refunds', 'tidy-loader']);
  const orders = graph.squares.get('orders')!;
  assert.equal(orders.file, 'squares/orders.square.md');
  assert.ok(orders.body.includes('[[payments]]'));
  assert.equal(orders.meta.decisions?.[0]?.date, '2026-01-15');
});

test('missing squares directory is a load error', () => {
  const root = makeRepo({});
  try {
    const graph = loadGraph(root);
    assert.equal(graph.diagnostics.length, 1);
    assert.match(graph.diagnostics[0]!.message, /squares directory not found/);
  } finally {
    rmRepo(root);
  }
});

test('missing frontmatter is a load error', () => {
  const root = makeRepo({ 'squares/a.square.md': 'no frontmatter here\n' });
  try {
    const graph = loadGraph(root);
    assert.match(graph.diagnostics[0]!.message, /missing YAML frontmatter/);
    assert.equal(graph.squares.size, 0);
  } finally {
    rmRepo(root);
  }
});

test('invalid YAML is a load error naming the file', () => {
  const root = makeRepo({ 'squares/a.square.md': '---\n{ broken: [\n---\n' });
  try {
    const graph = loadGraph(root);
    assert.equal(graph.squares.size, 0);
    assert.equal(graph.diagnostics[0]!.file, 'squares/a.square.md');
    assert.match(graph.diagnostics[0]!.message, /invalid YAML/);
  } finally {
    rmRepo(root);
  }
});

test('unknown top-level fields are schema errors (strictness rule)', () => {
  const root = makeRepo({ 'squares/a.square.md': squareFile('a', 'bogusField: 1\n') });
  try {
    const graph = loadGraph(root);
    assert.equal(graph.squares.size, 0);
    assert.match(graph.diagnostics[0]!.message, /bogusField/);
  } finally {
    rmRepo(root);
  }
});

test('namespaced extensions are accepted; bare extension keys are rejected', () => {
  const good = makeRepo({
    'squares/a.square.md': squareFile('a', 'extensions:\n  com.example.security: { reviewed: true }\n')
  });
  try {
    assert.deepEqual(loadGraph(good).diagnostics, []);
  } finally {
    rmRepo(good);
  }
  const bad = makeRepo({ 'squares/a.square.md': squareFile('a', 'extensions:\n  security: { reviewed: true }\n') });
  try {
    // zod v4 reports record-key failures with its own message; the path names the offending key.
    assert.match(loadGraph(bad).diagnostics[0]!.message, /extensions\.security: Invalid key/);
  } finally {
    rmRepo(bad);
  }
});

test('id must match the filename stem', () => {
  const root = makeRepo({ 'squares/b.square.md': squareFile('a') });
  try {
    const graph = loadGraph(root);
    assert.equal(graph.squares.size, 0);
    assert.match(graph.diagnostics[0]!.message, /does not match filename stem/);
  } finally {
    rmRepo(root);
  }
});

test('.squaring.json {dir} relocates the squares directory', () => {
  const root = makeRepo({
    '.squaring.json': '{ "dir": "meta" }\n',
    'meta/a.square.md': squareFile('a')
  });
  try {
    const graph = loadGraph(root);
    assert.deepEqual(graph.diagnostics, []);
    assert.equal(graph.squaresDir, 'meta');
    assert.equal(graph.squares.get('a')!.file, 'meta/a.square.md');
  } finally {
    rmRepo(root);
  }
});
