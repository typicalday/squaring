import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ID_RE,
  squareUri,
  changeUri,
  claimUri,
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
