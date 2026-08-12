// Referential-integrity validation — SPEC §11. Operates on a loaded Graph;
// returns load diagnostics plus integrity errors and warnings.
// @sq graph-loader#concept/integrity-rules -- every §11 error and warning, in one pass

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { extractBodyRefs, parseSquareUri, parseChangeUri, parseExternalUri, conceptUri } from './ids.ts';
import { changesTargeting, type Diagnostic, type Graph, type SquareDoc } from './load.ts';
import { PROTOCOL_MD } from './protocol.ts';
import { buildSourceMap, listClaims, listConcepts, type SourceMap } from './sources.ts';

const STALE_BLOCKED_DAYS = 14;

function err(file: string | undefined, message: string): Diagnostic {
  return { severity: 'error', file, message };
}

function warn(file: string | undefined, message: string): Diagnostic {
  return { severity: 'warning', file, message };
}

function claimIds(square: SquareDoc): Map<string, Set<string>> {
  const meta = square.meta;
  const facets = new Map<string, Set<string>>();
  const put = (facet: string, ids: string[]) => facets.set(facet, new Set(ids));
  put('commitment', (meta.commitments ?? []).map((c) => c.id));
  put('contract', [
    ...(meta.contracts?.provides ?? []).map((c) => c.id),
    ...(meta.contracts?.consumes ?? []).map((c) => c.id)
  ]);
  put('decision', (meta.decisions ?? []).map((d) => d.id));
  put('scenario', (meta.scenarios ?? []).map((s) => s.id));
  put('unresolved', (meta.unresolved ?? []).map((u) => u.id));
  return facets;
}

/**
 * Does `square://id`, `square://id#facet/claim` or `square://id#concept/cid`
 * resolve in this graph? (SPEC §11 error 3 — concepts are addressable targets.)
 */
function resolveRef(graph: Graph, uri: string): { ok: boolean; why?: string } {
  const ref = parseSquareUri(uri);
  if (!ref) return { ok: false, why: 'not a valid square:// URI' };
  const target = graph.squares.get(ref.squareId);
  if (!target) return { ok: false, why: `Square "${ref.squareId}" does not exist` };
  if (ref.conceptId !== undefined) {
    const declared = listConcepts(target).some((c) => c.id === ref.conceptId);
    if (!declared) {
      return { ok: false, why: `no concept "${ref.conceptId}" in square://${ref.squareId}` };
    }
  }
  if (ref.facet && ref.claimId) {
    const ids = claimIds(target).get(ref.facet);
    if (!ids?.has(ref.claimId)) {
      return { ok: false, why: `no ${ref.facet} "${ref.claimId}" in square://${ref.squareId}` };
    }
  }
  return { ok: true };
}

/**
 * Concept declarations and the tags pointing at them (SPEC §11 error 9,
 * warning 6). Tags resolve only against the claim's own Square — cross-Square
 * tagging does not exist (§14.3).
 */
function checkConcepts(square: SquareDoc, sourceMap: SourceMap, out: Diagnostic[]): void {
  const file = square.file;
  const declared = new Set<string>();
  for (const concept of listConcepts(square)) {
    if (declared.has(concept.id)) {
      out.push(err(file, `duplicate concept id "${concept.id}" in owns.concepts (SPEC §14.2, §11 error 9)`));
      continue;
    }
    declared.add(concept.id);
  }

  const tagged = new Set<string>();
  for (const claim of listClaims(square)) {
    for (const tag of claim.concepts) {
      if (declared.has(tag)) {
        tagged.add(tag);
        continue;
      }
      out.push(
        err(
          file,
          `${claim.facet} "${claim.id}" is tagged with concept "${tag}", which square://${square.meta.id} does not declare — ` +
            `concept tags never resolve across Squares (SPEC §14.3, §11 error 9)`
        )
      );
    }
  }

  // Warning 6: a concept nothing points at.
  const anchoredTargets = new Set(sourceMap.resolved.map((r) => r.target.uri));
  for (const concept of listConcepts(square)) {
    if (tagged.has(concept.id)) continue;
    if ((concept.sources ?? []).length > 0) continue;
    if (anchoredTargets.has(conceptUri(square.meta.id, concept.id))) continue;
    out.push(
      warn(
        file,
        `concept "${concept.id}" is inert — no claim is tagged with it, no selector is scoped to it, ` +
          `and no anchor targets it (SPEC §11 warning 6)`
      )
    );
  }
}

