import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGraph } from '../src/load.ts';
import { compileSquarePack, compileChangePack, compileContext } from '../src/context.ts';
import { DEMO, makeRepo, rmRepo, squareFile } from './helpers.ts';

/** The §12 section order, headings verbatim. */
const SECTIONS = [
  '## 1. Target identity',
  '## 2. Concept map',
  '## 3. Non-goals and boundaries',
  '## 4. Commitments',
  '## 5. Scenarios',
  '## 6. Contracts',
  '## 7. Ownership and dependency directions',
  '## 8. Decisions',
  '## 9. Unresolved questions',
  '## 10. Active Changes',
  '## 11. Sources',
  '## 12. Body'
];

test('square pack renders the twelve sections in order with edges first', () => {
  const graph = loadGraph(DEMO);
  const pack = compileSquarePack(graph, 'orders');

  assert.ok(pack.startsWith('# Context Pack — Orders (square://orders)'));
  let previous = -1;
  for (const header of SECTIONS) {
    const at = pack.indexOf(header);
    assert.ok(at > previous, `${header} missing or out of order`);
    previous = at;
  }
});

test('the concept map lists each concept with its tagged claims grouped by facet', () => {
  const graph = loadGraph(DEMO);
  const pack = compileSquarePack(graph, 'orders');
  const map = pack.slice(pack.indexOf('## 2. Concept map'), pack.indexOf('## 3. Non-goals'));

  assert.equal(
    map.trim(),
    [
      '## 2. Concept map',
      "- **order** (Order) — A customer's purchase request, from placement through fulfillment.",
      '  - commitment: no-unpaid-fulfillment',
      '  - contract: order-status, charge',
      '  - decision: single-currency',
      '  - scenario: happy-path',
      '- **line-item** (Line item) — One product and quantity inside an order — the unit a partial refund would have to target.',
      '  - scenario: happy-path',
      '  - unresolved: partial-refunds'
    ].join('\n')
  );
  // happy-path carries both tags, so it is listed under both concepts (§12).
  assert.equal(map.match(/scenario: happy-path/g)?.length, 2);
});

test('a tagged claim line ends with its tags in sections 3–9', () => {
  const graph = loadGraph(DEMO);
  const pack = compileSquarePack(graph, 'orders');

  assert.ok(pack.includes('_(no-unpaid-fulfillment, evidence: test)_ _(concepts: order)_'));
  assert.ok(pack.includes('when: the customer places the order _(concepts: order, line-item)_'));
  assert.ok(pack.includes('**Provides order-status:** Report the current status of an order by id. _(concepts: order)_'));
  assert.ok(pack.includes('Charge the customer for an order total. _(concepts: order)_'));
  assert.ok(pack.includes('Only market served at launch. _(concepts: order)_'));
  assert.ok(pack.includes('(affects: square://payments) _(concepts: line-item)_'));
  // An untagged claim gets no suffix.
  assert.ok(pack.includes('Orders never stores or logs raw card data. _(no-direct-card-data)_\n'));
});

test('section 11 lists selectors with their files, then anchor sites at path:line', () => {
  const graph = loadGraph(DEMO);
  const pack = compileSquarePack(graph, 'orders');
  const sources = pack.slice(pack.indexOf('## 11. Sources'), pack.indexOf('## 12. Body'));

  assert.equal(
    sources.trim(),
    [
      '## 11. Sources',
      '- `src/orders*` on square://orders#concept/order — 1 file(s) · expect: annotated',
      '  - src/orders.ts',
      '- src/orders.ts:3 → square://orders#concept/order — placement through fulfillment lives here'
    ].join('\n')
  );
});

