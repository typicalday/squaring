import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadGraph } from '../src/load.ts';
import { validateGraph } from '../src/validate.ts';
import { scaffoldSquare, scaffoldChange } from '../src/scaffold.ts';
import { initRepo } from '../src/init.ts';
import { PROTOCOL_MD } from '../src/protocol.ts';
import { makeRepo, rmRepo, messagesOf } from './helpers.ts';

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
