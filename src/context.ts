// Context Pack compiler — SPEC §12. Deterministic: identical graph + identical
// scan universe with identical file contents + identical arguments produce
// byte-identical output above the trailing generation stamp. Edges first —
// non-goals, boundaries, and commitments come before anything an LLM could
// plausibly regenerate on its own.
// @sq context-compiler#concept/pack-ordering -- the twelve sections, their order, and the empty-section rule

import { execFileSync } from 'node:child_process';
import {
  CLAIM_FACETS,
  claimUri,
  conceptUri,
  parseChangeUri,
  parseSquareUri,
  resolveWikiLinks,
  squareUri
} from './ids.ts';
import { changesTargeting, type ChangeDoc, type Graph, type SquareDoc } from './load.ts';
import {
  buildSourceMap,
  conceptDisplayName,
  listClaims,
  listConcepts,
  type ResolvedAnchor,
  type SelectorMatch,
  type SourceMap
} from './sources.ts';
import type { Commitment } from './schema.ts';

/**
 * The one empty-section placeholder (§12). Every section that renders no
 * content renders this single line — section numbers never shift. Section 12
 * (Body) is the sole exception: it is omitted entirely, heading included.
 */
const EMPTY_SECTION = '(none declared)';

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
  const uri = squareUri(squareId);
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
  const uri = squareUri(squareId);
  return [...graph.squares.values()]
    .filter((s) => (s.meta.contracts?.consumes ?? []).some((c) => c.from === uri && c.id === contractId))
    .sort((a, b) => a.meta.id.localeCompare(b.meta.id));
}

/**
 * The concept tags a claim's line ends with in sections 3–9 (§12), so an agent
 * reading one claim sees its topics without returning to the concept map.
 * Tags are rendered exactly as declared — an undeclared tag is §11 error 9 and
 * hiding it here would hide the defect.
 */
function tagSuffix(concepts: string[] | undefined): string {
  return concepts !== undefined && concepts.length > 0 ? ` _(concepts: ${concepts.join(', ')})_` : '';
}

/**
 * One commitment bullet. `source` overrides the parenthetical reference —
 * used when a policy Square's commitment is injected into another Square's
 * pack, so the line points back at the owning policy claim.
 */
