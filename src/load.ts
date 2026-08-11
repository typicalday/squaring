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

/** Resolve the squares directory (SPEC §4): .squaring.json {"dir"} or "squares". */
export function resolveSquaresDir(rootDir: string): string {
  const configPath = path.join(rootDir, '.squaring.json');
  if (fs.existsSync(configPath)) {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as { dir?: unknown };
    if (typeof raw.dir === 'string' && raw.dir.length > 0) return raw.dir;
  }
  return 'squares';
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
  let content: string;
  try {
    content = fs.readFileSync(absFile, 'utf8');
  } catch (err) {
    diagnostics.push({ severity: 'error', file: relFile, message: `unreadable: ${String(err)}` });
    return null;
  }

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
