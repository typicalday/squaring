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

test('a decision superseded by itself is an error', () => {
  const bad = diagnose({
    'squares/a.square.md': squareFile(
      'a',
      `decisions:
  - id: d1
    choice: one
    supersededBy: d1
`
    )
  });
  assertHas(bad, 'error', /superseded by itself/);
});

test('decision from-provenance must name a done Change', () => {
  const changeFile = (phase: string) => `---
apiVersion: squaring/v0
kind: Change
id: c
name: C
type: evolution
intent: i
targets:
  - square://a
semanticDiff:
  - added d1
phase: ${phase}
---
`;
  const decidedSquare = squareFile(
    'a',
    `decisions:
  - id: d1
    choice: one
    from: change://c
`
  );

  const missing = diagnose({ 'squares/a.square.md': decidedSquare });
  assertHas(missing, 'error', /from change:\/\/c: Change does not exist/);

  const notDone = diagnose({
    'squares/a.square.md': decidedSquare,
    'squares/changes/c.change.md': changeFile('active')
  });
  assertHas(notDone, 'error', /whose phase is "active" — decisions are promoted only when the Change is done/);

  const done = diagnose({
    'squares/a.square.md': decidedSquare,
    'squares/changes/c.change.md': changeFile('done')
  });
  assert.equal(messagesOf(done, 'error').length, 0);
});