test('square pack injects applicable policies, suspensions, and counterparties', () => {
  const graph = loadGraph(DEMO);
  const orders = compileSquarePack(graph, 'orders');

  // Wildcard policy from the security square lands in section 3.
  assert.ok(orders.includes('_(from square://security#commitment/no-secrets-in-logs)_'));
  // Targeted policy applies to payments only — not injected into orders.
  assert.ok(!orders.includes('pci-scope'));
  const payments = compileSquarePack(graph, 'payments');
  assert.ok(payments.includes('_(from square://security#commitment/pci-scope)_'));

  // The active Change's suspension flags the commitment inline.
  assert.ok(orders.includes('⚠ SUSPENDED by change://add-refunds'));
  // Boundary commitment sorts into section 3, invariant into section 4.
  assert.ok(orders.indexOf('no-direct-card-data') < orders.indexOf('## 4. Commitments'));

  // Contract counterparties both ways.
  assert.ok(orders.includes('**Consumes charge** from square://payments'));
  assert.ok(payments.includes('consumed by square://orders'));
  assert.ok(orders.includes('**Counterparty square://payments**'));

  // Active change appears; done change does not.
  assert.ok(orders.includes('change://add-refunds'));
  assert.ok(!orders.includes('tidy-loader'));

  // Selectors resolve against the repo.
  assert.ok(orders.includes('src/orders.ts'));

  // Unresolved carries the A3 reminder.
  assert.ok(orders.includes('Rule A3'));
  assert.ok(orders.includes('partial-refunds'));

  // Scenarios render given/when on one line and each then as a sub-item.
  assert.ok(orders.includes('- **happy-path** — given: a cart with one item · when: the customer places the order'));
  assert.ok(orders.includes('  - then: the order is created in state pending'));

  // The body's [[payments]] wiki link is resolved to the canonical URI.
  assert.ok(orders.includes('coordinates with square://payments for money movement'));
  assert.ok(!orders.includes('[[payments]]'));
});

test('should-not commitments sort into section 3, and abandoned Changes are excluded from section 10', () => {
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
    // should-not is boundary-like → section 3, ahead of section 4.
    assert.ok(pack.indexOf('soft-edge') < pack.indexOf('## 4. Commitments'));
    // An abandoned Change is neither "active" nor listed; section 10 is empty.
    assert.ok(!pack.includes('change://dead'));
    assert.match(pack.slice(pack.indexOf('## 10. Active Changes')), /## 10\. Active Changes\n\(none declared\)/);
  } finally {
    rmRepo(root);
  }
});

test('an empty section keeps its number and renders one placeholder; an empty body drops its heading', () => {
  const root = makeRepo({ 'squares/bare.square.md': squareFile('bare') });
  try {
    const pack = compileSquarePack(loadGraph(root), 'bare');
    // Every section but 12 is present, in order, even with nothing to say.
    let previous = -1;
    for (const header of SECTIONS.slice(0, 11)) {
      const at = pack.indexOf(header);
      assert.ok(at > previous, `${header} missing or out of order`);
      previous = at;
    }
    // Section 12 is the one omitted outright — heading included.
    assert.ok(!pack.includes('## 12. Body'));

    // A section with no content renders exactly one placeholder line.
    for (const header of ['## 2. Concept map', '## 5. Scenarios', '## 8. Decisions', '## 11. Sources']) {
      const rest = pack.slice(pack.indexOf(header) + header.length);
      assert.equal(rest.split('\n')[1], '(none declared)', `${header} placeholder`);
      assert.equal(rest.split('\n')[2], '', `${header} renders one placeholder only`);
    }
  } finally {
    rmRepo(root);
  }
});

