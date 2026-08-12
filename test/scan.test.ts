// Anchor grammar and scan universe — SPEC §15.2, §15.4.
//
// This file quotes anchor markers as data. It stays out of every real scan
// universe because the repository's `.squaring.json` scanIgnores `test/**`,
// which is exactly the escape hatch §15.2 names for scanner tests. Fixture
// repositories built here are scanned deliberately.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseAnchorLine, parseAnchorTarget, scan, scanUniverse, isConfinedGlob, globMatches } from '../src/scan.ts';
import { resolveSquaresDir } from '../src/load.ts';
import { makeRepo, rmRepo } from './helpers.ts';

/** The token, assembled at runtime so this file never contains a literal one. */
const AT = '@' + 'sq';

function universeOf(root: string, scanIgnore?: string[]): string[] {
  return scanUniverse({ rootDir: root, squaresDir: 'squares', ...(scanIgnore ? { scanIgnore } : {}) });
}

function git(root: string, ...args: string[]): void {
  execFileSync('git', args, { cwd: root, stdio: 'ignore' });
}

/** A repo with a real git index — the primary scan-universe mode (§15.4 step 1). */
function makeGitRepo(files: Record<string, string>): string {
  const root = makeRepo(files);
  git(root, 'init', '-q');
  git(root, 'add', '-A');
  return root;
}

// ---- anchor grammar (§15.2) -------------------------------------------------

test('the token is `@sq` followed by whitespace or end of line', () => {
  assert.deepEqual(parseAnchorLine(`// ${AT} orders`), { target: 'orders' });
  // End of line counts as that whitespace: a lone token is an anchor with an
  // empty target (a malformed anchor), not a non-anchor.
  assert.deepEqual(parseAnchorLine(`// ${AT}`), { target: '' });
  // Anything else glued to the token is not the token at all.
  assert.equal(parseAnchorLine(`// ${AT}uare orders`), null);
  assert.equal(parseAnchorLine(`// ${AT}-orders`), null);
  assert.equal(parseAnchorLine(`// ${AT}: orders`), null);
  assert.equal(parseAnchorLine('// nothing here'), null);
  // Backtick-quoting the token in prose is how source comments discuss it
  // without declaring an anchor.
  assert.equal(parseAnchorLine(`// write \`${AT}\` then a target`), null);
});

test('a trailing CR does not become part of the target or the note', () => {
  assert.deepEqual(parseAnchorLine(`// ${AT} orders\r`), { target: 'orders' });
  assert.deepEqual(parseAnchorLine(`// ${AT} orders -- why\r`), { target: 'orders', note: 'why' });
});

test('only the first `@sq` on a line is read', () => {
  assert.deepEqual(parseAnchorLine(`// ${AT} first ${AT} second`), { target: 'first' });
});

test('the target is the maximal run of non-whitespace after the token', () => {
  assert.deepEqual(parseAnchorLine(`# ${AT} orders#concept/line-item`), {
    target: 'orders#concept/line-item'
  });
  assert.deepEqual(parseAnchorLine(`<!-- ${AT} square://orders -->`), { target: 'square://orders' });
  // Multiple spaces after the token are skipped; the target still starts at the
  // first non-whitespace character.
  assert.deepEqual(parseAnchorLine(`// ${AT}    orders`), { target: 'orders' });
  // A tab is whitespace like any other.
  assert.deepEqual(parseAnchorLine(`//\t${AT}\torders\tignored`), { target: 'orders' });
});

test('text between the target and ` -- ` is ignored, which is what closes block comments', () => {
  assert.deepEqual(parseAnchorLine(`/* ${AT} orders */`), { target: 'orders' });
  assert.deepEqual(parseAnchorLine(`/* ${AT} orders */ -- the note`), { target: 'orders', note: 'the note' });
  assert.deepEqual(parseAnchorLine(`(* ${AT} orders *) -- ocaml too`), { target: 'orders', note: 'ocaml too' });
});

test('the note is everything after the first ` -- `, trimmed', () => {
  assert.deepEqual(parseAnchorLine(`// ${AT} orders -- placement through fulfillment`), {
    target: 'orders',
    note: 'placement through fulfillment'
  });
  // A later ` -- ` belongs to the note, not to a second separator.
  assert.deepEqual(parseAnchorLine(`// ${AT} orders -- a -- b`), { target: 'orders', note: 'a -- b' });
  // The separator is exactly ` -- `: a bare `--` with no surrounding spaces is
  // ignored text, not a separator.
  assert.deepEqual(parseAnchorLine(`// ${AT} orders --nope`), { target: 'orders' });
  // An empty note is no note at all.
  assert.deepEqual(parseAnchorLine(`// ${AT} orders -- `), { target: 'orders' });
  assert.deepEqual(parseAnchorLine(`// ${AT} orders --   `), { target: 'orders' });
});

