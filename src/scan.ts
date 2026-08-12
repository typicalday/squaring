// The scan universe and the `@sq` anchor scanner — SPEC §15.2, §15.4.
//
// This module knows nothing about the graph: it computes the file set, reads
// anchor markers out of it, and parses anchor target *grammar*. Resolving a
// target against declared Squares, concepts and claims is sources.ts.
// @sq graph-loader#concept/scan-universe -- git-index semantics, symlink exclusion, squares dir, scanIgnore, binary sniff
// @sq graph-loader#concept/anchor -- the marker grammar itself: token, target, note separator, ignored text

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ID_RE, type ClaimFacet } from './ids.ts';

/** One `@sq` marker found on one line of one realization file (§15.2). */
export interface Anchor {
  /** repo-relative, forward-slash path of the file carrying the anchor */
  file: string;
  /** 1-based line the anchor sits on, as found at this scan — derived, never stored */
  line: number;
  /** the target text exactly as written, before grammar parsing */
  target: string;
  /** text after the ` -- ` separator, when present */
  note?: string;
}

/** A parsed anchor target (§15.2 target grammar). `bare` still needs graph resolution. */
export type AnchorTarget =
  | { kind: 'square'; squareId: string }
  | { kind: 'concept'; squareId: string; conceptId: string }
  | { kind: 'claim'; squareId: string; facet: ClaimFacet; claimId: string }
  | { kind: 'bare'; id: string };

export interface ScanUniverseOptions {
  rootDir: string;
  /** squares directory relative to rootDir — always removed from the universe (§15.4 step 2) */
  squaresDir: string;
  /** `.squaring.json` scanIgnore globs (§4, §15.4 step 3) */
  scanIgnore?: string[];
}

export interface ScanResult {
  /** repo-relative, forward-slash, sorted — the scan universe (§15.4) */
  files: string[];
  /** universe files sniffed binary: glob-selectable, never anchor-read (§15.4 step 4) */
  binary: Set<string>;
  /** universe files whose bytes could not be read — anchors unknown, not exempt from `expect` */
  unreadable: Set<string>;
  /** every anchor found, in file order then line order */
  anchors: Anchor[];
}

