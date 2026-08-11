// Context Pack compiler — SPEC §12. Deterministic: identical graph and
// arguments produce byte-identical output. Edges first — non-goals,
// boundaries, and commitments come before anything an LLM could plausibly
// regenerate on its own.

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { claimUri, parseSquareUri, parseChangeUri } from './ids.ts';
import { changesTargeting, type ChangeDoc, type Graph, type SquareDoc } from './load.ts';
import type { Commitment } from './schema.ts';

interface SuspensionNote {
  changeId: string;
  reason: string;
  until: string;
}

/** Suspensions declared by non-done Changes, keyed by claim URI. */
function activeSuspensions(graph: Graph): Map<string, SuspensionNote[]> {
  const map = new Map<string, SuspensionNote[]>();
  for (const change of [...graph.changes.values()].sort((a, b) => a.meta.id.localeCompare(b.meta.id))) {
    if (change.meta.phase === 'done' || change.meta.phase === 'abandoned') continue;
    for (const s of change.meta.suspensions ?? []) {
      const list = map.get(s.claim) ?? [];
      list.push({ changeId: change.meta.id, reason: s.reason, until: s.until });
      map.set(s.claim, list);
    }
  }
  return map;
}

/** Policy commitments from archetype:policy Squares that apply to `squareId`. */
function applicablePolicies(
  graph: Graph,
  squareId: string
): Array<{ policy: SquareDoc; commitment: Commitment }> {
  const uri = `square://${squareId}`;
  const out: Array<{ policy: SquareDoc; commitment: Commitment }> = [];
  const policies = [...graph.squares.values()]
    .filter((s) => s.meta.archetype === 'policy' && s.meta.id !== squareId)
    .sort((a, b) => a.meta.id.localeCompare(b.meta.id));
  for (const policy of policies) {
    for (const commitment of policy.meta.commitments ?? []) {
      if (commitment.appliesTo === '*' || (Array.isArray(commitment.appliesTo) && commitment.appliesTo.includes(uri))) {
        out.push({ policy, commitment });
      }
    }
  }
  return out;
}

function partOfChain(graph: Graph, square: SquareDoc): string[] {
  const chain: string[] = [];
  let current: string | undefined = square.meta.partOf;
  const seen = new Set<string>();
  while (current !== undefined && !seen.has(current)) {
    seen.add(current);
    chain.unshift(current);
    current = graph.squares.get(current)?.meta.partOf;
  }
  return chain;
}

function childrenOf(graph: Graph, squareId: string): SquareDoc[] {
  return [...graph.squares.values()]
    .filter((s) => s.meta.partOf === squareId)
    .sort((a, b) => a.meta.id.localeCompare(b.meta.id));
}

function consumersOf(graph: Graph, squareId: string, contractId: string): SquareDoc[] {
  const uri = `square://${squareId}`;
  return [...graph.squares.values()]
    .filter((s) => (s.meta.contracts?.consumes ?? []).some((c) => c.from === uri && c.id === contractId))
    .sort((a, b) => a.meta.id.localeCompare(b.meta.id));
}

function commitmentLine(c: Commitment, suspensions: Map<string, SuspensionNote[]>, squareId: string): string {
  const evidence = c.evidenceClass && c.evidenceClass !== 'none' ? `, evidence: ${c.evidenceClass}` : '';
  let line = `- **[${c.kind}/${c.strength}]** ${c.statement.trim()} _(${c.id}${evidence})_`;
  for (const s of suspensions.get(claimUri(squareId, 'commitment', c.id)) ?? []) {
    line += `\n  - ⚠ SUSPENDED by change://${s.changeId} — ${s.reason.trim()} Until: ${s.until.trim()}`;
  }
  return line;
}

function isBoundaryLike(c: Commitment): boolean {
  return c.kind === 'boundary' || c.strength === 'must-not' || c.strength === 'should-not';
}