test('the separator may not eat into the target', () => {
  // ` -- ` immediately after the token: the target is `--`, which is malformed,
  // rather than an empty target with a note.
  assert.deepEqual(parseAnchorLine(`// ${AT} -- just a note`), { target: '--' });
  assert.equal(parseAnchorTarget('--'), null);
});

test('the scanner is oblivious to the host language', () => {
  const lines = [
    `// ${AT} orders`, // C-family
    `# ${AT} orders`, // shell, Python, YAML
    `-- ${AT} orders`, // SQL, Lua
    `; ${AT} orders`, // Lisp, ini
    `% ${AT} orders`, // TeX, Erlang
    `<!-- ${AT} orders -->`, // HTML, Markdown
    `      ${AT} orders`, // bare, no comment syntax at all
    `const x = 1; // ${AT} orders` // trailing on a code line
  ];
  for (const line of lines) {
    assert.deepEqual(parseAnchorLine(line), { target: 'orders' }, `failed on: ${line}`);
  }
});

// ---- target grammar (§15.2) -------------------------------------------------

test('anchor targets parse as full URI, short URI or bare id', () => {
  assert.deepEqual(parseAnchorTarget('square://orders'), { kind: 'square', squareId: 'orders' });
  assert.deepEqual(parseAnchorTarget('square://orders#concept/line-item'), {
    kind: 'concept',
    squareId: 'orders',
    conceptId: 'line-item'
  });
  assert.deepEqual(parseAnchorTarget('square://orders#commitment/no-x'), {
    kind: 'claim',
    squareId: 'orders',
    facet: 'commitment',
    claimId: 'no-x'
  });
  assert.deepEqual(parseAnchorTarget('orders#concept/line-item'), {
    kind: 'concept',
    squareId: 'orders',
    conceptId: 'line-item'
  });
  assert.deepEqual(parseAnchorTarget('orders#scenario/happy-path'), {
    kind: 'claim',
    squareId: 'orders',
    facet: 'scenario',
    claimId: 'happy-path'
  });
  assert.deepEqual(parseAnchorTarget('orders'), { kind: 'bare', id: 'orders' });
});

test('malformed anchor targets parse to null rather than being dropped', () => {
  for (const bad of [
    '',
    'Orders',
    'square://Orders',
    'square:/orders',
    'change://add-refunds',
    'external://stripe',
    'orders#bogus/x',
    'orders#concept/',
    'orders#concept/Line-Item',
    '#concept/line-item',
    'orders#concept/a/b'
  ]) {
    assert.equal(parseAnchorTarget(bad), null, `expected malformed: ${JSON.stringify(bad)}`);
  }
});

test('a claim can never be named bare', () => {
  // `no-unpaid-fulfillment` is a claim id, and a bare target resolves only
  // against Squares and concepts — so it parses as a bare id and dangles later,
  // never as a claim.
  assert.deepEqual(parseAnchorTarget('no-unpaid-fulfillment'), {
    kind: 'bare',
    id: 'no-unpaid-fulfillment'
  });
});

// ---- glob confinement (§11 error 8) ----------------------------------------

test('confinement rejects absolute globs and any `..`', () => {
  for (const good of ['src/**', 'src/*.ts', 'a/b/c', 'package.json']) {
    assert.equal(isConfinedGlob(good), true, good);
  }
  for (const bad of ['/etc/**', '../outside/**', 'src/../../etc', 'a/../b']) {
    assert.equal(isConfinedGlob(bad), false, bad);
  }
  // An unconfined glob matches nothing rather than reaching outside.
  assert.deepEqual(globMatches(['src/a.ts'], '/etc/**'), []);
  // A syntactically broken pattern matches nothing rather than throwing.
  assert.deepEqual(globMatches(['src/a.ts'], 'src/{a.ts'), []);
});

// ---- scan universe (§15.4) --------------------------------------------------

test('the universe is the git index when the root is a work tree', () => {
  const root = makeGitRepo({
    'squares/a.square.md': 'x\n',
    'src/tracked.ts': 'export const a = 1;\n'
  });
  try {
    fs.writeFileSync(path.join(root, 'src/untracked.ts'), 'export const b = 2;\n');
    // Untracked files are not in the index, so they are not in the universe.
    assert.deepEqual(universeOf(root), ['src/tracked.ts']);
  } finally {
    rmRepo(root);
  }
});

