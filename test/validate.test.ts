import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadGraph } from '../src/load.ts';
import { validateGraph, hasErrors, formatDiagnostics } from '../src/validate.ts';
import { DEMO, diagnose, squareFile, assertHas, messagesOf, makeRepo, rmRepo } from './helpers.ts';

test('the demo fixture validates with zero errors and zero warnings', () => {
  const diagnostics = validateGraph(loadGraph(DEMO));
  assert.deepEqual(diagnostics, []);
  assert.equal(hasErrors(diagnostics), false);
  assert.equal(formatDiagnostics(diagnostics), 'OK — no errors, no warnings.');
});

test('relationship targets must exist and route through provided contracts', () => {
  const missing = diagnose({
    'squares/a.square.md': squareFile('a', 'relationships:\n  - type: dependsOn\n    target: square://ghost\n')
  });
  assertHas(missing, 'error', /relationship target square:\/\/ghost does not exist/);

  const badThrough = diagnose({
    'squares/a.square.md': squareFile(
      'a',
      'relationships:\n  - type: dependsOn\n    target: square://b\n    through: nope\n'
    ),
    'squares/b.square.md': squareFile('b')
  });
  assertHas(badThrough, 'error', /through "nope" is not provided by square:\/\/b/);
});

test('consumed contracts: nonexistent provider is an error, undeclared contract a warning', () => {
  const noProvider = diagnose({
    'squares/a.square.md': squareFile(
      'a',
      'contracts:\n  consumes:\n    - id: x\n      from: square://ghost\n      statement: s\n'
    )
  });
  assertHas(noProvider, 'error', /nonexistent provider square:\/\/ghost/);

  const undeclared = diagnose({
    'squares/a.square.md': squareFile(
      'a',
      'contracts:\n  consumes:\n    - id: x\n      from: square://b\n      statement: s\n'
    ),
    'squares/b.square.md': squareFile('b')
  });
  assertHas(undeclared, 'warning', /not declared under square:\/\/b contracts\.provides/);
});

test('appliesTo is restricted to policy squares and must resolve', () => {
  const policySquare = (archetype: string, appliesTo: string) => `---
apiVersion: squaring/v0
kind: Square
id: a
name: A
${archetype}purpose: p
commitments:
  - id: p
    kind: constraint
    strength: must
    statement: s
    appliesTo: ${appliesTo}
authority:
  owns: [policy]
---
`;
  const notPolicy = diagnose({ 'squares/a.square.md': policySquare('', '"*"') });
  assertHas(notPolicy, 'error', /appliesTo but archetype is not "policy"/);

  const badTarget = diagnose({
    'squares/a.square.md': policySquare('archetype: policy\n', '[square://ghost]')
  });
  assertHas(badTarget, 'error', /appliesTo square:\/\/ghost: Square "ghost" does not exist/);
});

test('partOf must exist and cycles are reported', () => {
  const missing = diagnose({ 'squares/a.square.md': squareFile('a', 'partOf: ghost\n') });
  assertHas(missing, 'error', /partOf references nonexistent Square "ghost"/);

  const cycle = diagnose({
    'squares/a.square.md': squareFile('a', 'partOf: b\n'),
    'squares/b.square.md': squareFile('b', 'partOf: a\n')
  });
  assertHas(cycle, 'error', /partOf cycle/);
});

test('duplicate claim ids within a facet are errors', () => {
  const dup = diagnose({
    'squares/a.square.md': squareFile(
      'a',
      `decisions:
  - id: d1
    choice: one
  - id: d1
    choice: two
`
    )
  });
  assertHas(dup, 'error', /duplicate decision id "d1"/);
});

test('decision supersededBy must name an existing decision', () => {
  const bad = diagnose({
    'squares/a.square.md': squareFile(
      'a',
      `decisions:
  - id: d1
    choice: one
    supersededBy: d9
`
    )
  });
  assertHas(bad, 'error', /supersededBy nonexistent decision "d9"/);
});

test('semanticDiff emptiness rules per Change type', () => {
  const refactorWithDiff = diagnose({
    'squares/a.square.md': squareFile('a'),
    'squares/changes/c.change.md': `---
apiVersion: squaring/v0
kind: Change
id: c
name: C
type: refactor
intent: i
targets:
  - square://a
semanticDiff:
  - changes meaning
phase: active
---
`
  });
  assertHas(refactorWithDiff, 'error', /refactor Change must have an empty semanticDiff/);

  const evolutionEmpty = diagnose({
    'squares/a.square.md': squareFile('a'),
    'squares/changes/c.change.md': `---
apiVersion: squaring/v0
kind: Change
id: c
name: C
type: evolution
intent: i
targets:
  - square://a
semanticDiff: []
phase: active
---
`
  });
  assertHas(evolutionEmpty, 'error', /evolution Change must have a non-empty semanticDiff/);
});

