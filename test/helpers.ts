// Shared test helpers: fixture paths, throwaway repos, and a minimal valid
// Square file builder for error-case tests.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadGraph, type Diagnostic } from '../src/load.ts';
import { validateGraph } from '../src/validate.ts';

export const DEMO = path.join(import.meta.dirname, 'fixtures', 'demo');

/** Write a throwaway repo from a { relPath: content } map. Caller removes it with rmRepo. */
export function makeRepo(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'squaring-test-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return root;
}

export function rmRepo(root: string): void {
  fs.rmSync(root, { recursive: true, force: true });
}

/** A schema-valid Square file with no warnings; extraYaml is appended as top-level keys. */
export function squareFile(id: string, extraYaml = ''): string {
  return `---
apiVersion: squaring/v0
kind: Square
id: ${id}
name: Square ${id}
purpose: Test square ${id}.
nonGoals:
  - nothing in particular
commitments:
  - id: base
    kind: invariant
    strength: must
    statement: stays true
authority:
  owns: [invariants]
${extraYaml}---
`;
}

/** Load + validate a throwaway repo and clean it up; returns all diagnostics. */
export function diagnose(files: Record<string, string>): Diagnostic[] {
  const root = makeRepo(files);
  try {
    return validateGraph(loadGraph(root));
  } finally {
    rmRepo(root);
  }
}

export function messagesOf(diagnostics: Diagnostic[], severity: 'error' | 'warning'): string[] {
  return diagnostics.filter((d) => d.severity === severity).map((d) => d.message);
}

export function assertHas(diagnostics: Diagnostic[], severity: 'error' | 'warning', re: RegExp): void {
  const messages = messagesOf(diagnostics, severity);
  if (!messages.some((m) => re.test(m))) {
    throw new Error(`expected a ${severity} matching ${re}\ngot:\n${messages.join('\n') || '(none)'}`);
  }
}