test('sources globs that are absolute or contain .. are errors (§11 error 8)', () => {
  const absolute = diagnose({
    'squares/a.square.md': squareFile('a', 'sources:\n  - glob: /etc/**\n')
  });
  assertHas(absolute, 'error', /sources glob "\/etc\/\*\*" on square:\/\/a must be a repo-relative glob without "\.\."/);

  const escaping = diagnose({
    'squares/a.square.md': squareFile('a', 'sources:\n  - glob: ../outside/**\n')
  });
  assertHas(
    escaping,
    'error',
    /sources glob "\.\.\/outside\/\*\*" on square:\/\/a must be a repo-relative glob without "\.\."/
  );

  // A concept-scoped selector is checked the same way and names its concept.
  const onConcept = diagnose({
    'squares/a.square.md': squareFile(
      'a',
      'owns:\n  concepts:\n    - id: c\n      statement: s\n      sources:\n        - glob: /etc/**\n'
    )
  });
  assertHas(onConcept, 'error', /sources glob "\/etc\/\*\*" on square:\/\/a#concept\/c must be a repo-relative glob/);
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

test('a squares/PROTOCOL.md that differs from the shipped protocol warns', () => {
  const stale = diagnose({
    'squares/a.square.md': squareFile('a'),
    'squares/PROTOCOL.md': 'old protocol text\n'
  });
  assertHas(stale, 'warning', /differs from the protocol shipped with this squaring version/);
  assert.equal(messagesOf(stale, 'error').length, 0);
});

test('sources globs that match no files warn (§11 warning 3)', () => {
  const diagnostics = diagnose({
    'squares/a.square.md': squareFile('a', 'sources:\n  - glob: src/nothing-here/**\n')
  });
  assertHas(diagnostics, 'warning', /sources glob "src\/nothing-here\/\*\*" on square:\/\/a matches no files/);
  assert.equal(messagesOf(diagnostics, 'error').length, 0);

  const onConcept = diagnose({
    'squares/a.square.md': squareFile(
      'a',
      'owns:\n  concepts:\n    - id: c\n      statement: s\n      sources:\n        - glob: src/nothing-here/**\n'
    )
  });
  assertHas(onConcept, 'warning', /on square:\/\/a#concept\/c matches no files/);
});

test('`bindings` is reported with its `sources` rewrite (§11 error 12)', () => {
  const withGlobs = diagnose({
    'squares/a.square.md': squareFile('a', 'bindings:\n  - src/**\n  - lib/*.ts\n')
  });
  assertHas(
    withGlobs,
    'error',
    /`bindings` is removed, replaced by `sources` — move "src\/\*\*", "lib\/\*\.ts" under `sources:`, one `- glob: <glob>` entry each \(SPEC §15\.7, §11 error 12\)/
  );

  // The rewrite is the whole point of the dedicated error: `bindings` must not
  // fall through to the generic strict-unknown-field message.
  assert.equal(
    messagesOf(withGlobs, 'error').some((m) => /unrecognized key/i.test(m)),
    false
  );

  const empty = diagnose({ 'squares/a.square.md': squareFile('a', 'bindings: []\n') });
  assertHas(empty, 'error', /use `sources:` with `- glob: <glob>` entries instead/);
});

test('concept tags must resolve inside the declaring Square (§11 error 9)', () => {
  const undeclared = diagnose({
    'squares/a.square.md': squareFile(
      'a',
      'owns:\n  concepts:\n    - id: known\n      statement: s\ndecisions:\n  - id: d\n    date: 2026-01-01\n    choice: c\n    concepts: [ghost]\n'
    )
  });
  assertHas(
    undeclared,
    'error',
    /decision "d" is tagged with concept "ghost", which square:\/\/a does not declare — concept tags never resolve across Squares/
  );

  // Cross-Square tagging does not exist: b declaring the concept does not help a.
  const crossSquare = diagnose({
    'squares/a.square.md': squareFile(
      'a',
      'scenarios:\n  - id: s1\n    given: g\n    when: w\n    then: [t]\n    concepts: [owned-by-b]\n'
    ),
    'squares/b.square.md': squareFile(
      'b',
      'owns:\n  concepts:\n    - id: owned-by-b\n      statement: s\n      sources:\n        - glob: "**/*"\n'
    )
  });
  assertHas(
    crossSquare,
    'error',
    /scenario "s1" is tagged with concept "owned-by-b", which square:\/\/a does not declare/
  );
});

test('duplicate concept ids are an error (§11 error 9)', () => {
  const diagnostics = diagnose({
    'squares/a.square.md': squareFile(
      'a',
      'owns:\n  concepts:\n    - id: dup\n      statement: one\n    - id: dup\n      statement: two\ndecisions:\n  - id: d\n    date: 2026-01-01\n    choice: c\n    concepts: [dup]\n'
    )
  });
  assertHas(diagnostics, 'error', /duplicate concept id "dup" in owns\.concepts \(SPEC §14\.2, §11 error 9\)/);
});

test('a concept nothing points at is inert (§11 warning 6)', () => {
  const inert = diagnose({
    'squares/a.square.md': squareFile('a', 'owns:\n  concepts:\n    - id: lonely\n      statement: s\n')
  });
  assertHas(
    inert,
    'warning',
    /concept "lonely" is inert — no claim is tagged with it, no selector is scoped to it, and no anchor targets it/
  );

  // Any one of the three pointers clears it. A tagged claim:
  const tagged = diagnose({
    'squares/a.square.md': squareFile(
      'a',
      'owns:\n  concepts:\n    - id: used\n      statement: s\ncommitments:\n  - id: c2\n    kind: invariant\n    strength: must\n    statement: s\n    concepts: [used]\n'
    )
  });
  assert.equal(messagesOf(tagged, 'warning').length, 0);

  // A concept-scoped selector (which matches, so warning 3 stays quiet):
  const scoped = diagnose({
    'squares/a.square.md': squareFile(
      'a',
      'owns:\n  concepts:\n    - id: used\n      statement: s\n      sources:\n        - glob: src/thing.ts\n'
    ),
    'src/thing.ts': 'export const x = 1;\n'
  });
  assert.equal(messagesOf(scoped, 'warning').length, 0);

  // An anchor targeting it:
  const anchored = diagnose({
    'squares/a.square.md': squareFile('a', 'owns:\n  concepts:\n    - id: used\n      statement: s\n'),
    'src/thing.ts': '// @sq a#concept/used\nexport const x = 1;\n'
  });
  assert.equal(messagesOf(anchored, 'warning').length, 0);
});

test('malformed, dangling and ambiguous anchors are errors (§11 error 10)', () => {
  const malformed = diagnose({
    'squares/a.square.md': squareFile('a'),
    'src/thing.ts': '// @sq Not-An-Id\n'
  });
  assertHas(
    malformed,
    'error',
    /malformed anchor target "Not-An-Id": not a square:\/\/ URI, a <square>#<kind>\/<id> reference, or a bare id/
  );

  const emptyTarget = diagnose({
    'squares/a.square.md': squareFile('a'),
    'src/thing.ts': '// @sq\n'
  });
  assertHas(emptyTarget, 'error', /malformed anchor: empty target — write `@sq` then one target/);

  const dangling = diagnose({
    'squares/a.square.md': squareFile('a'),
    'src/thing.ts': '// @sq ghost\n'
  });
  assertHas(dangling, 'error', /dangling anchor "ghost": no Square or concept named "ghost"/);

  const noSuchConcept = diagnose({
    'squares/a.square.md': squareFile('a'),
    'src/thing.ts': '// @sq a#concept/ghost\n'
  });
  assertHas(noSuchConcept, 'error', /dangling anchor "a#concept\/ghost": square:\/\/a declares no concept "ghost"/);

  const noSuchClaim = diagnose({
    'squares/a.square.md': squareFile('a'),
    'src/thing.ts': '// @sq a#commitment/ghost\n'
  });
  assertHas(noSuchClaim, 'error', /dangling anchor "a#commitment\/ghost": square:\/\/a has no commitment "ghost"/);

  // A bare id naming both a Square and a concept resolves to neither.
  const ambiguous = diagnose({
    'squares/a.square.md': squareFile('a'),
    'squares/b.square.md': squareFile(
      'b',
      'owns:\n  concepts:\n    - id: a\n      statement: s\n      sources:\n        - glob: src/thing.ts\n'
    ),
    'src/thing.ts': '// @sq a\n'
  });
  assertHas(
    ambiguous,
    'error',
    /ambiguous anchor "a": names 2 targets \(square:\/\/a, square:\/\/b#concept\/a\) — spell the URI/
  );
});

test('`expect: annotated` requires an anchor into the declaring Square (§11 error 11)', () => {
  const uncovered = diagnose({
    'squares/a.square.md': squareFile('a', 'sources:\n  - glob: src/*.ts\n    expect: annotated\n'),
    'src/thing.ts': 'export const x = 1;\n'
  });
  assertHas(
    uncovered,
    'error',
    /no anchor resolving into square:\/\/a, required by its `expect: annotated` selector "src\/\*\.ts"/
  );

  // An anchor on any of the Square's own targets satisfies it — here a claim.
  const covered = diagnose({
    'squares/a.square.md': squareFile('a', 'sources:\n  - glob: src/*.ts\n    expect: annotated\n'),
    'src/thing.ts': '// @sq a#commitment/base\nexport const x = 1;\n'
  });
  assert.equal(messagesOf(covered, 'error').length, 0);

  // An anchor into a *different* Square does not satisfy it.
  const wrongSquare = diagnose({
    'squares/a.square.md': squareFile('a', 'sources:\n  - glob: src/*.ts\n    expect: annotated\n'),
    'squares/b.square.md': squareFile('b'),
    'src/thing.ts': '// @sq b\nexport const x = 1;\n'
  });
  assertHas(wrongSquare, 'error', /no anchor resolving into square:\/\/a/);
});

test('validate runs the anchor scan on every invocation', () => {
  // Error 10 comes only from the scan: if `validate` skipped it, a repo whose
  // graph is internally perfect but whose realization carries a broken anchor
  // would report clean.
  const diagnostics = diagnose({
    'squares/a.square.md': squareFile('a'),
    'src/thing.ts': '// @sq square://ghost\n'
  });
  assertHas(diagnostics, 'error', /dangling anchor "square:\/\/ghost": Square "ghost" does not exist/);
  assert.equal(diagnostics.some((d) => d.file === 'src/thing.ts' && d.line === 1), true);
});

test('suspensions still accept claim URIs only — a concept is not suspendable', () => {
  const change = (claim: string) => `---
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
    until: 2030-01-01
---
`;
  const onConcept = diagnose({
    'squares/a.square.md': squareFile(
      'a',
      'owns:\n  concepts:\n    - id: c1\n      statement: s\ndecisions:\n  - id: d\n    date: 2026-01-01\n    choice: c\n    concepts: [c1]\n'
    ),
    'squares/changes/c.change.md': change('square://a#concept/c1')
  });
  // The claim-URI regex never widened to `#concept/`: a concept URI is rejected
  // by the schema, before validate.ts ever sees the suspension.
  assertHas(onConcept, 'error', /suspensions\.0\.claim: expected a square:\/\/<id>#<facet>\/<claim-id> URI/);

  const onCommitment = diagnose({
    'squares/a.square.md': squareFile('a'),
    'squares/changes/c.change.md': change('square://a#commitment/base')
  });
  assert.equal(messagesOf(onCommitment, 'error').length, 0);

  // A non-commitment claim URI is schema-valid and caught by validate.ts.
  const onDecision = diagnose({
    'squares/a.square.md': squareFile('a', 'decisions:\n  - id: d\n    date: 2026-01-01\n    choice: c\n'),
    'squares/changes/c.change.md': change('square://a#decision/d')
  });
  assertHas(onDecision, 'error', /suspension square:\/\/a#decision\/d: only commitments can be suspended/);
});

test('concept references resolve like any other reference (§11 error 3)', () => {
  const withBody = (body: string) =>
    squareFile(
      'a',
      'owns:\n  concepts:\n    - id: real\n      statement: s\ndecisions:\n  - id: d\n    date: 2026-01-01\n    choice: c\n    concepts: [real]\n'
    ) + body;

  assert.equal(
    messagesOf(diagnose({ 'squares/a.square.md': withBody('Owns square://a#concept/real.\n') }), 'error').length,
    0
  );
  assertHas(
    diagnose({ 'squares/a.square.md': withBody('Owns square://a#concept/ghost.\n') }),
    'error',
    /square:\/\/a#concept\/ghost: no concept "ghost" in square:\/\/a \(SPEC §11 error 3\)/
  );

  // Same rule through a Change's blocked.affects, which is free-form text
  // checked whenever it looks like a square:// URI.
  const changeAffecting = (uri: string) => `---
apiVersion: squaring/v0
kind: Change
id: c
name: C
type: repair
intent: i
targets:
  - square://a
semanticDiff: []
phase: blocked
status:
  blocked:
    - reason: r
      affects:
        - ${uri}
---
`;
  assertHas(
    diagnose({
      'squares/a.square.md': withBody(''),
      'squares/changes/c.change.md': changeAffecting('square://a#concept/ghost')
    }),
    'error',
    /blocked\.affects square:\/\/a#concept\/ghost: no concept "ghost" in square:\/\/a/
  );
  assert.equal(
    messagesOf(
      diagnose({
        'squares/a.square.md': withBody(''),
        'squares/changes/c.change.md': changeAffecting('square://a#concept/real')
      }),
      'error'
    ).length,
    0
  );
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