test('index entries missing from the working tree are dropped', () => {
  const root = makeGitRepo({
    'squares/a.square.md': 'x\n',
    'src/kept.ts': 'export const a = 1;\n',
    'src/deleted.ts': 'export const b = 2;\n'
  });
  try {
    fs.rmSync(path.join(root, 'src/deleted.ts'));
    assert.deepEqual(universeOf(root), ['src/kept.ts']);
  } finally {
    rmRepo(root);
  }
});

test('a non-git root falls back to a walk that skips .git/ and node_modules/', () => {
  const root = makeRepo({
    'squares/a.square.md': 'x\n',
    'src/a.ts': 'export const a = 1;\n',
    'node_modules/dep/index.js': 'module.exports = 1;\n',
    '.git/config': '[core]\n'
  });
  try {
    assert.deepEqual(universeOf(root), ['src/a.ts']);
  } finally {
    rmRepo(root);
  }
});

test('symlinks are excluded and never followed, in both modes', () => {
  const outside = makeRepo({ 'secret.ts': 'export const secret = 1;\n' });

  const walked = makeRepo({ 'squares/a.square.md': 'x\n', 'src/a.ts': 'export const a = 1;\n' });
  try {
    fs.symlinkSync(path.join(outside, 'secret.ts'), path.join(walked, 'src/link.ts'), 'file');
    fs.symlinkSync(outside, path.join(walked, 'src/linkdir'), 'dir');
    assert.deepEqual(universeOf(walked), ['src/a.ts']);
  } finally {
    rmRepo(walked);
  }

  const indexed = makeRepo({ 'squares/a.square.md': 'x\n', 'src/a.ts': 'export const a = 1;\n' });
  try {
    fs.symlinkSync(path.join(outside, 'secret.ts'), path.join(indexed, 'src/link.ts'), 'file');
    git(indexed, 'init', '-q');
    git(indexed, 'add', '-A');
    // git records the symlink in its index; the universe still drops it,
    // because lstat reports the link rather than a regular file.
    assert.deepEqual(universeOf(indexed), ['src/a.ts']);
  } finally {
    rmRepo(indexed);
    rmRepo(outside);
  }
});

test('the squares directory is always removed, wherever it is configured', () => {
  const root = makeGitRepo({
    'squares/a.square.md': 'x\n',
    'squares/changes/c.change.md': 'x\n',
    'squares-adjacent/keep.ts': 'export const a = 1;\n',
    'src/a.ts': 'export const a = 1;\n'
  });
  try {
    // The prefix match is on the directory, not on the name: `squares-adjacent`
    // survives.
    assert.deepEqual(universeOf(root), ['squares-adjacent/keep.ts', 'src/a.ts']);
  } finally {
    rmRepo(root);
  }

  const relocated = makeGitRepo({
    '.squaring.json': '{ "dir": "meta" }\n',
    'meta/a.square.md': 'x\n',
    'src/a.ts': 'export const a = 1;\n'
  });
  try {
    assert.deepEqual(
      scanUniverse({ rootDir: relocated, squaresDir: 'meta' }),
      ['.squaring.json', 'src/a.ts']
    );
  } finally {
    rmRepo(relocated);
  }
});

test('every spelling of the squares dir removes the same files', () => {
  // §15.4 step 2 removes the squares directory with a path-prefix test, so a
  // non-canonical `dir` in .squaring.json must not let `.square.md` files back
  // into the universe as their own realization. Both halves are checked: the
  // raw string handed straight to scanUniverse, and the string as it actually
  // arrives there in production — through resolveSquaresDir.
  const spellings = ['meta', './meta', 'meta/', 'meta/.', 'other/../meta'];
  for (const spelling of spellings) {
    const root = makeGitRepo({
      '.squaring.json': `${JSON.stringify({ dir: spelling })}\n`,
      'meta/a.square.md': 'x\n',
      'meta/changes/c.change.md': 'x\n',
      'other/keep.ts': 'export const a = 1;\n',
      'src/a.ts': 'export const a = 1;\n'
    });
    try {
      const expected = ['.squaring.json', 'other/keep.ts', 'src/a.ts'];
      assert.deepEqual(
        scanUniverse({ rootDir: root, squaresDir: spelling }),
        expected,
        `raw squaresDir ${JSON.stringify(spelling)}`
      );
      assert.deepEqual(
        scanUniverse({ rootDir: root, squaresDir: resolveSquaresDir(root) }),
        expected,
        `resolveSquaresDir for ${JSON.stringify(spelling)}`
      );
    } finally {
      rmRepo(root);
    }
  }
});