function renderChange(change: ChangeDoc, heading: string): string[] {
  const meta = change.meta;
  const lines: string[] = [heading];
  lines.push(`- **Intent:** ${meta.intent.trim()}`);
  lines.push(`- **Type:** ${meta.type} · **Phase:** ${meta.phase}`);
  lines.push(
    meta.semanticDiff.length === 0
      ? '- **Semantic diff:** (empty — no meaning changes)'
      : `- **Semantic diff:**\n${meta.semanticDiff.map((d) => `  - ${d}`).join('\n')}`
  );
  for (const c of meta.constraints ?? []) lines.push(`- **Constraint:** ${c}`);
  for (const d of meta.proposedDecisions ?? []) {
    lines.push(`- **Proposed decision (${d.id}):** ${d.choice}${d.rationale ? ` — ${d.rationale.trim()}` : ''}`);
  }
  const status = meta.status;
  if (status) {
    if (status.done?.length) lines.push(`- **Done:** ${status.done.join(' · ')}`);
    if (status.inProgress?.length) lines.push(`- **In progress:** ${status.inProgress.join(' · ')}`);
    for (const b of status.blocked ?? []) {
      lines.push(`- **Blocked:** ${b.reason}${b.affects?.length ? ` (affects: ${b.affects.join(', ')})` : ''}`);
    }
    if (status.next?.length) lines.push(`- **Next:** ${status.next.join(' · ')}`);
  }
  for (const s of meta.suspensions ?? []) {
    lines.push(`- **Suspension:** ${s.claim} — ${s.reason} Until: ${s.until}`);
  }
  return lines;
}

function gitRevision(rootDir: string): string | null {
  try {
    const rev = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: rootDir, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    return rev.length > 0 ? rev : null;
  } catch {
    return null;
  }
}

function stamp(graph: Graph): string {
  const rev = gitRevision(graph.rootDir);
  return `_Compiled from ${graph.squares.size} Squares, ${graph.changes.size} Changes${rev ? ` · code revision git:${rev}` : ''}._`;
}