test('done Changes must not still carry proposedDecisions', () => {
  const bad = diagnose({
    'squares/a.square.md': squareFile('a'),
    'squares/changes/c.change.md': `---
apiVersion: squaring/v0
kind: Change
id: c
name: C
type: refactor
intent: i
targets:
  - square://a
proposedDecisions:
  - id: p
    choice: x
semanticDiff: []
phase: done
---
`
  });
  assertHas(bad, 'error', /done Change still lists proposedDecisions/);
});

test('suspensions must point at existing commitments', () => {
  const files = (claim: string) => ({
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
semanticDiff: []
phase: active
suspensions:
  - claim: ${claim}
    reason: r
    until: u
---
`
  });
  assertHas(diagnose(files('square://a#decision/base')), 'error', /only commitments can be suspended/);
  assertHas(diagnose(files('square://a#commitment/nope')), 'error', /no commitment "nope"/);
});

test('Change targets and blocked.affects must resolve', () => {
  const bad = diagnose({
    'squares/a.square.md': squareFile('a'),
    'squares/changes/c.change.md': `---
apiVersion: squaring/v0
kind: Change
id: c
name: C
type: repair
intent: i
targets:
  - square://ghost
semanticDiff: []
phase: blocked
status:
  blocked:
    - reason: waiting
      affects: [square://phantom]
---
`
  });
  assertHas(bad, 'error', /target square:\/\/ghost: Square "ghost" does not exist/);
  assertHas(bad, 'error', /blocked\.affects square:\/\/phantom/);
});

test('body references are validated like frontmatter references', () => {
  const badWiki = diagnose({
    'squares/a.square.md': squareFile('a') + '\nSee [[ghost]].\n'
  });
  assertHas(badWiki, 'error', /\[\[ghost\]\] links to a nonexistent Square/);

  const badUri = diagnose({
    'squares/a.square.md': squareFile('a') + '\nSee square://a#commitment/nope.\n'
  });
  assertHas(badUri, 'error', /square:\/\/a#commitment\/nope: no commitment "nope"/);
});

test('rot-bait and missing-authority warnings fire', () => {
  const bare = diagnose({
    'squares/a.square.md': `---
apiVersion: squaring/v0
kind: Square
id: a
name: A
purpose: p
---
`
  });
  assertHas(bare, 'warning', /pure description is rot bait/);

  const noAuthority = diagnose({
    'squares/a.square.md': `---
apiVersion: squaring/v0
kind: Square
id: a
name: A
purpose: p
commitments:
  - id: base
    kind: invariant
    strength: must
    statement: s
---
`
  });
  assertHas(noAuthority, 'warning', /no authority block/);
});

test('bindings that match no files warn', () => {
  const diagnostics = diagnose({
    'squares/a.square.md': squareFile('a', 'bindings:\n  - src/nothing-here/**\n')
  });
  assertHas(diagnostics, 'warning', /matches no files/);
  assert.equal(messagesOf(diagnostics, 'error').length, 0);
});

test('a hostile squares dir name never reaches a shell (command-injection regression)', () => {
  // The stale-blocked check runs `git log` on a path derived from the
  // .squaring.json dir. With the old shell-string execSync, this dir name
  // would have executed the embedded `touch` and created the marker file.
  const marker = path.join(os.tmpdir(), `squaring-rce-marker-${process.pid}`);
  fs.rmSync(marker, { force: true });
  const evilDir = `sq"; touch ${marker}; echo "`;
  const root = makeRepo({
    '.squaring.json': JSON.stringify({ dir: evilDir }),
    [`${evilDir}/a.square.md`]: squareFile('a'),
    [`${evilDir}/changes/b.change.md`]: `---
apiVersion: squaring/v0
kind: Change
id: b
name: B
type: repair
intent: i
targets:
  - square://a
semanticDiff: []
phase: blocked
status:
  blocked:
    - reason: waiting on something
---
`
  });
  try {
    const diagnostics = validateGraph(loadGraph(root));
    assert.equal(messagesOf(diagnostics, 'error').length, 0);
    assert.ok(!fs.existsSync(marker), 'shell injection executed: marker file was created');
  } finally {
    fs.rmSync(marker, { force: true });
    rmRepo(root);
  }
});
