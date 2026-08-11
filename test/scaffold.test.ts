import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadGraph } from '../src/load.ts';
import { validateGraph } from '../src/validate.ts';
import { scaffoldSquare, scaffoldChange } from '../src/scaffold.ts';
import { initRepo } from '../src/init.ts';
import { PROTOCOL_MD } from '../src/protocol.ts';
import { makeRepo, rmRepo, messagesOf, squareFile } from './helpers.ts';

test('scaffolded Square is schema-valid and validates with zero errors', () => {
  const root = makeRepo({});
  try {
    const result = scaffoldSquare(root, 'checkout', 'Checkout Flow');
    assert.equal(result.file, 'squares/checkout.square.md');
    const graph = loadGraph(root);
    assert.deepEqual(graph.diagnostics, []);
    assert.equal(graph.squares.get('checkout')!.meta.name, 'Checkout Flow');
    assert.equal(messagesOf(validateGraph(graph), 'error').length, 0);

    assert.throws(() => scaffoldSquare(root, 'checkout'), /already exists/);
    assert.throws(() => scaffoldSquare(root, 'Bad_Id'), /invalid id/);
  } finally {
    rmRepo(root);
  }
});

test('scaffolded Change is schema-valid; its placeholder target fails referential validation', () => {
  const root = makeRepo({});
  try {
    const result = scaffoldChange(root, 'add-thing');
    assert.equal(result.file, path.join('squares', 'changes', 'add-thing.change.md'));
    const graph = loadGraph(root);
    assert.deepEqual(graph.diagnostics, []);
    assert.equal(graph.changes.get('add-thing')!.meta.type, 'evolution');
    // square://todo placeholder must be replaced — validation says so.
    const errors = messagesOf(validateGraph(graph), 'error');
    assert.ok(errors.some((m) => /Square "todo" does not exist/.test(m)));

    const refactor = scaffoldChange(root, 'tidy', undefined, 'refactor');
    assert.ok(fs.readFileSync(path.join(root, refactor.file), 'utf8').includes('semanticDiff: []'));
    assert.throws(() => scaffoldChange(root, 'x', undefined, 'bogus'), /invalid type/);
  } finally {
    rmRepo(root);
  }
});

test('scaffolding refuses to write through a symlinked squares dir escaping the repo', () => {
  // Write-side of the symlink escape: without the realpath guard, scaffoldSquare
  // would fs.writeFileSync into the external target, planting a file outside the
  // repo. The guard in resolveSquaresDir must reject before any write happens.
  const outside = makeRepo({});
  const victim = makeRepo({ '.squaring.json': '{ "dir": "sq" }\n' });
  try {
    fs.symlinkSync(outside, path.join(victim, 'sq'), 'dir');
    assert.throws(() => scaffoldSquare(victim, 'planted'), /outside the repository via a symlink/);
    // Nothing was written into the external directory.
    assert.deepEqual(fs.readdirSync(outside), []);
  } finally {
    rmRepo(victim);
    rmRepo(outside);
  }
});

test('scaffoldChange refuses to write through a symlinked changes/ subdirectory', () => {
  // The reported round-4 critical: squares/ is a real, valid dir (resolveSquaresDir
  // passes), but squares/changes is a symlink to an external directory. Without
  // the changes/ guard, `new change` writes silently outside the repo, exit 0.
  const outside = makeRepo({});
  const victim = makeRepo({ 'squares/ok.square.md': squareFile('ok') });
  try {
    fs.symlinkSync(outside, path.join(victim, 'squares', 'changes'), 'dir');
    assert.throws(() => scaffoldChange(victim, 'newchange'), /is a symlink; refusing to write through it/);
    assert.deepEqual(fs.readdirSync(outside), [], 'nothing written into the external dir');
  } finally {
    rmRepo(victim);
    rmRepo(outside);
  }
});

test('scaffoldChange refuses a pre-placed dangling symlink at the change-file path', () => {
  // squares/ and squares/changes are real, but the leaf is a DANGLING symlink to
  // an external path. fs.existsSync reports false for a dangling link, so the
  // "already exists" check misses it and writeFileSync would create the external
  // target. The leaf guard must reject first.
  const outside = makeRepo({});
  const target = path.join(outside, 'escaped.change.md');
  const victim = makeRepo({ 'squares/ok.square.md': squareFile('ok') });
  try {
    fs.mkdirSync(path.join(victim, 'squares', 'changes'));
    fs.symlinkSync(target, path.join(victim, 'squares', 'changes', 'planted.change.md'), 'file');
    assert.throws(() => scaffoldChange(victim, 'planted'), /is a symlink; refusing to write through it/);
    assert.ok(!fs.existsSync(target), 'nothing written through the dangling symlink');
  } finally {
    rmRepo(victim);
    rmRepo(outside);
  }
});