export function compileSquarePack(graph: Graph, squareId: string, options?: { abbreviated?: boolean }): string {
  const square = graph.squares.get(squareId);
  if (!square) throw new Error(`Square "${squareId}" not found`);
  const meta = square.meta;
  const abbreviated = options?.abbreviated ?? false;
  const suspensions = activeSuspensions(graph);
  const lines: string[] = [];

  if (!abbreviated) {
    lines.push(`# Context Pack — ${meta.name} (square://${meta.id})`);
    lines.push('');
    lines.push('> Compiled read model; disposable. Regenerate rather than edit (rule A9).');
  } else {
    lines.push(`## Target: ${meta.name} (square://${meta.id})`);
  }
  lines.push('');

  // 1. Identity
  lines.push(abbreviated ? '### 1. Identity' : '## 1. Identity');
  lines.push(`- **Purpose:** ${meta.purpose.trim()}`);
  const chain = partOfChain(graph, square);
  if (chain.length > 0) lines.push(`- **Part of:** ${chain.join(' › ')} › **${meta.id}**`);
  if (meta.archetype) lines.push(`- **Archetype:** ${meta.archetype}`);
  const children = childrenOf(graph, meta.id);
  if (children.length > 0) {
    lines.push(`- **Contains:** ${children.map((c) => `${c.meta.id} (${c.meta.name})`).join(', ')}`);
  }
  lines.push('');

  // 2. Non-goals & boundaries
  lines.push(abbreviated ? '### 2. Non-goals & boundaries' : '## 2. Non-goals & boundaries');
  const boundaryCommitments = (meta.commitments ?? []).filter(isBoundaryLike);
  const policies = applicablePolicies(graph, meta.id);
  if ((meta.nonGoals ?? []).length === 0 && boundaryCommitments.length === 0 && policies.length === 0) {
    lines.push('- (none declared)');
  } else {
    for (const nonGoal of meta.nonGoals ?? []) lines.push(`- **Non-goal:** ${nonGoal}`);
    for (const c of boundaryCommitments) lines.push(commitmentLine(c, suspensions, meta.id));
    for (const { policy, commitment } of policies) {
      lines.push(
        `- **[policy/${commitment.strength}]** ${commitment.statement.trim()} _(from square://${policy.meta.id}#commitment/${commitment.id})_`
      );
    }
  }
  lines.push('');

  // 3. Commitments
  lines.push(abbreviated ? '### 3. Commitments' : '## 3. Commitments');
  const otherCommitments = (meta.commitments ?? []).filter((c) => !isBoundaryLike(c));
  if (otherCommitments.length === 0) lines.push('- (none declared)');
  for (const c of otherCommitments) lines.push(commitmentLine(c, suspensions, meta.id));
  lines.push('');

  // 4. Contracts
  lines.push(abbreviated ? '### 4. Contracts' : '## 4. Contracts');
  const provides = meta.contracts?.provides ?? [];
  const consumes = meta.contracts?.consumes ?? [];
  if (provides.length === 0 && consumes.length === 0) lines.push('- (none declared)');
  for (const contract of provides) {
    const consumers = consumersOf(graph, meta.id, contract.id);
    const consumerNote =
      consumers.length > 0 ? ` — consumed by ${consumers.map((c) => `square://${c.meta.id}`).join(', ')}` : '';
    lines.push(`- **Provides ${contract.id}:** ${contract.statement.trim()}${consumerNote}`);
    if (contract.schemaRef) lines.push(`  - schema: ${contract.schemaRef}`);
  }
  for (const contract of consumes) {
    lines.push(`- **Consumes ${contract.id}** from ${contract.from}: ${contract.statement.trim()}`);
  }
  const counterpartyIds = new Set<string>();
  for (const contract of provides) for (const c of consumersOf(graph, meta.id, contract.id)) counterpartyIds.add(c.meta.id);
  for (const contract of consumes) {
    const ref = parseSquareUri(contract.from);
    if (ref && graph.squares.has(ref.squareId)) counterpartyIds.add(ref.squareId);
  }
  for (const counterpartyId of [...counterpartyIds].sort()) {
    const counterparty = graph.squares.get(counterpartyId)!;
    lines.push(`- **Counterparty square://${counterpartyId}** (${counterparty.meta.name}): ${counterparty.meta.purpose.trim()}`);
  }
  lines.push('');

  // 5. Ownership & authority
  lines.push(abbreviated ? '### 5. Ownership & authority' : '## 5. Ownership & authority');
  if (meta.owns?.concepts?.length) lines.push(`- **Owns concepts:** ${meta.owns.concepts.join(', ')}`);
  if (meta.owns?.state?.length) lines.push(`- **Owns state:** ${meta.owns.state.join(', ')}`);
  if (meta.authority) {
    if (meta.authority.owns?.length) lines.push(`- **Authoritative for:** ${meta.authority.owns.join(', ')}`);
    if (meta.authority.constrains?.length) lines.push(`- **Constrains:** ${meta.authority.constrains.join(', ')}`);
    if (meta.authority.delegates?.length)
      lines.push(`- **Delegated to the realization:** ${meta.authority.delegates.join(', ')}`);
  } else {
    lines.push('- (no authority block — everything is implicitly delegated to the realization)');
  }
  for (const rel of meta.relationships ?? []) {
    lines.push(`- **${rel.type}** ${rel.target}${rel.through ? ` (through contract ${rel.through})` : ''}`);
  }
  lines.push('');

  // 6. Decisions
  lines.push(abbreviated ? '### 6. Decisions' : '## 6. Decisions');
  const decisions = meta.decisions ?? [];
  const current = decisions.filter((d) => d.supersededBy == null);
  const superseded = decisions.filter((d) => d.supersededBy != null);
  if (decisions.length === 0) lines.push('- (none recorded)');
  for (const d of current) {
    lines.push(`- **${d.id}${d.date ? ` (${d.date})` : ''}:** ${d.choice.trim()}${d.rationale ? ` — ${d.rationale.trim()}` : ''}`);
  }
  if (superseded.length > 0) {
    lines.push(`- Superseded: ${superseded.map((d) => `${d.id} → ${d.supersededBy}`).join(', ')}`);
  }
  lines.push('');

  // 7. Unresolved
  lines.push(abbreviated ? '### 7. Unresolved questions' : '## 7. Unresolved questions');
  const unresolved = meta.unresolved ?? [];
  if (unresolved.length === 0) {
    lines.push('- (none)');
  } else {
    lines.push('> ⚠ Rule A3: never silently answer these. Ask, or record a proposedDecision on the Change.');
    for (const u of unresolved) {
      lines.push(`- **${u.id}:** ${u.question.trim()}${u.affects?.length ? ` (affects: ${u.affects.join(', ')})` : ''}`);
    }
  }
  lines.push('');

  if (!abbreviated) {
    // 8. Active Changes
    lines.push('## 8. Active Changes');
    const active = changesTargeting(graph, meta.id);
    if (active.length === 0) lines.push('- (none)');
    for (const change of active) {
      lines.push(...renderChange(change, `### change://${change.meta.id} — ${change.meta.name}`));
    }
    lines.push('');

    // 9. Source bindings
    lines.push('## 9. Source bindings');
    const bindings = meta.bindings ?? [];
    if (bindings.length === 0) lines.push('- (none declared)');
    for (const glob of bindings) {
      let matched: string[] = [];
      try {
        matched = fs.globSync(glob, { cwd: graph.rootDir }).sort();
      } catch {
        // leave empty
      }
      const preview = matched.slice(0, 50);
      lines.push(`- \`${glob}\` — ${matched.length} file(s)`);
      for (const file of preview) lines.push(`  - ${file}`);
      if (matched.length > preview.length) lines.push(`  - … ${matched.length - preview.length} more`);
    }
    lines.push('');

    // 10. Body
    const body = square.body.trim();
    if (body.length > 0) {
      lines.push('## 10. Notes (Square body, verbatim)');
      lines.push('');
      lines.push(body);
      lines.push('');
    }

    lines.push('---');
    lines.push(stamp(graph));
  }

  return lines.join('\n');
}