function commitmentLine(
  c: Commitment,
  suspensions: Map<string, SuspensionNote[]>,
  squareId: string,
  source?: string
): string {
  const evidence = c.evidenceClass && c.evidenceClass !== 'none' ? `, evidence: ${c.evidenceClass}` : '';
  let line = `- **[${c.kind}/${c.strength}]** ${c.statement.trim()} _(${source ?? c.id}${evidence})_${tagSuffix(c.concepts)}`;
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
  if (meta.base?.codeRevision) lines.push(`- **Base:** ${meta.base.codeRevision}`);
  lines.push(
    meta.semanticDiff.length === 0
      ? '- **Semantic diff:** (empty — no meaning changes)'
      : `- **Semantic diff:**\n${meta.semanticDiff.map((d) => `  - ${d}`).join('\n')}`
  );
  for (const c of meta.constraints ?? []) lines.push(`- **Constraint:** ${c}`);
  for (const d of meta.proposedDecisions ?? []) {
    lines.push(
      `- **Proposed decision (${d.id}):** ${d.choice}${d.rationale ? ` — ${d.rationale.trim()}` : ''}${tagSuffix(d.concepts)}`
    );
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

/** Selector bullets for section 11, with their matched file lists (§12). */
function selectorLines(matches: SelectorMatch[]): string[] {
  const lines: string[] = [];
  for (const match of matches) {
    const scope = match.scope.kind === 'concept' ? ` on ${conceptUri(match.scope.squareId, match.scope.conceptId)}` : '';
    const note = match.selector.note === undefined ? '' : ` · ${match.selector.note.trim()}`;
    const expect = match.selector.expect === undefined ? '' : ` · expect: ${match.selector.expect}`;
    if (match.unconfined) {
      // §11 error 8 — named and skipped, never enumerated.
      lines.push(`- \`${match.selector.glob}\`${scope} — skipped (must be a repo-relative glob without "..")`);
      continue;
    }
    lines.push(`- \`${match.selector.glob}\`${scope} — ${match.files.length} file(s)${expect}${note}`);
    // Every matched file, uncapped: §12 gives section 11 no truncation rule,
    // and a silently shortened list reads as the whole realization.
    for (const file of match.files) lines.push(`  - ${file}`);
  }
  return lines;
}

/**
 * Anchor-site bullets for section 11: `path:line` as found at this scan.
 * Locations exist only in this derived output (§15.1) — the graph stores
 * selectors, the realization stores anchors, and neither stores a line.
 */
function anchorLines(anchors: ResolvedAnchor[]): string[] {
  return [...anchors]
    .sort((a, b) => (a.anchor.file === b.anchor.file ? a.anchor.line - b.anchor.line : a.anchor.file < b.anchor.file ? -1 : 1))
    .map(({ anchor, target }) => {
      const note = anchor.note === undefined ? '' : ` — ${anchor.note}`;
      return `- ${anchor.file}:${anchor.line} → ${target.uri}${note}`;
    });
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

export interface PackOptions {
  /** sections 1–9 only, under `###` headings — the form embedded in a Change pack */
  abbreviated?: boolean;
  /** compile the concept-scoped pack for this concept of the target Square (§12) */
  conceptId?: string;
  /** prebuilt source map for section 11; built on demand when absent */
  sourceMap?: SourceMap;
}

/**
 * Compile the pack for one Square (§12), or for one concept of it when
 * `conceptId` is given. Section numbers are fixed: a scoped pack omits
 * sections 2 and 12 entirely and keeps every other number where it is.
 */
export function compileSquarePack(graph: Graph, squareId: string, options?: PackOptions): string {
  const square = graph.squares.get(squareId);
  if (!square) throw new Error(`Square "${squareId}" not found`);
  const meta = square.meta;
  const abbreviated = options?.abbreviated ?? false;
  const conceptId = options?.conceptId;
  const concepts = listConcepts(square);
  const scopedConcept = conceptId === undefined ? undefined : concepts.find((c) => c.id === conceptId);
  if (conceptId !== undefined && scopedConcept === undefined) {
    throw new Error(`${squareUri(squareId)} declares no concept "${conceptId}"`);
  }
  // Only section 11 needs the scan; an abbreviated pack stops at section 9 and
  // must not pay for a universe walk it will never render.
  const sourceMap = abbreviated ? undefined : (options?.sourceMap ?? buildSourceMap(graph));
  const suspensions = activeSuspensions(graph);

  /** In a scoped pack a claim renders only when it carries the concept tag. */
  const keep = (claimConcepts: string[] | undefined): boolean =>
    conceptId === undefined || (claimConcepts ?? []).includes(conceptId);

  const lines: string[] = [];
  const heading = (n: number, title: string): string => `${abbreviated ? '###' : '##'} ${n}. ${title}`;
  const section = (n: number, title: string, body: string[]): void => {
    lines.push(heading(n, title));
    lines.push(...(body.length > 0 ? body : [EMPTY_SECTION]));
    lines.push('');
  };

  const title = scopedConcept
    ? `${meta.name} › ${conceptDisplayName(scopedConcept)} (${conceptUri(meta.id, scopedConcept.id)})`
    : `${meta.name} (${squareUri(meta.id)})`;
  if (abbreviated) {
    lines.push(`## Target: ${title}`);
  } else {
    lines.push(`# Context Pack — ${title}`);
    lines.push('');
    lines.push('> Compiled read model; disposable. Regenerate rather than edit (rule A9).');
  }
  lines.push('');

  // ---- 1. Target identity --------------------------------------------------
  const identity: string[] = [`- **Purpose:** ${meta.purpose.trim()}`];
  if (scopedConcept) identity.push(`- **Concept ${scopedConcept.id}:** ${scopedConcept.statement.trim()}`);
  const chain = partOfChain(graph, square);
  if (chain.length > 0) identity.push(`- **Part of:** ${chain.join(' › ')} › **${meta.id}**`);
  if (meta.archetype) identity.push(`- **Archetype:** ${meta.archetype}`);
  const children = childrenOf(graph, meta.id);
  if (children.length > 0) {
    identity.push(`- **Contains:** ${children.map((c) => `${c.meta.id} (${c.meta.name})`).join(', ')}`);
  }
  section(1, 'Target identity', identity);

  // ---- 2. Concept map ------------------------------------------------------
  // Omitted entirely in a scoped pack: the one concept in scope is already in
  // section 1, and the rest of the map is out of scope.
  if (scopedConcept === undefined) {
    const claims = listClaims(square);
    const map: string[] = [];
    for (const concept of concepts) {
      map.push(`- **${concept.id}** (${conceptDisplayName(concept)}) — ${concept.statement.trim()}`);
      for (const facet of CLAIM_FACETS) {
        const tagged = claims.filter((c) => c.facet === facet && c.concepts.includes(concept.id)).map((c) => c.id);
        if (tagged.length > 0) map.push(`  - ${facet}: ${tagged.join(', ')}`);
      }
    }
    section(2, 'Concept map', map);
  }

  // ---- 3. Non-goals and boundaries ----------------------------------------
  // `nonGoals` and policy injections are never filtered by concept: boundary
  // context is cheap to include and dangerous to lose (§12).
  const boundaries: string[] = [];
  for (const nonGoal of meta.nonGoals ?? []) boundaries.push(`- **Non-goal:** ${nonGoal}`);
  for (const c of (meta.commitments ?? []).filter(isBoundaryLike)) {
    if (keep(c.concepts)) boundaries.push(commitmentLine(c, suspensions, meta.id));
  }
  for (const { policy, commitment } of applicablePolicies(graph, meta.id)) {
    boundaries.push(
      commitmentLine(commitment, suspensions, policy.meta.id, `from ${claimUri(policy.meta.id, 'commitment', commitment.id)}`)
    );
  }
  section(3, 'Non-goals and boundaries', boundaries);

  // ---- 4. Commitments ------------------------------------------------------
  section(
    4,
    'Commitments',
    (meta.commitments ?? [])
      .filter((c) => !isBoundaryLike(c) && keep(c.concepts))
      .map((c) => commitmentLine(c, suspensions, meta.id))
  );

  // ---- 5. Scenarios --------------------------------------------------------
  const scenarios: string[] = [];
  for (const s of (meta.scenarios ?? []).filter((s) => keep(s.concepts))) {
    const evidence = s.evidenceClass && s.evidenceClass !== 'none' ? ` _(evidence: ${s.evidenceClass})_` : '';
    scenarios.push(`- **${s.id}** — given: ${s.given.trim()} · when: ${s.when.trim()}${evidence}${tagSuffix(s.concepts)}`);
    for (const t of s.then) scenarios.push(`  - then: ${t.trim()}`);
  }
  section(5, 'Scenarios', scenarios);

  // ---- 6. Contracts --------------------------------------------------------
  const provides = (meta.contracts?.provides ?? []).filter((c) => keep(c.concepts));
  const consumes = (meta.contracts?.consumes ?? []).filter((c) => keep(c.concepts));
  const contracts: string[] = [];
  for (const contract of provides) {
    const consumers = consumersOf(graph, meta.id, contract.id);
    const consumerNote =
      consumers.length > 0 ? ` — consumed by ${consumers.map((c) => squareUri(c.meta.id)).join(', ')}` : '';
    contracts.push(`- **Provides ${contract.id}:** ${contract.statement.trim()}${consumerNote}${tagSuffix(contract.concepts)}`);
    if (contract.schemaRef) contracts.push(`  - schema: ${contract.schemaRef}`);
  }
  for (const contract of consumes) {
    contracts.push(
      `- **Consumes ${contract.id}** from ${contract.from}: ${contract.statement.trim()}${tagSuffix(contract.concepts)}`
    );
  }
  const counterpartyIds = new Set<string>();
  for (const contract of provides) for (const c of consumersOf(graph, meta.id, contract.id)) counterpartyIds.add(c.meta.id);
  for (const contract of consumes) {
    const ref = parseSquareUri(contract.from);
    if (ref && graph.squares.has(ref.squareId)) counterpartyIds.add(ref.squareId);
  }
  for (const counterpartyId of [...counterpartyIds].sort()) {
    const counterparty = graph.squares.get(counterpartyId)!;
    contracts.push(
      `- **Counterparty ${squareUri(counterpartyId)}** (${counterparty.meta.name}): ${counterparty.meta.purpose.trim()}`
    );
  }
  section(6, 'Contracts', contracts);

  // ---- 7. Ownership and dependency directions ------------------------------
  // Never filtered by concept — `owns`, `authority` and `relationships` render
  // exactly as in the full pack (§12).
  const ownership: string[] = [];
  if (concepts.length > 0) ownership.push(`- **Owns concepts:** ${concepts.map((c) => c.id).join(', ')}`);
  if (meta.owns?.state?.length) ownership.push(`- **Owns state:** ${meta.owns.state.join(', ')}`);
  if (meta.authority) {
    if (meta.authority.owns?.length) ownership.push(`- **Authoritative for:** ${meta.authority.owns.join(', ')}`);
    if (meta.authority.constrains?.length) ownership.push(`- **Constrains:** ${meta.authority.constrains.join(', ')}`);
    if (meta.authority.delegates?.length) {
      ownership.push(`- **Delegated to the realization:** ${meta.authority.delegates.join(', ')}`);
    }
  }
  for (const rel of meta.relationships ?? []) {
    ownership.push(`- **${rel.type}** ${rel.target}${rel.through ? ` (through contract ${rel.through})` : ''}`);
  }
  // The absent-authority note is content, not a placeholder: it only renders
  // when the section has something to qualify. A Square that declares no
  // ownership, no authority and no relationships takes the empty-section rule.
  if (meta.authority === undefined && ownership.length > 0) {
    ownership.push('- (no authority block — everything is implicitly delegated to the realization)');
  }
  section(7, 'Ownership and dependency directions', ownership);

  // ---- 8. Decisions --------------------------------------------------------
  const decisions = (meta.decisions ?? []).filter((d) => keep(d.concepts));
  const currentDecisions = decisions.filter((d) => d.supersededBy == null);
  const superseded = decisions.filter((d) => d.supersededBy != null);
  const decisionLines: string[] = [];
  for (const d of currentDecisions) {
    decisionLines.push(
      `- **${d.id}${d.date ? ` (${d.date})` : ''}:** ${d.choice.trim()}${d.rationale ? ` — ${d.rationale.trim()}` : ''}` +
        `${d.from ? ` _(from ${d.from})_` : ''}${tagSuffix(d.concepts)}`
    );
  }
  if (superseded.length > 0) {
    decisionLines.push(`- Superseded: ${superseded.map((d) => `${d.id} → ${d.supersededBy}`).join(', ')}`);
  }
  section(8, 'Decisions', decisionLines);

  // ---- 9. Unresolved questions ---------------------------------------------
  const unresolved = (meta.unresolved ?? []).filter((u) => keep(u.concepts));
  const unresolvedLines: string[] = [];
  if (unresolved.length > 0) {
    unresolvedLines.push('> ⚠ Rule A3: never silently answer these. Ask, or record a proposedDecision on the Change.');
    for (const u of unresolved) {
      unresolvedLines.push(
        `- **${u.id}:** ${u.question.trim()}${u.affects?.length ? ` (affects: ${u.affects.join(', ')})` : ''}${tagSuffix(u.concepts)}`
      );
    }
  }
  section(9, 'Unresolved questions', unresolvedLines);

  if (abbreviated) return lines.join('\n');

  // ---- 10. Active Changes --------------------------------------------------
  // Unchanged by concept scoping: Changes target Squares, not concepts (§12).
  const active = changesTargeting(graph, meta.id);
  const changeLines: string[] = [];
  for (const change of active) {
    changeLines.push(...renderChange(change, `### change://${change.meta.id} — ${change.meta.name}`));
  }
  section(10, 'Active Changes', changeLines);

  // @sq context-compiler#concept/pack-content -- selectors with their matched files, then anchor sites as path:line
  // ---- 11. Sources ---------------------------------------------------------
  const map = sourceMap!;
  const selectors = map.selectors.filter((s) =>
    scopedConcept === undefined
      ? s.scope.squareId === meta.id
      : s.scope.kind === 'concept' && s.scope.squareId === meta.id && s.scope.conceptId === scopedConcept.id
  );
  const claimTags = new Map(listClaims(square).map((c) => [`${c.facet}/${c.id}`, c.concepts]));
  const anchors = map.resolved.filter(({ target }) => {
    if (target.squareId !== meta.id) return false;
    if (scopedConcept === undefined) return true;
    if (target.kind === 'concept') return target.conceptId === scopedConcept.id;
    if (target.kind === 'claim') {
      return (claimTags.get(`${target.facet}/${target.claimId}`) ?? []).includes(scopedConcept.id);
    }
    return false;
  });
  section(11, 'Sources', [...selectorLines(selectors), ...anchorLines(anchors)]);

  // ---- 12. Body ------------------------------------------------------------
  // The one section omitted rather than placeheld when empty (§12), and omitted
  // outright in a scoped pack. `[[wiki]]` sugar is resolved to canonical
  // square:// URIs so the pack never depends on the authoring shorthand.
  const body = square.body.trim();
  if (scopedConcept === undefined && body.length > 0) {
    lines.push(heading(12, 'Body'));
    lines.push('');
    lines.push(resolveWikiLinks(body));
    lines.push('');
  }

  lines.push('---');
  lines.push(stamp(graph));
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
    lines.push('### Change notes');
    lines.push('');
    lines.push(resolveWikiLinks(body));
  }
  lines.push('');

  const targetIds = [
    ...new Set(
      change.meta.targets
        .map((t) => parseSquareUri(t)?.squareId)
        .filter((t): t is string => t !== undefined && graph.squares.has(t))
    )
  ].sort();
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

/** `<square-id>#concept/<concept-id>` — the short form §12 accepts alongside the full URI. */
const SHORT_CONCEPT_RE = /^([a-z0-9][a-z0-9-]*)#concept\/([a-z0-9][a-z0-9-]*)$/;

// @sq context-compiler#concept/pack-scoping -- which pack an argument compiles to
/**
 * Compile a pack for a bare id, a square:// URI, a concept URI (short or full
 * form), or a change:// URI (§12, §13).
 * A bare id matching both a Square and a Change is an error — use a URI.
 */
export function compileContext(graph: Graph, idOrUri: string, options?: PackOptions): string {
  const squareRef = parseSquareUri(idOrUri);
  if (squareRef) {
    if (squareRef.facet !== undefined) {
      throw new Error(`${idOrUri} names a claim — packs compile for a Square, a Change, or a concept URI (SPEC §12)`);
    }
    return compileSquarePack(graph, squareRef.squareId, { ...options, ...conceptOption(squareRef.conceptId) });
  }
  const short = SHORT_CONCEPT_RE.exec(idOrUri);
  if (short) return compileSquarePack(graph, short[1]!, { ...options, conceptId: short[2]! });

  const changeRef = parseChangeUri(idOrUri);
  if (changeRef) return compileChangePack(graph, changeRef);

  const isSquare = graph.squares.has(idOrUri);
  const isChange = graph.changes.has(idOrUri);
  if (isSquare && isChange) {
    throw new Error(`"${idOrUri}" names both a Square and a Change — use square://${idOrUri} or change://${idOrUri}`);
  }
  if (isSquare) return compileSquarePack(graph, idOrUri, options);
  if (isChange) return compileChangePack(graph, idOrUri);
  throw new Error(`no Square or Change named "${idOrUri}"`);
}

/** exactOptionalPropertyTypes-safe spread of an optional conceptId. */
function conceptOption(conceptId: string | undefined): { conceptId?: string } {
  return conceptId === undefined ? {} : { conceptId };
}