function checkDuplicateClaimIds(square: SquareDoc, out: Diagnostic[]): void {
  const meta = square.meta;
  const facetLists: Array<[string, string[]]> = [
    ['commitment', (meta.commitments ?? []).map((c) => c.id)],
    [
      'contract',
      [...(meta.contracts?.provides ?? []).map((c) => c.id), ...(meta.contracts?.consumes ?? []).map((c) => c.id)]
    ],
    ['decision', (meta.decisions ?? []).map((d) => d.id)],
    ['scenario', (meta.scenarios ?? []).map((s) => s.id)],
    ['unresolved', (meta.unresolved ?? []).map((u) => u.id)]
  ];
  for (const [facet, ids] of facetLists) {
    const seen = new Set<string>();
    for (const cid of ids) {
      if (seen.has(cid)) out.push(err(square.file, `duplicate ${facet} id "${cid}" (SPEC §11 error 2)`));
      seen.add(cid);
    }
  }
}

function checkPartOfCycles(graph: Graph, out: Diagnostic[]): void {
  for (const square of graph.squares.values()) {
    const seen = new Set<string>([square.meta.id]);
    let current = square.meta.partOf;
    while (current !== undefined) {
      if (seen.has(current)) {
        out.push(err(square.file, `partOf cycle involving "${current}" (SPEC §11 error 4)`));
        break;
      }
      seen.add(current);
      current = graph.squares.get(current)?.meta.partOf;
    }
  }
}

function checkSquare(graph: Graph, square: SquareDoc, out: Diagnostic[]): void {
  const meta = square.meta;
  const file = square.file;

  if (meta.partOf !== undefined && !graph.squares.has(meta.partOf)) {
    out.push(err(file, `partOf references nonexistent Square "${meta.partOf}"`));
  }

  for (const rel of meta.relationships ?? []) {
    const squareRef = parseSquareUri(rel.target);
    if (squareRef) {
      const target = graph.squares.get(squareRef.squareId);
      if (!target) {
        out.push(err(file, `relationship target ${rel.target} does not exist`));
      } else if (rel.through !== undefined) {
        const provides = new Set((target.meta.contracts?.provides ?? []).map((c) => c.id));
        if (!provides.has(rel.through)) {
          out.push(
            err(file, `relationship through "${rel.through}" is not provided by ${rel.target} (SPEC §6)`)
          );
        }
      }
    } else if (parseExternalUri(rel.target) === null) {
      out.push(err(file, `relationship target "${rel.target}" is not a square:// or external:// URI`));
    }
  }

  for (const consumed of meta.contracts?.consumes ?? []) {
    const ref = parseSquareUri(consumed.from);
    const provider = ref ? graph.squares.get(ref.squareId) : undefined;
    if (!provider) {
      out.push(err(file, `consumed contract "${consumed.id}" names nonexistent provider ${consumed.from}`));
      continue;
    }
    const provides = new Set((provider.meta.contracts?.provides ?? []).map((c) => c.id));
    if (!provides.has(consumed.id)) {
      out.push(
        warn(file, `consumed contract "${consumed.id}" is not declared under ${consumed.from} contracts.provides`)
      );
    }
  }

  for (const commitment of meta.commitments ?? []) {
    if (commitment.appliesTo !== undefined && meta.archetype !== 'policy') {
      out.push(
        err(file, `commitment "${commitment.id}" uses appliesTo but archetype is not "policy" (SPEC §7)`)
      );
    }
    if (Array.isArray(commitment.appliesTo)) {
      for (const target of commitment.appliesTo) {
        const res = resolveRef(graph, target);
        if (!res.ok) out.push(err(file, `commitment "${commitment.id}" appliesTo ${target}: ${res.why}`));
      }
    }
  }

  const decisionIds = new Set((meta.decisions ?? []).map((d) => d.id));
  for (const decision of meta.decisions ?? []) {
    if (decision.supersededBy != null) {
      if (decision.supersededBy === decision.id) {
        out.push(err(file, `decision "${decision.id}" is superseded by itself (SPEC §11 error 6)`));
      } else if (!decisionIds.has(decision.supersededBy)) {
        out.push(
          err(
            file,
            `decision "${decision.id}" supersededBy nonexistent decision "${decision.supersededBy}" (SPEC §11 error 6)`
          )
        );
      }
    }
    if (decision.from !== undefined) {
      const changeId = parseChangeUri(decision.from);
      const change = changeId === null ? undefined : graph.changes.get(changeId);
      if (!change) {
        out.push(
          err(file, `decision "${decision.id}" from ${decision.from}: Change does not exist (SPEC §11 error 7)`)
        );
      } else if (change.meta.phase !== 'done') {
        out.push(
          err(
            file,
            `decision "${decision.id}" was promoted from ${decision.from}, whose phase is "${change.meta.phase}" — ` +
              `decisions are promoted only when the Change is done (SPEC §9, §11 error 7)`
          )
        );
      }
    }
  }

  // Warnings (SPEC §11).
  if ((meta.nonGoals ?? []).length === 0 && (meta.commitments ?? []).length === 0) {
    out.push(warn(file, 'no nonGoals and no commitments — pure description is rot bait (SPEC §11 warning 1)'));
  }
  if ((meta.commitments ?? []).length > 0 && meta.authority === undefined) {
    out.push(warn(file, 'declares commitments but no authority block — S1 requires authority (SPEC §11 warning 2)'));
  }
  // Error 12: the removed `bindings` key, reported with its rewrite rather
  // than as a generic unknown field (§6 migration note, §15.7).
  if (square.legacyBindings !== undefined) {
    const globs = square.legacyBindings;
    const rewrite =
      globs.length > 0
        ? ` — move ${globs.map((g) => JSON.stringify(g)).join(', ')} under \`sources:\`, one \`- glob: <glob>\` entry each`
        : ' — use `sources:` with `- glob: <glob>` entries instead';
    out.push(err(file, `\`bindings\` is removed, replaced by \`sources\`${rewrite} (SPEC §15.7, §11 error 12)`));
  }
}

