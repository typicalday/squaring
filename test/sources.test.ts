// Resolution and the index — SPEC §15.3, §15.5, §15.6.
//
// Like scan.test.ts, this file quotes anchor markers as data and stays out of
// every real scan universe via the repository's `test/**` scanIgnore.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadGraph, type Diagnostic, type Graph } from '../src/load.ts';
import { buildSourceMap, filesForTarget, entriesForFile, type SourceMap } from '../src/sources.ts';
import { formatForwardIndex, formatReverseIndex, indexJson, indexText, resolveIndexTarget } from '../src/indexing.ts';
import { makeRepo, rmRepo, squareFile } from './helpers.ts';

const AT = '@' + 'sq';

/** A git-tracked repo — the scan universe is the git index (§15.4 step 1). */
function makeGitRepo(files: Record<string, string>): string {
  const root = makeRepo(files);
  execFileSync('git', ['init', '-q'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['add', '-A'], { cwd: root, stdio: 'ignore' });
  return root;
}

function resolve(files: Record<string, string>): { graph: Graph; map: SourceMap; root: string } {
  const root = makeGitRepo(files);
  const graph = loadGraph(root);
  return { graph, map: buildSourceMap(graph), root };
}

function errorsOf(map: SourceMap): string[] {
  return map.findings.filter((d) => d.severity === 'error').map((d) => d.message);
}

function warningsOf(map: SourceMap): Diagnostic[] {
  return map.findings.filter((d) => d.severity === 'warning');
}

// A Square with one concept per claim tag, used across the union tests.
const ORDERS = squareFile(
  'orders',
  `owns:
  concepts:
    - id: order
      statement: a purchase request
      sources:
        - glob: src/order-*.ts
    - id: line-item
      statement: one product and quantity
sources:
  - glob: src/shared.ts
decisions:
  - id: usd-only
    date: 2026-01-01
    choice: totals are USD
    concepts: [order]
scenarios:
  - id: happy-path
    given: g
    when: w
    then: [t]
    concepts: [order, line-item]
unresolved:
  - id: untagged-question
    question: q
`
);

// ---- union resolution (§15.5) ----------------------------------------------

test('files(claim) is exactly the files anchored to it', () => {
  const { map, root } = resolve({
    'squares/orders.square.md': ORDERS,
    'src/a.ts': `// ${AT} orders#scenario/happy-path\n`,
    'src/b.ts': `// ${AT} orders#scenario/happy-path\n`,
    'src/c.ts': 'nothing\n'
  });
  try {
    assert.deepEqual(filesForTarget(map, 'square://orders#scenario/happy-path'), ['src/a.ts', 'src/b.ts']);
    // A claim has no selectors of its own — only anchors reach it.
    assert.deepEqual(filesForTarget(map, 'square://orders#unresolved/untagged-question'), []);
  } finally {
    rmRepo(root);
  }
});

test('files(concept) unions its globs, its anchors, and the files of the claims tagged with it', () => {
  const { map, root } = resolve({
    'squares/orders.square.md': ORDERS,
    'src/order-status.ts': 'by the concept glob\n',
    'src/anchored.ts': `// ${AT} orders#concept/order\n`,
    'src/tagged-claim.ts': `// ${AT} orders#decision/usd-only\n`,
    'src/unrelated.ts': 'nothing\n'
  });
  try {
    assert.deepEqual(filesForTarget(map, 'square://orders#concept/order'), [
      'src/anchored.ts',
      'src/order-status.ts',
      'src/tagged-claim.ts'
    ]);
    // line-item has no glob and no anchor: it gets only its tagged claim's files.
    assert.deepEqual(filesForTarget(map, 'square://orders#concept/line-item'), []);
  } finally {
    rmRepo(root);
  }
});

test('files(square) unions its globs, its anchors, every concept and every claim', () => {
  const { map, root } = resolve({
    'squares/orders.square.md': ORDERS,
    'src/shared.ts': 'by the square glob\n',
    'src/order-status.ts': 'by the concept glob\n',
    'src/square-anchored.ts': `// ${AT} orders\n`,
    'src/concept-anchored.ts': `// ${AT} orders#concept/line-item\n`,
    'src/claim-anchored.ts': `// ${AT} orders#unresolved/untagged-question\n`,
    'src/unrelated.ts': 'nothing\n'
  });
  try {
    assert.deepEqual(filesForTarget(map, 'square://orders'), [
      'src/claim-anchored.ts',
      'src/concept-anchored.ts',
      'src/order-status.ts',
      'src/shared.ts',
      'src/square-anchored.ts'
    ]);
    // An untagged claim's file reaches the Square but no concept.
    assert.deepEqual(filesForTarget(map, 'square://orders#concept/order'), ['src/order-status.ts']);
  } finally {
    rmRepo(root);
  }
});

test('containment holds: files(square) ⊇ files(concept) ⊇ files(claim tagged with it)', () => {
  const { map, root } = resolve({
    'squares/orders.square.md': ORDERS,
    'src/shared.ts': 'square glob\n',
    'src/order-a.ts': 'concept glob\n',
    'src/scen.ts': `// ${AT} orders#scenario/happy-path\n`
  });
  try {
    const square = new Set(filesForTarget(map, 'square://orders'));
    const concept = filesForTarget(map, 'square://orders#concept/order');
    const claim = filesForTarget(map, 'square://orders#scenario/happy-path');
    assert.ok(concept.length > 0 && claim.length > 0, 'the fixture must exercise all three levels');
    for (const f of concept) assert.ok(square.has(f), `square must contain concept file ${f}`);
    for (const f of claim) {
      assert.ok(square.has(f), `square must contain claim file ${f}`);
      assert.ok(concept.includes(f), `concept must contain its tagged claim's file ${f}`);
    }
  } finally {
    rmRepo(root);
  }
});

test('an anchor on a claim reaches every concept tagging that claim, and the Square', () => {
  const { map, root } = resolve({
    'squares/orders.square.md': ORDERS,
    'src/both.ts': `// ${AT} orders#scenario/happy-path\n`
  });
  try {
    const targets = entriesForFile(map, 'src/both.ts').map((e) => e.target);
    assert.deepEqual(targets, [
      'square://orders',
      'square://orders#concept/line-item',
      'square://orders#concept/order',
      'square://orders#scenario/happy-path'
    ]);
    // Every pairing is labeled with the anchor that produced it.
    for (const entry of entriesForFile(map, 'src/both.ts')) {
      assert.equal(entry.via, 'anchor');
      assert.equal(entry.match, 'orders#scenario/happy-path');
      assert.equal(entry.line, 1);
    }
  } finally {
    rmRepo(root);
  }
});

test('a concept-scoped selector maps its files into the declaring Square too', () => {
  const { map, root } = resolve({
    'squares/orders.square.md': ORDERS,
    'src/order-x.ts': 'concept glob only\n'
  });
  try {
    const entries = entriesForFile(map, 'src/order-x.ts');
    assert.deepEqual(entries.map((e) => e.target), ['square://orders', 'square://orders#concept/order']);
    // Both pairings name the same selector — the Square's copy is not relabeled.
    for (const entry of entries) {
      assert.equal(entry.via, 'selector');
      assert.equal(entry.match, 'src/order-*.ts');
      assert.equal(entry.line, undefined);
    }
  } finally {
    rmRepo(root);
  }
});

test('resolution is a plain union — `expect` never filters it', () => {
  const { map, root } = resolve({
    'squares/a.square.md': squareFile('a', 'sources:\n  - glob: src/*.ts\n    expect: annotated\n'),
    'src/anchored.ts': `// ${AT} a\n`,
    'src/bare.ts': 'no anchor here\n'
  });
  try {
    // src/bare.ts fails the coverage check, and is still resolved to the Square.
    assert.deepEqual(filesForTarget(map, 'square://a'), ['src/anchored.ts', 'src/bare.ts']);
    assert.equal(errorsOf(map).length, 1);
    assert.match(errorsOf(map)[0]!, /no anchor resolving into square:\/\/a/);
  } finally {
    rmRepo(root);
  }
});

test('the same file may be claimed by several Squares', () => {
  const { map, root } = resolve({
    'squares/a.square.md': squareFile('a', 'sources:\n  - glob: src/shared.ts\n'),
    'squares/b.square.md': squareFile('b'),
    'src/shared.ts': `// ${AT} b\n`
  });
  try {
    assert.deepEqual(filesForTarget(map, 'square://a'), ['src/shared.ts']);
    assert.deepEqual(filesForTarget(map, 'square://b'), ['src/shared.ts']);
    assert.deepEqual(entriesForFile(map, 'src/shared.ts').map((e) => [e.target, e.via]), [
      ['square://a', 'selector'],
      ['square://b', 'anchor']
    ]);
  } finally {
    rmRepo(root);
  }
});

// ---- expect: annotated (§15.3, §11 error 11) --------------------------------

test('any anchor into the declaring Square satisfies coverage', () => {
  const { map, root } = resolve({
    'squares/orders.square.md': ORDERS.replace('sources:\n  - glob: src/shared.ts\n', 'sources:\n  - glob: src/*.ts\n    expect: annotated\n'),
    'src/by-square.ts': `// ${AT} orders\n`,
    'src/by-concept.ts': `// ${AT} orders#concept/line-item\n`,
    'src/by-claim.ts': `// ${AT} orders#unresolved/untagged-question\n`
  });
  try {
    assert.deepEqual(errorsOf(map), []);
  } finally {
    rmRepo(root);
  }
});

test('a binary file is exempt from coverage while the glob still maps it', () => {
  const root = makeGitRepo({
    'squares/a.square.md': squareFile('a', 'sources:\n  - glob: assets/*\n    expect: annotated\n')
  });
  try {
    fs.mkdirSync(path.join(root, 'assets'));
    fs.writeFileSync(path.join(root, 'assets/logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]));
    execFileSync('git', ['add', '-A'], { cwd: root, stdio: 'ignore' });

    const map = buildSourceMap(loadGraph(root));
    assert.deepEqual([...map.binary], ['assets/logo.png']);
    assert.deepEqual(errorsOf(map), [], 'a binary can never carry an anchor, so the check skips it');
    assert.deepEqual(filesForTarget(map, 'square://a'), ['assets/logo.png'], 'the glob still maps it');
  } finally {
    rmRepo(root);
  }
});

test('each expecting Square is satisfied independently', () => {
  const { map, root } = resolve({
    'squares/a.square.md': squareFile('a', 'sources:\n  - glob: src/shared.ts\n    expect: annotated\n'),
    'squares/b.square.md': squareFile('b', 'sources:\n  - glob: src/shared.ts\n    expect: annotated\n'),
    'src/shared.ts': `// ${AT} a\n`
  });
  try {
    // a is satisfied; b is not, even though the file carries an anchor.
    const errors = errorsOf(map);
    assert.equal(errors.length, 1);
    assert.match(errors[0]!, /no anchor resolving into square:\/\/b/);
  } finally {
    rmRepo(root);
  }

  const both = resolve({
    'squares/a.square.md': squareFile('a', 'sources:\n  - glob: src/shared.ts\n    expect: annotated\n'),
    'squares/b.square.md': squareFile('b', 'sources:\n  - glob: src/shared.ts\n    expect: annotated\n'),
    'src/shared.ts': `// ${AT} a\n// ${AT} b\n`
  });
  try {
    assert.deepEqual(errorsOf(both.map), []);
  } finally {
    rmRepo(both.root);
  }
});

test('a selector without `expect` demands nothing', () => {
  const { map, root } = resolve({
    'squares/a.square.md': squareFile('a', 'sources:\n  - glob: src/*.ts\n'),
    'src/bare.ts': 'no anchor\n'
  });
  try {
    assert.deepEqual(errorsOf(map), []);
  } finally {
    rmRepo(root);
  }
});

// ---- the index (§15.6) ------------------------------------------------------

test('index entry order is target, path, via, match, line', () => {
  const { graph, map, root } = resolve({
    'squares/orders.square.md': ORDERS,
    'src/shared.ts': `// ${AT} orders\n// x\n// ${AT} orders#concept/order\n`,
    'src/order-a.ts': `// ${AT} orders\n`
  });
  try {
    const entries = indexJson(graph, map, {});
    // `via` ranks selector before anchor, which is not its alphabetical order —
    // the spec fixes the order deliberately, so the comparator must too.
    const viaRank = (via: string) => (via === 'selector' ? 0 : 1);
    const keys = entries.map((e) => [e.target, e.path, viaRank(e.via), e.match, e.line ?? 0] as const);
    const sorted = [...keys].sort((a, b) => {
      for (const i of [0, 1, 2, 3] as const) {
        if (a[i] !== b[i]) return a[i]! < b[i]! ? -1 : 1;
      }
      return a[4] - b[4];
    });
    assert.deepEqual(keys, sorted, 'entries must already be in the §15.6 order');

    // selector sorts before anchor on the same (target, path).
    const shared = entries.filter((e) => e.target === 'square://orders' && e.path === 'src/order-a.ts');
    assert.deepEqual(shared.map((e) => e.via), ['selector', 'anchor']);
  } finally {
    rmRepo(root);
  }
});

test('`--json` is byte-stable across repeated scans of the same tree', () => {
  const { graph, map, root } = resolve({
    'squares/orders.square.md': ORDERS,
    'src/shared.ts': `// ${AT} orders\n`,
    'src/order-a.ts': `// ${AT} orders#concept/order -- note\n`
  });
  try {
    const first = JSON.stringify(indexJson(graph, map, {}));
    const second = JSON.stringify(indexJson(loadGraph(root), buildSourceMap(loadGraph(root)), {}));
    assert.equal(first, second);
  } finally {
    rmRepo(root);
  }
});

test('the forward map nests Square → concept → tagged claim, and lists untagged claims at the Square', () => {
  const { graph, map, root } = resolve({
    'squares/orders.square.md': ORDERS,
    'src/order-a.ts': 'concept glob\n',
    'src/scen.ts': `// ${AT} orders#scenario/happy-path\n`,
    'src/q.ts': `// ${AT} orders#unresolved/untagged-question\n`
  });
  try {
    const text = formatForwardIndex(graph, map);
    const lines = text.split('\n');
    const indexOf = (needle: string) => lines.findIndex((l) => l.includes(needle));

    assert.ok(indexOf('square://orders (Square orders)') === 0);
    // A tagged claim appears under each concept tagging it, indented deeper.
    const conceptOrder = indexOf('concept square://orders#concept/order');
    const conceptLineItem = indexOf('concept square://orders#concept/line-item');
    assert.ok(conceptOrder > 0 && conceptLineItem > conceptOrder);
    assert.equal(
      lines.filter((l) => l.includes('scenario square://orders#scenario/happy-path')).length,
      2,
      'happy-path is tagged with two concepts, so it appears under both'
    );
    // An untagged claim sits directly under its Square, not under a concept.
    const untagged = lines.find((l) => l.includes('unresolved square://orders#unresolved/untagged-question'))!;
    assert.match(untagged, /^ {2}unresolved /);
  } finally {
    rmRepo(root);
  }
});

test('a target scopes the forward map; a claim target renders even with nothing resolved', () => {
  const { graph, map, root } = resolve({
    'squares/orders.square.md': ORDERS,
    'squares/other.square.md': squareFile('other', 'sources:\n  - glob: src/other.ts\n'),
    'src/other.ts': 'x\n',
    'src/order-a.ts': 'concept glob\n'
  });
  try {
    const scoped = formatForwardIndex(graph, map, resolveIndexTarget(graph, 'orders'));
    assert.ok(!scoped.includes('square://other'), 'a scoped forward map shows only its own subtree');

    const conceptScoped = formatForwardIndex(graph, map, resolveIndexTarget(graph, 'orders#concept/order'));
    assert.ok(conceptScoped.startsWith('concept square://orders#concept/order'));

    // A claim with nothing resolved is silent inside a larger map, but shows as
    // an explicit empty node when it is itself the target.
    const claimScoped = formatForwardIndex(
      graph,
      map,
      resolveIndexTarget(graph, 'square://orders#unresolved/untagged-question')
    );
    assert.equal(claimScoped, 'unresolved square://orders#unresolved/untagged-question — 0 file(s)');
  } finally {
    rmRepo(root);
  }
});

test('the reverse map names every claimant of one file, and says when a file is outside the universe', () => {
  const { map, root } = resolve({
    'squares/orders.square.md': ORDERS,
    'src/shared.ts': `// ${AT} orders#scenario/happy-path -- why it is here\n`
  });
  try {
    const text = formatReverseIndex(map, 'src/shared.ts');
    assert.ok(text.startsWith('src/shared.ts\n'));
    for (const target of [
      'square://orders',
      'square://orders#concept/line-item',
      'square://orders#concept/order',
      'square://orders#scenario/happy-path'
    ]) {
      assert.ok(text.includes(target), `reverse map must list ${target}`);
    }
    assert.ok(text.includes('selector `src/shared.ts`'));
    assert.ok(text.includes('anchor `orders#scenario/happy-path`:1 — why it is here'));

    // The squares directory is removed from the universe (§15.4 step 3), so its
    // own files are reported the same way as a path that does not exist.
    assert.match(formatReverseIndex(map, 'squares/orders.square.md'), /not in the scan universe/);
    assert.match(formatReverseIndex(map, 'src/typo.ts'), /not in the scan universe/);
  } finally {
    rmRepo(root);
  }
});

test('an unclaimed universe file says so', () => {
  const { map, root } = resolve({
    'squares/a.square.md': squareFile('a'),
    'src/orphan.ts': 'nobody claims me\n'
  });
  try {
    assert.equal(
      formatReverseIndex(map, 'src/orphan.ts'),
      'src/orphan.ts\n  (no Square, concept or claim claims this file)'
    );
  } finally {
    rmRepo(root);
  }
});

test('`<target>` and `--file` together are an error in both renderings', () => {
  const { graph, map, root } = resolve({ 'squares/a.square.md': squareFile('a') });
  try {
    const query = { target: 'a', file: 'src/x.ts' };
    assert.throws(() => indexJson(graph, map, query), /takes a <target> or --file, not both/);
    assert.throws(() => indexText(graph, map, query), /takes a <target> or --file, not both/);
  } finally {
    rmRepo(root);
  }
});

test('a bare index target always names a Square, unlike a bare anchor target', () => {
  const { graph, map, root } = resolve({
    'squares/orders.square.md': ORDERS,
    'squares/order.square.md': squareFile('order', 'sources:\n  - glob: src/x.ts\n'),
    'src/x.ts': 'x\n'
  });
  try {
    // `order` is both a Square id and a concept id of `orders`. As an index
    // argument it is never ambiguous: it names the Square.
    assert.deepEqual(resolveIndexTarget(graph, 'order'), {
      kind: 'square',
      uri: 'square://order',
      squareId: 'order'
    });
    assert.deepEqual(resolveIndexTarget(graph, 'orders#concept/order'), {
      kind: 'concept',
      uri: 'square://orders#concept/order',
      squareId: 'orders',
      conceptId: 'order'
    });
    assert.equal(indexJson(graph, map, { target: 'order' }).every((e) => e.target.startsWith('square://order')), true);
  } finally {
    rmRepo(root);
  }
});

test('index targets that do not resolve throw actionable errors', () => {
  const { graph, root } = resolve({ 'squares/orders.square.md': ORDERS });
  try {
    assert.throws(() => resolveIndexTarget(graph, 'Orders'), /is not a Square id, concept URI or claim URI/);
    assert.throws(() => resolveIndexTarget(graph, 'ghost'), /no Square named "ghost"/);
    assert.throws(
      () => resolveIndexTarget(graph, 'orders#concept/ghost'),
      /square:\/\/orders declares no concept "ghost"/
    );
    assert.throws(
      () => resolveIndexTarget(graph, 'orders#decision/ghost'),
      /square:\/\/orders has no decision "ghost"/
    );
  } finally {
    rmRepo(root);
  }
});

test('an unconfined selector is named and skipped in the forward map, never enumerated', () => {
  const { graph, map, root } = resolve({
    'squares/a.square.md': squareFile('a', 'sources:\n  - glob: /etc/**\n')
  });
  try {
    const text = formatForwardIndex(graph, map);
    assert.match(text, /selector `\/etc\/\*\*` — skipped \(not a repo-relative glob without "\.\."\)/);
    assert.deepEqual(filesForTarget(map, 'square://a'), []);
  } finally {
    rmRepo(root);
  }
});

test('a --file argument is normalized to the one spelling the map uses', () => {
  const { graph, map, root } = resolve({
    'squares/orders.square.md': ORDERS,
    'src/shared.ts': 'x\n'
  });
  try {
    // One file, five spellings of the same path: the reverse lookup must not
    // depend on how the caller happened to type it.
    const canonical = indexJson(graph, map, { file: 'src/shared.ts' });
    assert.equal(canonical.length, 1);
    for (const spelling of [
      './src/shared.ts',
      'src/./shared.ts',
      'docs/../src/shared.ts',
      path.join(root, 'src/shared.ts')
    ]) {
      assert.deepEqual(indexJson(graph, map, { file: spelling }), canonical, `--file ${spelling}`);
      assert.equal(
        indexText(graph, map, { file: spelling }),
        indexText(graph, map, { file: 'src/shared.ts' }),
        `--file ${spelling} (text)`
      );
    }

    // Outside the root is an error, not a silent empty answer: "no Square
    // claims it" would be a wrong answer for a file the map never covers.
    for (const outside of ['../elsewhere.ts', '/etc/passwd', root]) {
      assert.throws(() => indexJson(graph, map, { file: outside }), /outside the repository root/);
      assert.throws(() => indexText(graph, map, { file: outside }), /outside the repository root/);
    }
  } finally {
    rmRepo(root);
  }
});

test('a file whose bytes cannot be read never satisfies `expect: annotated`', (t) => {
  const { root } = resolve({ 'squares/a.square.md': squareFile('a') });
  try {
    const secret = path.join(root, 'src/locked.ts');
    fs.writeFileSync(path.join(root, 'squares/a.square.md'), squareFile('a', 'sources:\n  - glob: src/locked.ts\n    expect: annotated\n'));
    fs.mkdirSync(path.dirname(secret), { recursive: true });
    fs.writeFileSync(secret, 'export const a = 1;\n');
    execFileSync('git', ['add', '-A'], { cwd: root, stdio: 'ignore' });
    fs.chmodSync(secret, 0o000);
    let readable = true;
    try {
      fs.closeSync(fs.openSync(secret, 'r'));
    } catch {
      readable = false;
    }
    // Running as root defeats the mode bits. Report that as a skip, not a
    // pass: a bare `return` here would make the test green while asserting
    // nothing, and hide the day CI moves into a root container.
    if (readable) {
      t.skip('cannot exercise an unreadable file as root');
      return;
    }

    const map = buildSourceMap(loadGraph(root));
    assert.ok(map.unreadable.has('src/locked.ts'), 'an unreadable file is classified apart from a binary');
    assert.ok(!map.binary.has('src/locked.ts'), 'unreadable is not binary — binary is the only `expect` exemption');
    const messages = errorsOf(map);
    assert.equal(messages.length, 1);
    assert.match(messages[0]!, /could not be read, so its anchors are unknown/);
    assert.match(messages[0]!, /SPEC §15\.3, §11 error 11/);

    // Warning 8 fires alongside error 11, never instead of it. The two say
    // different things: the error says the declaring Square's coverage
    // expectation is unmet, the warning says the bytes were never examined.
    const warnings = warningsOf(map);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0]!.file, 'src/locked.ts');
    assert.match(warnings[0]!.message, /SPEC §15\.4 step 4, §11 warning 8/);
  } finally {
    try {
      fs.chmodSync(path.join(root, 'src/locked.ts'), 0o644);
    } catch {
      // already gone or never created
    }
    rmRepo(root);
  }
});

test('a duplicate concept id does not make a bare anchor ambiguous with itself', () => {
  const { map, root } = resolve({
    'squares/a.square.md': squareFile(
      'a',
      `owns:
  concepts:
    - id: dup
      statement: first
    - id: dup
      statement: second
`
    ),
    'src/x.ts': `// ${AT} dup\n`
  });
  try {
    // The duplicate itself is §11 error 9, raised by validate.ts. Resolution
    // must not pile a second, unactionable "ambiguous — spell the URI" on top:
    // both candidates would print the same URI, so spelling it changes nothing.
    assert.deepEqual(errorsOf(map), []);
    assert.deepEqual(filesForTarget(map, 'square://a#concept/dup'), ['src/x.ts']);
  } finally {
    rmRepo(root);
  }
});

// ---- universe-level findings (§11 warnings 7 and 8) ------------------------

test('an unreadable file is reported even when no selector expects it (§11 warning 8)', (t) => {
  const root = makeGitRepo({
    // Deliberately no `sources` at all: without warning 8, nothing at all would
    // be said, and the file's anchors would silently vanish from the index.
    'squares/a.square.md': squareFile('a'),
    'src/locked.ts': 'export const a = 1;\n'
  });
  const secret = path.join(root, 'src/locked.ts');
  try {
    fs.chmodSync(secret, 0o000);
    let readable = true;
    try {
      fs.closeSync(fs.openSync(secret, 'r'));
    } catch {
      readable = false;
    }
    if (readable) {
      t.skip('cannot exercise an unreadable file as root');
      return;
    }

    const map = buildSourceMap(loadGraph(root));
    assert.ok(map.unreadable.has('src/locked.ts'));
    assert.deepEqual(errorsOf(map), [], 'no expecting selector covers it, so error 11 cannot fire');
    const warnings = warningsOf(map);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0]!.file, 'src/locked.ts');
    assert.match(warnings[0]!.message, /could not be read, so its anchors are unknown/);
    assert.match(warnings[0]!.message, /SPEC §15\.4 step 4, §11 warning 8/);
  } finally {
    try {
      fs.chmodSync(secret, 0o644);
    } catch {
      // already gone or never created
    }
    rmRepo(root);
  }
});

