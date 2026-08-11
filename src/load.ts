// Graph loading — SPEC §4. Reads squares/*.square.md and squares/changes/
// *.change.md, parses frontmatter, validates each document against the
// schema, and returns a Graph plus load-time diagnostics. Loading never
// writes to the filesystem.

import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import * as z from 'zod';
import { SquareSchema, ChangeSchema, type Square, type Change } from './schema.ts';

export interface Diagnostic {
  severity: 'error' | 'warning';
  file?: string;
  message: string;
}

export interface SquareDoc {
  meta: Square;
  body: string;
  /** path relative to the repo root */
  file: string;
}

export interface ChangeDoc {
  meta: Change;
  body: string;
  file: string;
}

export interface Graph {
  /** absolute repo root the graph was loaded from */
  rootDir: string;
  /** squares directory, relative to rootDir (default "squares") */
  squaresDir: string;
  squares: Map<string, SquareDoc>;
  changes: Map<string, ChangeDoc>;
  /** load-time (schema/parse) diagnostics; integrity checks live in validate.ts */
  diagnostics: Diagnostic[];
}

/**
 * True if `p` exists as any directory entry — including a broken or circular
 * symlink. Unlike fs.existsSync, which swallows every stat error (including
 * ELOOP from a symlink cycle) into `false`, this reports existence from lstat,
 * which does not follow the final component.
 */
function lstatExists(p: string): boolean {
  try {
    fs.lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the squares directory (SPEC §4): .squaring.json {"dir"} or "squares".
 *
 * Security: both .squaring.json and the directory tree may be attacker-authored
 * — a single hostile `git clone` ships the config and any symlinks together.
 * The resolved squares directory must therefore stay inside the repository
 * (1) lexically, which blocks `../` escapes, and (2) after symlink resolution,
 * which blocks a directory that is lexically inside the repo but is (or sits
 * under) a symlink pointing out. Every caller routes through here: loadGraph
 * (reads), scaffoldSquare/scaffoldChange and initRepo (writes).
 */
export function resolveSquaresDir(rootDir: string): string {
  let dir = 'squares';
  const configPath = path.join(rootDir, '.squaring.json');
  if (fs.existsSync(configPath)) {
    let raw: { dir?: unknown };
    try {
      raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as { dir?: unknown };
    } catch (err) {
      throw new Error(`.squaring.json: invalid JSON (${err instanceof Error ? err.message : String(err)})`);
    }
    if (typeof raw.dir === 'string' && raw.dir.length > 0) dir = raw.dir;
  }

  const root = path.resolve(rootDir);
  const resolved = path.resolve(rootDir, dir);
  // (1) Lexical containment — fires even when the path does not exist yet.
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`squares dir must resolve inside the repository (got ${JSON.stringify(dir)})`);
  }
  // (2) Symlink containment — compare canonical (realpath) paths. Walk to the
  // nearest existing ancestor first, because the squares dir need not exist yet
  // (`squaring init` on a fresh repo). realpath on both sides also normalizes
  // macOS's /var -> /private/var symlink so legitimate temp repos still pass.
  let rootReal: string;
  try {
    rootReal = fs.realpathSync(root);
  } catch {
    rootReal = root;
  }
  let probe = resolved;
  // lstatExists (not fs.existsSync) so a broken or circular symlink counts as
  // an existing entry and the walk stops on it, instead of stepping over it and
  // validating some innocent ancestor.
  while (probe !== path.dirname(probe) && !lstatExists(probe)) probe = path.dirname(probe);
  let probeReal: string;
  try {
    probeReal = fs.realpathSync(probe);
  } catch {
    // The nearest existing entry could not be canonicalized — a broken or
    // circular symlink somewhere in the squares path. Cannot prove containment,
    // so reject rather than return a dir we never validated.
    throw new Error(`squares dir could not be resolved — broken or circular symlink (got ${JSON.stringify(dir)})`);
  }
  if (probeReal !== rootReal && !probeReal.startsWith(rootReal + path.sep)) {
    throw new Error(`squares dir resolves outside the repository via a symlink (got ${JSON.stringify(dir)})`);
  }
  return dir;
}

/**
 * Refuse a write target that already exists as a symlink. resolveSquaresDir
 * realpath-validates the top-level squares directory, but every nested write
 * target below it — the changes/ subdirectory and each leaf file a command
 * creates (`.square.md`, `.change.md`, PROTOCOL.md, .mcp.json) — is
 * reconstructed independently by the write paths (scaffold.ts, init.ts) and
 * needs this same guard. Otherwise a hostile clone can commit a symlink at one
 * of those paths and redirect the write outside the repository: an ordinary
 * `fs.writeFileSync` follows a symlink, and `fs.existsSync` reports `false` for
 * a *dangling* symlink, so the "already exists" check never fires. lstat sees
 * the link itself. No-op when the path does not exist — the normal case for a
 * file about to be created. The read path guards the same boundaries with
 * diagnostics in loadGraph/loadDoc; this is the write-path twin.
 */
export function refuseSymlinkTarget(absPath: string, label: string): void {
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(absPath);
  } catch {
    return; // does not exist yet — safe to create
  }
  if (stat.isSymbolicLink()) {
    throw new Error(
      `${label} is a symlink; refusing to write through it ` +
        `(Square/Change paths must be regular files and directories inside the repository)`
    );
  }
}

interface Frontmatter {
  meta: unknown;
  body: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function splitFrontmatter(content: string): Frontmatter | null {
  const m = FRONTMATTER_RE.exec(content);
  if (!m) return null;
  return { meta: parseYaml(m[1]!), body: m[2] ?? '' };
}

function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => (issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message))
    .join('; ');
}