function checkChanges(graph: Graph, out: Diagnostic[]): void {
  for (const change of graph.changes.values()) {
    const meta = change.meta;
    const file = change.file;

    for (const target of meta.targets) {
      const res = resolveRef(graph, target);
      if (!res.ok) out.push(err(file, `target ${target}: ${res.why}`));
    }

    if ((meta.type === 'refactor' || meta.type === 'repair') && meta.semanticDiff.length > 0) {
      out.push(err(file, `${meta.type} Change must have an empty semanticDiff (SPEC §11 error 5)`));
    }
    if (meta.type === 'evolution' && meta.semanticDiff.length === 0) {
      out.push(err(file, 'evolution Change must have a non-empty semanticDiff (SPEC §11 error 5)'));
    }
    if (meta.phase === 'done' && (meta.proposedDecisions ?? []).length > 0) {
      out.push(
        err(file, 'done Change still lists proposedDecisions — promote them into the owning Squares (SPEC §9, §11 error 5)')
      );
    }

    for (const suspension of meta.suspensions ?? []) {
      const ref = parseSquareUri(suspension.claim);
      if (ref && ref.facet !== 'commitment') {
        out.push(err(file, `suspension ${suspension.claim}: only commitments can be suspended (SPEC §9)`));
        continue;
      }
      const res = resolveRef(graph, suspension.claim);
      if (!res.ok) out.push(err(file, `suspension ${suspension.claim}: ${res.why}`));
    }

    for (const blocked of meta.status?.blocked ?? []) {
      for (const affected of blocked.affects ?? []) {
        if (affected.startsWith('square://')) {
          const res = resolveRef(graph, affected);
          if (!res.ok) out.push(err(file, `blocked.affects ${affected}: ${res.why}`));
        }
      }
    }

    if (meta.phase === 'blocked') {
      const age = lastCommitAgeDays(graph.rootDir, change.file);
      if (age !== null && age > STALE_BLOCKED_DAYS) {
        out.push(warn(file, `blocked for ${age} days without edits (informational, SPEC §11 warning 4)`));
      }
    }
  }
}