test('an empty scan universe is reported however it got empty (§11 warning 7)', () => {
  const emptyWarning = (map: SourceMap): Diagnostic | undefined =>
    map.findings.find((d) => d.message.includes('the scan universe is empty'));

  // Cause 1: `dir` covers the repository root, so §15.4 step 2 — which removes
  // the squares directory by path prefix — removes every file in the repo.
  const viaDir = resolve({
    '.squaring.json': `${JSON.stringify({ dir: '.' })}\n`,
    'a.square.md': squareFile('a'),
    'src/a.ts': 'export const a = 1;\n'
  });
  try {
    assert.deepEqual(viaDir.map.universe, []);
    const found = emptyWarning(viaDir.map);
    assert.ok(found, 'dir: "." must not empty the universe silently');
    assert.equal(found.severity, 'warning');
    // Blamed on the config file, because the config is what could have caused it.
    assert.equal(found.file, '.squaring.json');
    assert.match(found.message, /squares dir "\."/);
    assert.match(found.message, /no scanIgnore/);
    assert.match(found.message, /SPEC §15\.4, §11 warning 7/);
  } finally {
    rmRepo(viaDir.root);
  }

  // Cause 2: a scanIgnore that removes everything step 2 left behind. Note what
  // it takes — `**` does not match a leading-dot name, so `.squaring.json` has
  // to be named explicitly. A scanIgnore that empties the universe only partly
  // is warning 3 on each selector, not this warning.
  const viaIgnore = resolve({
    '.squaring.json': `${JSON.stringify({ scanIgnore: ['src/**', '.squaring.json'] })}\n`,
    'squares/a.square.md': squareFile('a'),
    'src/a.ts': 'export const a = 1;\n'
  });
  try {
    assert.deepEqual(viaIgnore.map.universe, []);
    const found = emptyWarning(viaIgnore.map);
    assert.ok(found, 'an over-broad scanIgnore is the same silent failure as dir: "."');
    assert.equal(found.file, '.squaring.json');
    assert.match(found.message, /squares dir "squares"/);
    assert.match(found.message, /scanIgnore "src\/\*\*", "\.squaring\.json"/);
  } finally {
    rmRepo(viaIgnore.root);
  }

  // A repository whose universe is not empty says nothing.
  const healthy = resolve({
    'squares/a.square.md': squareFile('a'),
    'src/a.ts': 'export const a = 1;\n'
  });
  try {
    assert.deepEqual(healthy.map.universe, ['src/a.ts']);
    assert.equal(emptyWarning(healthy.map), undefined);
  } finally {
    rmRepo(healthy.root);
  }
});
