import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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

test('malformed .squaring.json is a clean error, not a stack trace', () => {
  const root = makeRepo({ '.squaring.json': '{ bad' });
  try {
    assert.throws(() => loadGraph(root), /\.squaring\.json: invalid JSON/);
  } finally {
    rmRepo(root);
  }
});

test('.squaring.json {dir} escaping the repository is rejected', () => {
  const relative = makeRepo({ '.squaring.json': '{ "dir": "../../outside" }\n' });
  try {
    assert.throws(() => loadGraph(relative), /must resolve inside the repository/);
  } finally {
    rmRepo(relative);
  }
  const absolute = makeRepo({ '.squaring.json': '{ "dir": "/etc" }\n' });
  try {
    assert.throws(() => loadGraph(absolute), /must resolve inside the repository/);
  } finally {
    rmRepo(absolute);
  }
});

test('.squaring.json {dir} that is a symlink escaping the repository is rejected', () => {
  // A hostile clone can ship both .squaring.json and an in-repo symlink that
  // points outside — lexically inside, physically outside. The realpath check
  // must catch it (reading foreign files) rather than following the link.
  const outside = makeRepo({ 'topsecret.square.md': squareFile('topsecret') });
  const victim = makeRepo({ '.squaring.json': '{ "dir": "sq" }\n' });
  try {
    fs.symlinkSync(outside, path.join(victim, 'sq'), 'dir');
    assert.throws(() => loadGraph(victim), /outside the repository via a symlink/);
  } finally {
    rmRepo(victim);
    rmRepo(outside);
  }
});

test('a symlinked default squares/ pointing outside the repository is rejected', () => {
  // No .squaring.json needed: symlinking squares/ itself is the same escape.
  const outside = makeRepo({ 'topsecret.square.md': squareFile('topsecret') });
  const victim = makeRepo({});
  try {
    fs.symlinkSync(outside, path.join(victim, 'squares'), 'dir');
    assert.throws(() => loadGraph(victim), /outside the repository via a symlink/);
  } finally {
    rmRepo(victim);
    rmRepo(outside);
  }
});

test('a Square file that is itself a symlink to an external doc is rejected, not followed', () => {
  // Directory-level containment passes (squares/ is a real in-repo dir), but a
  // single entry symlinks to an external, fully schema-valid Square document.
  // Following it discloses cross-repo content; the per-file guard must reject.
  const outside = makeRepo({ 'leak.square.md': squareFile('leak') });
  const victim = makeRepo({ 'squares/ok.square.md': squareFile('ok') });
  try {
    fs.symlinkSync(
      path.join(outside, 'leak.square.md'),
      path.join(victim, 'squares', 'leak.square.md'),
      'file'
    );
    const graph = loadGraph(victim);
    assert.ok(graph.squares.has('ok'), 'the real square still loads');
    assert.ok(!graph.squares.has('leak'), 'the symlinked external square must not load');
    assert.ok(graph.diagnostics.some((d) => /is a symlink/.test(d.message)));
  } finally {
    rmRepo(victim);
    rmRepo(outside);
  }
});

test('a changes/ subdirectory that is a symlink escaping the repo is rejected', () => {
  // The per-file guard cannot catch this: lstat follows the intermediate
  // `changes` component, so the escape must be rejected at the directory level.
  const outside = makeRepo({
    'x.change.md': `---
apiVersion: squaring/v0
kind: Change
id: x
name: X
type: repair
intent: i
targets:
  - square://ok
semanticDiff: []
phase: active
---
`
  });
  const victim = makeRepo({ 'squares/ok.square.md': squareFile('ok') });
  try {
    fs.symlinkSync(outside, path.join(victim, 'squares', 'changes'), 'dir');
    const graph = loadGraph(victim);
    assert.ok(!graph.changes.has('x'), 'changes behind a symlinked dir must not load');
    assert.ok(graph.diagnostics.some((d) => /changes\/ is a symlink/.test(d.message)));
  } finally {
    rmRepo(victim);
    rmRepo(outside);
  }
});

test('a squares dir that is a circular symlink is rejected, not silently accepted', () => {
  // sq -> sq2 -> sq. fs.existsSync reports false for the ELOOP, so the old walk
  // stepped past sq and validated the repo root; the resolver must still reject.
  const victim = makeRepo({ '.squaring.json': '{ "dir": "sq" }\n' });
  try {
    fs.symlinkSync(path.join(victim, 'sq2'), path.join(victim, 'sq'), 'dir');
    fs.symlinkSync(path.join(victim, 'sq'), path.join(victim, 'sq2'), 'dir');
    assert.throws(() => loadGraph(victim), /broken or circular symlink/);
  } finally {
    rmRepo(victim);
  }
});

test('a UTF-8 BOM before the frontmatter is tolerated', () => {
  const root = makeRepo({ 'squares/a.square.md': '\uFEFF' + squareFile('a') });
  try {
    const graph = loadGraph(root);
    assert.deepEqual(graph.diagnostics, []);
    assert.ok(graph.squares.has('a'));
  } finally {
    rmRepo(root);
  }
});