const FULL_URI_RE =
  /^square:\/\/([a-z0-9][a-z0-9-]*)(?:#(commitment|contract|decision|scenario|unresolved|concept)\/([a-z0-9][a-z0-9-]*))?$/;
const SHORT_URI_RE =
  /^([a-z0-9][a-z0-9-]*)#(commitment|contract|decision|scenario|unresolved|concept)\/([a-z0-9][a-z0-9-]*)$/;

/**
 * Parse an anchor target (§15.2). Returns null for a malformed target — empty,
 * uppercase, a bad scheme, or any scheme other than `square://` — which the
 * caller reports as §11 error 10. A malformed target is never silently dropped.
 */
export function parseAnchorTarget(text: string): AnchorTarget | null {
  const full = FULL_URI_RE.exec(text);
  if (full) {
    const squareId = full[1]!;
    if (!full[2]) return { kind: 'square', squareId };
    if (full[2] === 'concept') return { kind: 'concept', squareId, conceptId: full[3]! };
    return { kind: 'claim', squareId, facet: full[2] as ClaimFacet, claimId: full[3]! };
  }
  const short = SHORT_URI_RE.exec(text);
  if (short) {
    const squareId = short[1]!;
    if (short[2] === 'concept') return { kind: 'concept', squareId, conceptId: short[3]! };
    return { kind: 'claim', squareId, facet: short[2] as ClaimFacet, claimId: short[3]! };
  }
  // Claims can never be targeted bare (§15.2) — a bare id names a Square or a
  // concept, resolved against the graph by the caller.
  if (ID_RE.test(text)) return { kind: 'bare', id: text };
  return null;
}

/**
 * The `@sq` token: the literal followed by whitespace (§15.2). End-of-line
 * counts as that whitespace — the line break is whitespace in the file — so a
 * lone `@sq` is an anchor with an empty target, which §15.2 lists explicitly
 * as a malformed anchor (§11 error 10) rather than a non-anchor. Reading it
 * the other way would make `@sq\r\n` and `@sq\n` behave differently, which no
 * determinism rule could survive.
 */
const ANCHOR_TOKEN_RE = /@sq(?=\s|$)/;
const NOTE_SEPARATOR = ' -- ';

/**
 * Read the first (and only) anchor on one line (§15.2). Returns null when the
 * line carries no `@sq` token at all.
 */
export function parseAnchorLine(rawLine: string): { target: string; note?: string } | null {
  const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
  const token = ANCHOR_TOKEN_RE.exec(line);
  if (!token) return null;

  let i = token.index + 3; // past "@sq"
  while (i < line.length && /\s/.test(line[i]!)) i++;
  let end = i;
  while (end < line.length && !/\s/.test(line[end]!)) end++;
  const target = line.slice(i, end);

  // Everything between the target and the separator is ignored text — that is
  // what lets an anchor close a block comment: a trailing `*/` after the
  // target is ignored rather than swallowed into it (§15.2).
  const rest = line.slice(end);
  const sep = rest.indexOf(NOTE_SEPARATOR);
  if (sep === -1) return { target };
  const note = rest.slice(sep + NOTE_SEPARATOR.length).trim();
  return note.length > 0 ? { target, note } : { target };
}

/** Repo-relative and free of `..` — the confinement rule for every glob (§11 error 8). */
export function isConfinedGlob(glob: string): boolean {
  return !path.isAbsolute(glob) && !glob.includes('..');
}

/**
 * Match one repo-relative path against one glob. A malformed pattern matches
 * nothing rather than throwing: an author's bad glob is a zero-match warning
 * (§11 warning 3), not a crash.
 */
export function matchesGlob(file: string, glob: string): boolean {
  try {
    return path.matchesGlob(file, glob);
  } catch {
    return false;
  }
}

/** Repo-relative universe files matched by a glob. Unconfined globs match nothing. */
export function globMatches(files: readonly string[], glob: string): string[] {
  if (!isConfinedGlob(glob)) return [];
  return files.filter((f) => matchesGlob(f, glob));
}

function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

/**
 * Canonical repo-relative POSIX spelling of a directory or glob: separators
 * converted, `.` and `..` segments collapsed, a leading `./` and any trailing
 * slashes removed. `./squares`, `squares/`, `squares/.` and `meta/../squares`
 * all normalize to `squares`, so the §15.4 prefix test and the scanIgnore
 * matcher compare like against like.
 */
function normalizeRelative(p: string): string {
  const normalized = path.posix.normalize(toPosix(p));
  return normalized.replace(/^\.\//, '').replace(/\/+$/, '');
}

/**
 * Files recorded in the git index, or null when rootDir is not a git work tree.
 * `-z` because a filename may contain anything but NUL, and git would
 * otherwise quote it.
 */
function gitIndexFiles(rootDir: string): string[] | null {
  try {
    const out = execFileSync('git', ['ls-files', '-z'], {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024
    }).toString();
    return out.split('\0').filter((f) => f.length > 0);
  } catch {
    return null;
  }
}

const WALK_SKIP_DIRS = new Set(['.git', 'node_modules']);

/** Non-git fallback: every regular file under the root, minus .git/ and node_modules/. */
function walkFiles(rootDir: string): string[] {
  const out: string[] = [];
  const visit = (relDir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(path.join(rootDir, relDir), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      // Symlinks are excluded and never followed, in both modes (§15.4 step 1):
      // a link's destination may lie outside the repository.
      if (entry.isSymbolicLink()) continue;
      const rel = relDir === '' ? entry.name : `${relDir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (WALK_SKIP_DIRS.has(entry.name)) continue;
        visit(rel);
      } else if (entry.isFile()) {
        out.push(rel);
      }
    }
  };
  visit('');
  return out;
}

/**
 * Classify a universe file for anchor reading (§15.4 step 4). `binary` means a
 * NUL byte in the first 8192 bytes — the spec's own test, and the only class
 * §15.3 exempts from `expect: annotated`. `unreadable` is kept separate on
 * purpose: a file whose bytes could not be examined has unknown anchors, and
 * calling that binary would let a permission error silently satisfy a coverage
 * expectation.
 */
function sniffFile(abs: string): 'text' | 'binary' | 'unreadable' {
  let fd: number;
  try {
    fd = fs.openSync(abs, 'r');
  } catch {
    return 'unreadable';
  }
  try {
    const buf = Buffer.alloc(8192);
    const read = fs.readSync(fd, buf, 0, 8192, 0);
    return buf.subarray(0, read).includes(0) ? 'binary' : 'text';
  } catch {
    return 'unreadable';
  } finally {
    fs.closeSync(fd);
  }
}

/** The scan universe (§15.4), without reading file contents. */
export function scanUniverse(options: ScanUniverseOptions): string[] {
  const root = path.resolve(options.rootDir);
  const indexed = gitIndexFiles(root);

  let files: string[];
  if (indexed !== null) {
    // git-index semantics: drop entries missing from the working tree, and
    // anything that is not a regular file — a symlink (lstat reports the link,
    // not its destination) or a submodule directory.
    files = indexed
      .map(toPosix)
      .filter((rel) => {
        try {
          return fs.lstatSync(path.join(root, rel)).isFile();
        } catch {
          return false;
        }
      });
  } else {
    files = walkFiles(root);
  }

  // Step 2: the squares directory is never part of the realization. The prefix
  // test compares against canonical repo-relative POSIX paths, so the dir is
  // normalized first: `./squares`, `squares/`, and `squares/.` must all remove
  // the same files as `squares`. resolveSquaresDir already returns the
  // canonical form, but scanUniverse is exported and takes the dir raw.
  const squaresDir = normalizeRelative(options.squaresDir);
  // A squares dir of `.` is the repo root: every file sits under it, so the
  // universe is empty. Any other dir removes the files beneath it.
  const squaresPrefix = squaresDir === '.' ? '' : `${squaresDir}/`;
  files = files.filter((f) => !f.startsWith(squaresPrefix));

  // Step 3: scanIgnore. Patterns are normalized the same way, so a `./docs/**`
  // entry ignores what `docs/**` ignores instead of silently matching nothing.
  const ignore = (options.scanIgnore ?? []).map(normalizeRelative);
  if (ignore.length > 0) {
    files = files.filter((f) => !ignore.some((glob) => matchesGlob(f, glob)));
  }

  return [...new Set(files)].sort();
}

/**
 * Compute the scan universe and read every anchor in it (§15.2, §15.4).
 * Binary-sniffed files stay in `files` — a glob may still select them — but are
 * never anchor-read.
 */
export function scan(options: ScanUniverseOptions): ScanResult {
  const root = path.resolve(options.rootDir);
  const files = scanUniverse(options);
  const binary = new Set<string>();
  const unreadable = new Set<string>();
  const anchors: Anchor[] = [];

  for (const rel of files) {
    const abs = path.join(root, rel);
    const kind = sniffFile(abs);
    if (kind === 'binary') {
      binary.add(rel);
      continue;
    }
    if (kind === 'unreadable') {
      unreadable.add(rel);
      continue;
    }
    let content: string;
    try {
      content = fs.readFileSync(abs, 'utf8');
    } catch {
      // Readable at sniff time, gone or locked now: anchors unknown, same class.
      unreadable.add(rel);
      continue;
    }
    if (!content.includes('@sq')) continue; // cheap reject before splitting
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const parsed = parseAnchorLine(lines[i]!);
      if (!parsed) continue;
      anchors.push({ file: rel, line: i + 1, target: parsed.target, ...(parsed.note ? { note: parsed.note } : {}) });
    }
  }

  return { files, binary, unreadable, anchors };
}