test('scanIgnore removes files from the universe', () => {
  const root = makeGitRepo({
    'squares/a.square.md': 'x\n',
    'docs/SPEC.md': 'prose\n',
    'docs/deep/more.md': 'prose\n',
    'README.md': 'prose\n',
    'src/a.ts': 'export const a = 1;\n'
  });
  try {
    assert.deepEqual(universeOf(root), ['README.md', 'docs/SPEC.md', 'docs/deep/more.md', 'src/a.ts']);
    assert.deepEqual(universeOf(root, ['docs/**', 'README.md']), ['src/a.ts']);
  } finally {
    rmRepo(root);
  }
});

test('the universe is sorted and free of duplicates', () => {
  const root = makeGitRepo({
    'squares/a.square.md': 'x\n',
    'z.ts': '1\n',
    'a.ts': '1\n',
    'm/n.ts': '1\n'
  });
  try {
    const files = universeOf(root);
    assert.deepEqual(files, [...files].sort());
    assert.deepEqual(files, ['a.ts', 'm/n.ts', 'z.ts']);
  } finally {
    rmRepo(root);
  }
});

// ---- binary sniff (§15.4 step 4) -------------------------------------------

test('a NUL in the first 8192 bytes makes a file binary: selectable, never anchor-read', () => {
  const root = makeGitRepo({ 'squares/a.square.md': 'x\n' });
  try {
    fs.mkdirSync(path.join(root, 'src'));
    // A file that looks like text and carries a real anchor, but has one NUL
    // byte early on. This is the failure mode that silently unhooked a source
    // module during this repository's own migration.
    fs.writeFileSync(
      path.join(root, 'src/withnul.ts'),
      Buffer.concat([
        Buffer.from(`// ${AT} orders\nconst sep = "`, 'utf8'),
        Buffer.from([0]),
        Buffer.from('";\n', 'utf8')
      ])
    );
    fs.writeFileSync(path.join(root, 'src/clean.ts'), `// ${AT} orders\n`);
    git(root, 'add', '-A');

    const result = scan({ rootDir: root, squaresDir: 'squares' });
    assert.deepEqual(result.files, ['src/clean.ts', 'src/withnul.ts'], 'binaries stay in the universe');
    assert.deepEqual([...result.binary], ['src/withnul.ts']);
    assert.deepEqual(
      result.anchors.map((a) => a.file),
      ['src/clean.ts'],
      'the binary file is never anchor-read'
    );
  } finally {
    rmRepo(root);
  }
});

test('a NUL after the first 8192 bytes leaves the file text', () => {
  const root = makeGitRepo({ 'squares/a.square.md': 'x\n' });
  try {
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(
      path.join(root, 'src/late.ts'),
      Buffer.concat([
        Buffer.from(`// ${AT} orders\n`, 'utf8'),
        Buffer.from('/'.repeat(9000) + '\n', 'utf8'),
        Buffer.from([0]),
        Buffer.from('\n', 'utf8')
      ])
    );
    git(root, 'add', '-A');
    const result = scan({ rootDir: root, squaresDir: 'squares' });
    assert.deepEqual([...result.binary], []);
    assert.deepEqual(result.anchors.map((a) => a.target), ['orders']);
  } finally {
    rmRepo(root);
  }
});

// ---- reading anchors out of the universe ------------------------------------

test('anchors are reported in file order then line order, with their notes', () => {
  const root = makeGitRepo({
    'squares/a.square.md': 'x\n',
    'src/b.ts': `line one\n// ${AT} orders -- second line\n`,
    'src/a.ts': `// ${AT} orders#concept/order\nline two\n// ${AT} orders#commitment/no-x -- third line\n`
  });
  try {
    const result = scan({ rootDir: root, squaresDir: 'squares' });
    assert.deepEqual(result.anchors, [
      { file: 'src/a.ts', line: 1, target: 'orders#concept/order' },
      { file: 'src/a.ts', line: 3, target: 'orders#commitment/no-x', note: 'third line' },
      { file: 'src/b.ts', line: 2, target: 'orders', note: 'second line' }
    ]);
  } finally {
    rmRepo(root);
  }
});

test('an anchor binds its file; the line is derived, and moving the anchor changes only the line', () => {
  const root = makeGitRepo({ 'squares/a.square.md': 'x\n', 'src/a.ts': `// ${AT} orders\ncode\n` });
  try {
    const before = scan({ rootDir: root, squaresDir: 'squares' }).anchors;
    assert.deepEqual(before, [{ file: 'src/a.ts', line: 1, target: 'orders' }]);

    fs.writeFileSync(path.join(root, 'src/a.ts'), `code\ncode\n// ${AT} orders\n`);
    const after = scan({ rootDir: root, squaresDir: 'squares' }).anchors;
    assert.deepEqual(after, [{ file: 'src/a.ts', line: 3, target: 'orders' }]);
  } finally {
    rmRepo(root);
  }
});