test('scaffoldSquare refuses a pre-placed dangling symlink at the square-file path', () => {
  const outside = makeRepo({});
  const target = path.join(outside, 'escaped.square.md');
  const victim = makeRepo({ 'squares/ok.square.md': squareFile('ok') });
  try {
    fs.symlinkSync(target, path.join(victim, 'squares', 'planted.square.md'), 'file');
    assert.throws(() => scaffoldSquare(victim, 'planted'), /is a symlink; refusing to write through it/);
    assert.ok(!fs.existsSync(target), 'nothing written through the dangling symlink');
  } finally {
    rmRepo(victim);
    rmRepo(outside);
  }
});

test('initRepo refuses a symlinked changes/ directory', () => {
  const outside = makeRepo({});
  const victim = makeRepo({ 'squares/ok.square.md': squareFile('ok') });
  try {
    fs.symlinkSync(outside, path.join(victim, 'squares', 'changes'), 'dir');
    assert.throws(() => initRepo(victim), /is a symlink; refusing to write through it/);
    assert.deepEqual(fs.readdirSync(outside), [], 'nothing written into the external dir');
  } finally {
    rmRepo(victim);
    rmRepo(outside);
  }
});

test('initRepo creates layout, PROTOCOL.md, and .mcp.json — idempotently', () => {
  const root = makeRepo({});
  try {
    const first = initRepo(root);
    assert.deepEqual(first.created.sort(), ['.mcp.json', 'squares/', 'squares/PROTOCOL.md', 'squares/changes/']);
    assert.equal(fs.readFileSync(path.join(root, 'squares', 'PROTOCOL.md'), 'utf8'), PROTOCOL_MD);
    const mcp = JSON.parse(fs.readFileSync(path.join(root, '.mcp.json'), 'utf8'));
    assert.deepEqual(mcp.mcpServers.squaring, { command: 'squaring', args: ['mcp'] });

    const second = initRepo(root);
    assert.deepEqual(second.created, []);
    assert.deepEqual(second.updated, []);
  } finally {
    rmRepo(root);
  }
});

test('initRepo merges into an existing .mcp.json and refuses to touch broken JSON', () => {
  const merge = makeRepo({ '.mcp.json': '{ "mcpServers": { "other": { "command": "x" } } }\n' });
  try {
    const result = initRepo(merge);
    assert.ok(result.updated.includes('.mcp.json'));
    const mcp = JSON.parse(fs.readFileSync(path.join(merge, '.mcp.json'), 'utf8'));
    assert.deepEqual(mcp.mcpServers.other, { command: 'x' });
    assert.deepEqual(mcp.mcpServers.squaring, { command: 'squaring', args: ['mcp'] });
  } finally {
    rmRepo(merge);
  }

  const broken = makeRepo({ '.mcp.json': '{ not json\n' });
  try {
    const result = initRepo(broken);
    assert.equal(fs.readFileSync(path.join(broken, '.mcp.json'), 'utf8'), '{ not json\n');
    assert.ok(result.notes.some((n) => n.includes('not valid JSON')));
  } finally {
    rmRepo(broken);
  }
});

test('initRepo leaves a valid-JSON .mcp.json of the wrong shape untouched, with a note', () => {
  // Valid JSON, wrong shapes: a non-object mcpServers, and a top-level array.
  // Both previously threw a TypeError mid-init; now init completes and notes.
  for (const content of ['{ "mcpServers": "nope" }\n', '[1, 2, 3]\n']) {
    const root = makeRepo({ '.mcp.json': content });
    try {
      const result = initRepo(root);
      assert.equal(fs.readFileSync(path.join(root, '.mcp.json'), 'utf8'), content);
      assert.ok(result.notes.some((n) => n.includes('does not have the expected')));
      assert.ok(!result.updated.includes('.mcp.json'));
    } finally {
      rmRepo(root);
    }
  }
});

test('a hostile display name cannot inject YAML through the scaffold templates', () => {
  const root = makeRepo({});
  const evil = 'Evil" name\narchetype: policy\nx: "y';
  try {
    scaffoldSquare(root, 'victim', evil);
    scaffoldChange(root, 'victim-change', evil);
    const graph = loadGraph(root);
    // Both files parse cleanly and the name round-trips as ONE string —
    // the newline stayed inside the quoted scalar instead of becoming keys.
    assert.deepEqual(graph.diagnostics, []);
    assert.equal(graph.squares.get('victim')!.meta.name, evil);
    assert.equal(graph.squares.get('victim')!.meta.archetype, undefined);
    assert.equal(graph.changes.get('victim-change')!.meta.name, evil);
  } finally {
    rmRepo(root);
  }
});
