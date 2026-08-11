// Templates for new Squares and Changes — SPEC §13. Scaffolding exists only
// to eliminate blank-page schema errors; authoring stays in ordinary file
// edits.

import fs from 'node:fs';
import path from 'node:path';
import { ID_RE } from './ids.ts';
import { resolveSquaresDir, refuseSymlinkTarget } from './load.ts';
import { CHANGE_TYPES } from './schema.ts';

function titleCase(id: string): string {
  return id
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function squareTemplate(id: string, name?: string): string {
  return `---
apiVersion: squaring/v0
kind: Square
id: ${id}
name: ${name ?? titleCase(id)}
# archetype: capability   # capability | domain | platform | boundary | policy
# partOf: <parent-square-id>
purpose: >
  TODO: one to three sentences on why this exists.
nonGoals:
  - "TODO: what is explicitly outside this Square's responsibility"
# owns:
#   concepts: []
#   state: []
# contracts:
#   provides:
#     - id: example
#       statement: TODO
#   consumes:
#     - id: example
#       from: square://other
#       statement: TODO
commitments:
  - id: example-invariant
    kind: invariant          # invariant | boundary | constraint | preference | assumption
    strength: must           # must | must-not | should | should-not
    statement: >
      TODO: what must remain true.
    # evidenceClass: test    # static-analysis | schema | test | runtime | model-judgment | none
# decisions:
#   - id: example-decision
#     date: YYYY-MM-DD
#     choice: TODO
#     rationale: TODO
# unresolved:
#   - id: example-question
#     question: TODO?
authority:
  owns: [invariants, boundaries]
  constrains: []
  delegates: [algorithms, file-structure]
# bindings:
#   - src/${id}/**
---

Free-form notes, rationale, and examples go here.
`;
}

export function changeTemplate(id: string, name?: string, type: string = 'evolution'): string {
  return `---
apiVersion: squaring/v0
kind: Change
id: ${id}
name: ${name ?? titleCase(id)}
type: ${type}                # evolution | refactor | repair | adoption
intent: >
  TODO: what this Change is trying to accomplish and why.
targets:
  - square://todo          # replace with the real target Square(s)
semanticDiff:${
    type === 'refactor' || type === 'repair'
      ? ' []            # must stay empty for refactor/repair'
      : `
  - "TODO: name each meaning change (empty list = no meaning changes)"`
  }
phase: draft                 # draft | active | blocked | done | abandoned
# constraints:
#   - TODO task-local constraint
# proposedDecisions:
#   - id: example
#     choice: TODO
#     rationale: TODO
status:
  done: []
  inProgress: []
  blocked: []
  next:
    - "TODO: first step"
---

Working notes for this Change go here.
`;
}

export interface ScaffoldResult {
  /** created file, relative to rootDir */
  file: string;
}

export function scaffoldSquare(rootDir: string, id: string, name?: string): ScaffoldResult {
  if (!ID_RE.test(id)) throw new Error(`invalid id "${id}" — expected [a-z0-9][a-z0-9-]*`);
  const dir = resolveSquaresDir(rootDir);
  const rel = path.join(dir, `${id}.square.md`);
  const abs = path.join(rootDir, rel);
  // The squares dir is realpath-validated by resolveSquaresDir; guard the leaf
  // so a pre-placed (possibly dangling) symlink can't redirect the write out.
  refuseSymlinkTarget(abs, rel);
  if (fs.existsSync(abs)) throw new Error(`${rel} already exists`);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, squareTemplate(id, name));
  return { file: rel };
}

export function scaffoldChange(rootDir: string, id: string, name?: string, type = 'evolution'): ScaffoldResult {
  if (!ID_RE.test(id)) throw new Error(`invalid id "${id}" — expected [a-z0-9][a-z0-9-]*`);
  if (!(CHANGE_TYPES as readonly string[]).includes(type)) {
    throw new Error(`invalid type "${type}" — expected ${CHANGE_TYPES.join(' | ')}`);
  }
  const dir = resolveSquaresDir(rootDir);
  const rel = path.join(dir, 'changes', `${id}.change.md`);
  const abs = path.join(rootDir, rel);
  // resolveSquaresDir only validates the top-level squares dir. Guard the
  // nested changes/ directory (a symlinked changes/ would let writeFileSync
  // write straight through it) and the leaf file (a pre-placed dangling symlink
  // would be followed on create), both of which it never inspects.
  refuseSymlinkTarget(path.dirname(abs), path.join(dir, 'changes'));
  refuseSymlinkTarget(abs, rel);
  if (fs.existsSync(abs)) throw new Error(`${rel} already exists`);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, changeTemplate(id, name, type));
  return { file: rel };
}