test('a concept-scoped pack keeps section numbers, drops 2 and 12, and filters claims by tag', () => {
  const graph = loadGraph(DEMO);
  const pack = compileContext(graph, 'orders#concept/line-item');

  assert.ok(pack.startsWith('# Context Pack — Orders › Line item (square://orders#concept/line-item)'));
  // Section 1 carries the Square's identity plus the concept's statement.
  assert.ok(pack.includes('- **Purpose:** Accept and track customer orders'));
  assert.ok(pack.includes('- **Concept line-item:** One product and quantity inside an order'));

  // Sections 2 and 12 are omitted; every other number stays put.
  assert.ok(!pack.includes('## 2. Concept map'));
  assert.ok(!pack.includes('## 12. Body'));
  let previous = -1;
  for (const header of SECTIONS.filter((h) => !h.startsWith('## 2.') && !h.startsWith('## 12.'))) {
    const at = pack.indexOf(header);
    assert.ok(at > previous, `${header} missing or out of order`);
    previous = at;
  }

  // Claims tagged with line-item stay; claims tagged only with order go.
  assert.ok(pack.includes('partial-refunds'));
  assert.ok(pack.includes('happy-path'));
  // no-unpaid-fulfillment is tagged `order` only, so section 4 is empty. (The
  // id still appears further down, inside the Change's suspension in §10.)
  assert.match(pack.slice(pack.indexOf('## 4. Commitments')), /## 4\. Commitments\n\(none declared\)/);
  assert.ok(!pack.includes('An order is fulfilled only after its charge succeeds'));
  assert.match(pack.slice(pack.indexOf('## 8. Decisions')), /## 8\. Decisions\n\(none declared\)/);
  assert.match(pack.slice(pack.indexOf('## 6. Contracts')), /## 6\. Contracts\n\(none declared\)/);

  // Non-claim content is unfiltered: nonGoals, policy injections, all of §7.
  assert.ok(pack.includes('- **Non-goal:** Payment processing (delegated to payments)'));
  assert.ok(pack.includes('_(from square://security#commitment/no-secrets-in-logs)_'));
  assert.ok(pack.includes('- **Owns concepts:** order, line-item'));
  assert.ok(pack.includes('- **dependsOn** square://payments (through contract charge)'));

  // Section 10 is unchanged — Changes target Squares, not concepts.
  assert.ok(pack.includes('### change://add-refunds — Add Refunds'));

  // Section 11 shows only this concept's selectors and anchors; line-item has
  // neither, and the order concept's `src/orders*` selector is out of scope.
  assert.match(pack.slice(pack.indexOf('## 11. Sources')), /## 11\. Sources\n\(none declared\)/);

  // The scoped pack for `order` picks up that concept's selector and anchor.
  const scopedOrder = compileContext(graph, 'square://orders#concept/order');
  assert.ok(scopedOrder.includes('- `src/orders*` on square://orders#concept/order — 1 file(s) · expect: annotated'));
  assert.ok(scopedOrder.includes('- src/orders.ts:3 → square://orders#concept/order'));
  assert.ok(!scopedOrder.includes('partial-refunds'));
});

test('the short and full concept forms compile the same pack, and a claim URI is refused', () => {
  const graph = loadGraph(DEMO);
  assert.equal(
    compileContext(graph, 'orders#concept/order'),
    compileContext(graph, 'square://orders#concept/order')
  );
  assert.equal(compileContext(graph, 'orders#concept/order'), compileSquarePack(graph, 'orders', { conceptId: 'order' }));
  assert.throws(
    () => compileContext(graph, 'square://orders#commitment/no-unpaid-fulfillment'),
    /names a claim — packs compile for a Square, a Change, or a concept URI/
  );
  assert.throws(() => compileContext(graph, 'orders#concept/ghost'), /declares no concept "ghost"/);
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
  // Abbreviated packs use ### section headers and stop at section 9.
  assert.ok(pack.includes('### 1. Target identity'));
  assert.ok(pack.includes('### 2. Concept map'));
  assert.ok(pack.includes('### 9. Unresolved questions'));
  assert.ok(!pack.includes('### 10.'));
  assert.ok(!pack.includes('### 11. Sources'));
});

test('change pack lists a duplicated target once', () => {
  const root = makeRepo({
    'squares/a.square.md': squareFile('a'),
    'squares/changes/c.change.md': `---
apiVersion: squaring/v0
kind: Change
id: c
name: C
type: repair
intent: i
targets:
  - square://a
  - square://a
semanticDiff: []
phase: active
---
`
  });
  try {
    const pack = compileChangePack(loadGraph(root), 'c');
    assert.ok(pack.includes('## Targeted Squares (1)'));
    assert.equal(pack.match(/## Target: Square a/g)?.length, 1);
  } finally {
    rmRepo(root);
  }
});

test('compilation is deterministic (byte-identical on repeat)', () => {
  const graph1 = loadGraph(DEMO);
  const graph2 = loadGraph(DEMO);
  assert.equal(compileSquarePack(graph1, 'orders'), compileSquarePack(graph2, 'orders'));
  assert.equal(compileChangePack(graph1, 'add-refunds'), compileChangePack(graph2, 'add-refunds'));
  assert.equal(
    compileContext(graph1, 'orders#concept/order'),
    compileContext(graph2, 'orders#concept/order')
  );
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

test('section 11 lists every matched file, with no truncation', () => {
  // §12 gives section 11 no cap: a silently shortened list reads as the whole
  // realization, which is the one thing a Sources section must not misreport.
  const files: Record<string, string> = {
    'squares/wide.square.md': squareFile('wide', 'sources:\n  - glob: src/**\n')
  };
  const paths: string[] = [];
  for (let i = 0; i < 60; i++) {
    const rel = `src/f${String(i).padStart(3, '0')}.ts`;
    files[rel] = 'export const a = 1;\n';
    paths.push(rel);
  }
  const root = makeRepo(files);
  try {
    const pack = compileSquarePack(loadGraph(root), 'wide');
    assert.ok(pack.includes('- `src/**` — 60 file(s)'));
    for (const rel of paths) assert.ok(pack.includes(`  - ${rel}`), `section 11 must list ${rel}`);
    assert.ok(!pack.includes(' more'), 'no "… N more" summary line');
  } finally {
    rmRepo(root);
  }
});
