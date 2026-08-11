import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGraph } from '../src/load.ts';
import { compileSquarePack, compileChangePack, compileContext } from '../src/context.ts';
import { DEMO, makeRepo, rmRepo, squareFile } from './helpers.ts';

test('square pack renders the ten sections in order with edges first', () => {
  const graph = loadGraph(DEMO);
  const pack = compileSquarePack(graph, 'orders');

  assert.ok(pack.startsWith('# Context Pack — Orders (square://orders)'));
  const headers = [
    '## 1. Identity',
    '## 2. Non-goals & boundaries',
    '## 3. Commitments',
    '## 4. Contracts',
    '## 5. Ownership & authority',
    '## 6. Decisions',
    '## 7. Unresolved questions',
    '## 8. Active Changes',
    '## 9. Source bindings',
    '## 10. Notes (Square body, verbatim)'
  ];
  let previous = -1;
  for (const header of headers) {
    const at = pack.indexOf(header);
    assert.ok(at > previous, `${header} missing or out of order`);
    previous = at;
  }
});

test('square pack injects applicable policies, suspensions, and counterparties', () => {
  const graph = loadGraph(DEMO);
  const orders = compileSquarePack(graph, 'orders');

  // Wildcard policy from the security square lands in section 2.
  assert.ok(orders.includes('_(from square://security#commitment/no-secrets-in-logs)_'));
  // Targeted policy applies to payments only — not injected into orders.
  assert.ok(!orders.includes('pci-scope'));
  const payments = compileSquarePack(graph, 'payments');
  assert.ok(payments.includes('_(from square://security#commitment/pci-scope)_'));

  // The active Change's suspension flags the commitment inline.
  assert.ok(orders.includes('⚠ SUSPENDED by change://add-refunds'));
  // Boundary commitment sorts into section 2, invariant into section 3.
  assert.ok(orders.indexOf('no-direct-card-data') < orders.indexOf('## 3. Commitments'));

  // Contract counterparties both ways.
  assert.ok(orders.includes('**Consumes charge** from square://payments'));
  assert.ok(payments.includes('consumed by square://orders'));
  assert.ok(orders.includes('**Counterparty square://payments**'));

  // Active change appears; done change does not.
  assert.ok(orders.includes('change://add-refunds'));
  assert.ok(!orders.includes('tidy-loader'));

  // Bindings resolve against the repo.
  assert.ok(orders.includes('src/orders.ts'));

  // Unresolved carries the A3 reminder.
  assert.ok(orders.includes('Rule A3'));
  assert.ok(orders.includes('partial-refunds'));
});

test('should-not commitments sort into section 2, and abandoned Changes are excluded from section 8', () => {
  const root = makeRepo({
    'squares/a.square.md': `---
apiVersion: squaring/v0
kind: Square
id: a
name: Square a
purpose: Test square a.
nonGoals:
  - nothing in particular
commitments:
  - id: soft-edge
    kind: constraint
    strength: should-not
    statement: avoid coupling to the renderer
authority:
  owns: [invariants]
---
`,
    'squares/changes/dead.change.md': `---
apiVersion: squaring/v0
kind: Change
id: dead
name: Dead
type: evolution
intent: abandoned experiment
targets:
  - square://a
semanticDiff:
  - tried a thing
phase: abandoned
---
`
  });
  try {
    const graph = loadGraph(root);
    assert.deepEqual(graph.diagnostics, []);
    const pack = compileSquarePack(graph, 'a');
    // should-not is boundary-like → section 2, ahead of section 3.
    assert.ok(pack.indexOf('soft-edge') < pack.indexOf('## 3. Commitments'));
    // An abandoned Change is neither "active" nor listed; section 8 is empty.
    assert.ok(!pack.includes('change://dead'));
    assert.match(pack.slice(pack.indexOf('## 8. Active Changes')), /## 8\. Active Changes\n- \(none\)/);
  } finally {
    rmRepo(root);
  }
});

test('change pack embeds abbreviated packs for each target', () => {
  const graph = loadGraph(DEMO);
  const pack = compileChangePack(graph, 'add-refunds');

  assert.ok(pack.startsWith('# Context Pack — Change: Add Refunds (change://add-refunds)'));
  assert.ok(pack.includes('## The Change'));
  assert.ok(pack.includes('orders: refund becomes a first-class order state'));
  assert.ok(pack.includes('**Proposed decision (refund-window):**'));
  assert.ok(pack.includes('## Targeted Squares (2)'));
  assert.ok(pack.includes('## Target: Orders (square://orders)'));
  assert.ok(pack.includes('## Target: Payments (square://payments)'));
  // Abbreviated packs use ### section headers and stop at section 7.
  assert.ok(pack.includes('### 1. Identity'));
  assert.ok(!pack.includes('### 8.'));
});

test('compilation is deterministic (byte-identical on repeat)', () => {
  const graph1 = loadGraph(DEMO);
  const graph2 = loadGraph(DEMO);
  assert.equal(compileSquarePack(graph1, 'orders'), compileSquarePack(graph2, 'orders'));
  assert.equal(compileChangePack(graph1, 'add-refunds'), compileChangePack(graph2, 'add-refunds'));
});

test('compileContext dispatches bare ids and URIs, and rejects ambiguity', () => {
  const graph = loadGraph(DEMO);
  assert.equal(compileContext(graph, 'orders'), compileSquarePack(graph, 'orders'));
  assert.equal(compileContext(graph, 'square://orders'), compileSquarePack(graph, 'orders'));
  assert.equal(compileContext(graph, 'change://add-refunds'), compileChangePack(graph, 'add-refunds'));
  assert.throws(() => compileContext(graph, 'ghost'), /no Square or Change named "ghost"/);

  const root = makeRepo({
    'squares/dup.square.md': squareFile('dup'),
    'squares/changes/dup.change.md': `---
apiVersion: squaring/v0
kind: Change
id: dup
name: Dup
type: repair
intent: i
targets:
  - square://dup
semanticDiff: []
phase: active
---
`
  });
  try {
    const ambiguous = loadGraph(root);
    assert.throws(() => compileContext(ambiguous, 'dup'), /names both a Square and a Change/);
    assert.ok(compileContext(ambiguous, 'square://dup').includes('# Context Pack — Square dup'));
    assert.ok(compileContext(ambiguous, 'change://dup').includes('# Context Pack — Change: Dup'));
  } finally {
    rmRepo(root);
  }
});