function lastCommitAgeDays(rootDir: string, relFile: string): number | null {
  try {
    // execFileSync with an argument array: relFile derives from the
    // .squaring.json-configurable dir and must never reach a shell.
    const output = execFileSync('git', ['log', '-1', '--format=%ct', '--', relFile], {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'ignore']
    })
      .toString()
      .trim();
    if (!output) return null;
    const seconds = Number(output);
    if (!Number.isFinite(seconds)) return null;
    return Math.floor((Date.now() / 1000 - seconds) / 86400);
  } catch {
    return null;
  }
}

/**
 * PROTOCOL.md is tool-owned: `squaring init` (re)writes it from the running
 * tool's PROTOCOL_MD constant. After a tool upgrade the on-disk copy goes
 * stale silently — this warning is the refresh signal. A missing file is not
 * flagged: not every squared repository installs the protocol file.
 */
function checkProtocolFreshness(graph: Graph, out: Diagnostic[]): void {
  const rel = path.join(graph.squaresDir, 'PROTOCOL.md');
  let onDisk: string;
  try {
    onDisk = fs.readFileSync(path.join(graph.rootDir, rel), 'utf8');
  } catch {
    return;
  }
  if (onDisk !== PROTOCOL_MD) {
    out.push(
      warn(
        rel,
        'differs from the protocol shipped with this squaring version — run `squaring init` to refresh the tool-owned file (SPEC §11 warning 5)'
      )
    );
  }
}

function checkBodyRefs(graph: Graph, out: Diagnostic[]): void {
  const docs = [...graph.squares.values(), ...graph.changes.values()];
  for (const doc of docs) {
    const refs = extractBodyRefs(doc.body);
    for (const wikiId of refs.wiki) {
      if (!graph.squares.has(wikiId)) {
        out.push(err(doc.file, `[[${wikiId}]] links to a nonexistent Square (SPEC §11 error 3)`));
      }
    }
    for (const uri of refs.uris) {
      const res = resolveRef(graph, uri);
      if (!res.ok) out.push(err(doc.file, `${uri}: ${res.why} (SPEC §11 error 3)`));
    }
  }
}

/**
 * Run all §11 checks. Returns load diagnostics + integrity diagnostics, errors
 * first.
 *
 * `validate` runs the anchor scan (§15) on every invocation — errors 10 and 11
 * and warnings 7 and 8 are not optional extras. A caller that already built the
 * source map (the CLI builds one for `validate` + `context` in the same
 * process) passes it in to avoid a second pass over the scan universe.
 */
export function validateGraph(graph: Graph, sourceMap: SourceMap = buildSourceMap(graph)): Diagnostic[] {
  const out: Diagnostic[] = [...graph.diagnostics];

  for (const square of graph.squares.values()) {
    checkDuplicateClaimIds(square, out);
    checkConcepts(square, sourceMap, out);
    checkSquare(graph, square, out);
  }
  checkPartOfCycles(graph, out);
  checkChanges(graph, out);
  checkBodyRefs(graph, out);
  checkProtocolFreshness(graph, out);
  // Errors 8, 10, 11 and warnings 3, 7, 8 — already attributed to the
  // realization file (anchors, coverage, read failures), the declaring Square
  // file (globs), or `.squaring.json` (an empty universe the config caused).
  out.push(...sourceMap.findings);

  return out.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1;
    return (a.file ?? '').localeCompare(b.file ?? '');
  });
}

export function hasErrors(diagnostics: Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === 'error');
}

/** Human-readable one-line-per-diagnostic rendering shared by CLI and MCP. */
export function formatDiagnostics(diagnostics: Diagnostic[]): string {
  if (diagnostics.length === 0) return 'OK — no errors, no warnings.';
  const lines = diagnostics.map(
    (d) =>
      `${d.severity === 'error' ? 'ERROR' : 'WARN '} ${d.file ? d.file + (d.line !== undefined ? `:${d.line}` : '') + ': ' : ''}${d.message}`
  );
  const errors = diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = diagnostics.length - errors;
  lines.push('', `${errors} error(s), ${warnings} warning(s).`);
  return lines.join('\n');
}

export { changesTargeting };
