import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ID_RE,
  CLAIM_FACETS,
  squareUri,
  changeUri,
  claimUri,
  conceptUri,
  parseSquareUri,
  parseChangeUri,
  parseExternalUri,
  extractBodyRefs
} from '../src/ids.ts';

test('ID_RE accepts kebab ids and rejects everything else', () => {
  for (const good of ['a', 'orders', 'core-v0', 'a1-b2', '0x']) {
    assert.ok(ID_RE.test(good), `expected valid: ${good}`);
  }
  for (const bad of ['', '-a', 'A', 'a_b', 'a b', 'a.b', 'café']) {
    assert.ok(!ID_RE.test(bad), `expected invalid: ${bad}`);
  }
});

test('URI builders and parsers round-trip', () => {
  assert.equal(squareUri('orders'), 'square://orders');
  assert.equal(changeUri('add-refunds'), 'change://add-refunds');
  assert.equal(claimUri('orders', 'commitment', 'no-x'), 'square://orders#commitment/no-x');

  assert.deepEqual(parseSquareUri('square://orders'), { squareId: 'orders' });
  assert.deepEqual(parseSquareUri('square://orders#commitment/no-x'), {
    squareId: 'orders',
    facet: 'commitment',
    claimId: 'no-x'
  });
  assert.equal(parseChangeUri('change://add-refunds'), 'add-refunds');
  assert.equal(parseExternalUri('external://stripe'), 'stripe');
});

test('concept URIs build and parse, and never look like claims', () => {
  assert.equal(conceptUri('orders', 'line-item'), 'square://orders#concept/line-item');
  assert.deepEqual(parseSquareUri('square://orders#concept/line-item'), {
    squareId: 'orders',
    conceptId: 'line-item'
  });

  // A concept URI carries conceptId and never facet/claimId — the two shapes
  // are disjoint, which is what keeps suspensions (commitments only, §9) from
  // ever reaching a concept.
  const concept = parseSquareUri('square://orders#concept/order');
  assert.equal(concept?.facet, undefined);
  assert.equal(concept?.claimId, undefined);
  assert.ok(!CLAIM_FACETS.includes('concept' as never), 'concept must not be a claim facet');

  // Every claim facet still parses into facet/claimId, not conceptId.
  for (const facet of CLAIM_FACETS) {
    const ref = parseSquareUri(`square://orders#${facet}/x`);
    assert.deepEqual(ref, { squareId: 'orders', facet, claimId: 'x' });
  }
});

test('malformed concept URIs are rejected', () => {
  assert.equal(parseSquareUri('square://orders#concept/'), null);
  assert.equal(parseSquareUri('square://orders#concept/Order'), null);
  assert.equal(parseSquareUri('square://orders#concepts/order'), null);
  assert.equal(parseSquareUri('square://orders#concept/-order'), null);
});

test('a concept URI written in prose is extracted like any other reference', () => {
  const body = 'The [[orders]] square owns square://orders#concept/line-item, unlike square://orders#concept/ghost.';
  const refs = extractBodyRefs(body);
  assert.deepEqual(refs.wiki, ['orders']);
  assert.deepEqual(refs.uris, ['square://orders#concept/line-item', 'square://orders#concept/ghost']);
});

test('parsers reject malformed URIs', () => {
  assert.equal(parseSquareUri('square://Orders'), null);
  assert.equal(parseSquareUri('square://orders#bogus/x'), null);
  assert.equal(parseSquareUri('square://orders#commitment/'), null);
  assert.equal(parseSquareUri('orders'), null);
  assert.equal(parseSquareUri('change://orders'), null);
  assert.equal(parseChangeUri('square://orders'), null);
  assert.equal(parseExternalUri('external://Has Space'), null);
});

test('extractBodyRefs finds wiki links and square URIs in prose', () => {
  const body = 'See [[payments]] and square://orders#commitment/no-unpaid-fulfillment, also square://payments.';
  const refs = extractBodyRefs(body);
  assert.deepEqual(refs.wiki, ['payments']);
  assert.deepEqual(refs.uris, ['square://orders#commitment/no-unpaid-fulfillment', 'square://payments']);
});