function loadDoc<T>(
  absFile: string,
  relFile: string,
  schema: z.ZodType<T>,
  diagnostics: Diagnostic[]
): { meta: T; body: string } | null {
  // Security (SPEC §4): resolveSquaresDir validates the squares *directory* is
  // contained in the repo, but not the individual entries inside it. An entry
  // that is itself a symlink can point at a file outside the repo; following it
  // would disclose foreign content. Square/Change documents are always regular
  // files committed in the repo, so reject any per-file symlink outright.
  try {
    if (fs.lstatSync(absFile).isSymbolicLink()) {
      diagnostics.push({
        severity: 'error',
        file: relFile,
        message: 'is a symlink; Square/Change files must be regular files inside the repository'
      });
      return null;
    }
  } catch (err) {
    diagnostics.push({ severity: 'error', file: relFile, message: `unreadable: ${String(err)}` });
    return null;
  }

  let content: string;
  try {
    content = fs.readFileSync(absFile, 'utf8');
  } catch (err) {
    diagnostics.push({ severity: 'error', file: relFile, message: `unreadable: ${String(err)}` });
    return null;
  }
  // Strip a UTF-8 BOM (common from Windows editors) so FRONTMATTER_RE's
  // leading `---` anchor still matches.
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);

  let fm: Frontmatter | null;
  try {
    fm = splitFrontmatter(content);
  } catch (err) {
    diagnostics.push({ severity: 'error', file: relFile, message: `invalid YAML: ${String(err)}` });
    return null;
  }
  if (!fm) {
    diagnostics.push({
      severity: 'error',
      file: relFile,
      message: 'missing YAML frontmatter block (--- ... ---) at the top of the file'
    });
    return null;
  }

  const parsed = schema.safeParse(fm.meta);
  if (!parsed.success) {
    diagnostics.push({ severity: 'error', file: relFile, message: formatZodIssues(parsed.error) });
    return null;
  }
  return { meta: parsed.data, body: fm.body };
}

function stem(file: string, suffix: string): string {
  return path.basename(file).slice(0, -suffix.length);
}

export function loadGraph(rootDir: string): Graph {
  const root = path.resolve(rootDir);
  const squaresDir = resolveSquaresDir(root);
  const absSquares = path.join(root, squaresDir);
  const absChanges = path.join(absSquares, 'changes');

  const graph: Graph = {
    rootDir: root,
    squaresDir,
    squares: new Map(),
    changes: new Map(),
    diagnostics: []
  };

  if (!fs.existsSync(absSquares)) {
    graph.diagnostics.push({
      severity: 'error',
      message: `squares directory not found: ${squaresDir}/ (run \`squaring init\`)`
    });
    return graph;
  }

  const squareFiles = fs
    .readdirSync(absSquares)
    .filter((f) => f.endsWith('.square.md'))
    .sort();

  for (const f of squareFiles) {
    const rel = path.join(squaresDir, f);
    const doc = loadDoc(path.join(absSquares, f), rel, SquareSchema, graph.diagnostics);
    if (!doc) continue;

    if (doc.meta.id !== stem(f, '.square.md')) {
      graph.diagnostics.push({
        severity: 'error',
        file: rel,
        message: `id "${doc.meta.id}" does not match filename stem "${stem(f, '.square.md')}" (SPEC §4)`
      });
      continue;
    }
    if (graph.squares.has(doc.meta.id)) {
      graph.diagnostics.push({
        severity: 'error',
        file: rel,
        message: `duplicate Square id "${doc.meta.id}"`
      });
      continue;
    }
    graph.squares.set(doc.meta.id, { meta: doc.meta, body: doc.body, file: rel });
  }

  if (fs.existsSync(absChanges)) {
    // The per-file symlink guard in loadDoc cannot catch a `changes` directory
    // that is itself a symlink (lstat follows intermediate path components), so
    // reject an escaping changes/ dir here before reading anything through it.
    if (fs.lstatSync(absChanges).isSymbolicLink()) {
      graph.diagnostics.push({
        severity: 'error',
        file: path.join(squaresDir, 'changes'),
        message: 'changes/ is a symlink; it must be a regular directory inside the repository'
      });
      return graph;
    }

    const changeFiles = fs
      .readdirSync(absChanges)
      .filter((f) => f.endsWith('.change.md'))
      .sort();

    for (const f of changeFiles) {
      const rel = path.join(squaresDir, 'changes', f);
      const doc = loadDoc(path.join(absChanges, f), rel, ChangeSchema, graph.diagnostics);
      if (!doc) continue;

      if (doc.meta.id !== stem(f, '.change.md')) {
        graph.diagnostics.push({
          severity: 'error',
          file: rel,
          message: `id "${doc.meta.id}" does not match filename stem "${stem(f, '.change.md')}" (SPEC §4)`
        });
        continue;
      }
      if (graph.changes.has(doc.meta.id)) {
        graph.diagnostics.push({
          severity: 'error',
          file: rel,
          message: `duplicate Change id "${doc.meta.id}"`
        });
        continue;
      }
      graph.changes.set(doc.meta.id, { meta: doc.meta, body: doc.body, file: rel });
    }
  }

  return graph;
}

/** Changes whose phase is neither done nor abandoned. */
export function activeChanges(graph: Graph): ChangeDoc[] {
  return [...graph.changes.values()]
    .filter((c) => c.meta.phase !== 'done' && c.meta.phase !== 'abandoned')
    .sort((a, b) => a.meta.id.localeCompare(b.meta.id));
}

/** Active changes that target the given square id. */
export function changesTargeting(graph: Graph, squareId: string): ChangeDoc[] {
  const uri = `square://${squareId}`;
  return activeChanges(graph).filter((c) => c.meta.targets.includes(uri));
}