export function compileChangePack(graph: Graph, changeId: string): string {
  const change = graph.changes.get(changeId);
  if (!change) throw new Error(`Change "${changeId}" not found`);
  const lines: string[] = [];

  lines.push(`# Context Pack — Change: ${change.meta.name} (change://${change.meta.id})`);
  lines.push('');
  lines.push('> Compiled read model; disposable. Regenerate rather than edit (rule A9).');
  lines.push('');
  lines.push(...renderChange(change, '## The Change'));
  const body = change.body.trim();
  if (body.length > 0) {
    lines.push('');
    lines.push('### Change notes (verbatim)');
    lines.push('');
    lines.push(body);
  }
  lines.push('');

  const targetIds = change.meta.targets
    .map((t) => parseSquareUri(t)?.squareId)
    .filter((t): t is string => t !== undefined && graph.squares.has(t))
    .sort();
  lines.push(`## Targeted Squares (${targetIds.length})`);
  lines.push('');
  for (const targetId of targetIds) {
    lines.push(compileSquarePack(graph, targetId, { abbreviated: true }));
    lines.push('');
  }

  lines.push('---');
  lines.push(stamp(graph));
  return lines.join('\n');
}

/**
 * Compile a pack for a bare id, square:// URI, or change:// URI.
 * A bare id matching both a Square and a Change is an error — use a URI.
 */
export function compileContext(graph: Graph, idOrUri: string): string {
  const squareRef = parseSquareUri(idOrUri);
  if (squareRef) return compileSquarePack(graph, squareRef.squareId);
  const changeRef = parseChangeUri(idOrUri);
  if (changeRef) return compileChangePack(graph, changeRef);

  const isSquare = graph.squares.has(idOrUri);
  const isChange = graph.changes.has(idOrUri);
  if (isSquare && isChange) {
    throw new Error(`"${idOrUri}" names both a Square and a Change — use square://${idOrUri} or change://${idOrUri}`);
  }
  if (isSquare) return compileSquarePack(graph, idOrUri);
  if (isChange) return compileChangePack(graph, idOrUri);
  throw new Error(`no Square or Change named "${idOrUri}"`);
}
