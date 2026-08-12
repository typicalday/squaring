// The index — SPEC §15.6. Both directions of the source map, rendered.
//
// The index is derived, disposable output with exactly the standing of a
// Context Pack (rule A9): never stored in the graph, never committed,
// regenerated instead of edited. This module owns the target grammar the
// `index` surfaces accept and the two renderings (human text, `--json`);
// resolution itself is sources.ts.
// @sq graph-loader#concept/source-resolution -- both renderings of the resolved map (§15.6)

import path from 'node:path';
import { CLAIM_FACETS, claimUri, conceptUri, squareUri, type ClaimFacet } from './ids.ts';
import type { Graph } from './load.ts';
import {
  conceptDisplayName,
  listClaims,
  listConcepts,
  type IndexEntry,
  type ResolvedAnchor,
  type SelectorMatch,
  type SourceMap
} from './sources.ts';

/** A resolved `<target>` argument: which node of the forward map to scope to. */
export interface IndexTarget {
  kind: 'square' | 'concept' | 'claim';
  uri: string;
  squareId: string;
  conceptId?: string;
  facet?: ClaimFacet;
  claimId?: string;
}

const FULL_RE =
  /^square:\/\/([a-z0-9][a-z0-9-]*)(?:#(commitment|contract|decision|scenario|unresolved|concept)\/([a-z0-9][a-z0-9-]*))?$/;
const SHORT_RE =
  /^([a-z0-9][a-z0-9-]*)#(commitment|contract|decision|scenario|unresolved|concept)\/([a-z0-9][a-z0-9-]*)$/;
const BARE_RE = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Parse and resolve a `<target>` argument (§15.6): a Square id, a concept URI,
 * or a claim URI, in short or full form. Unlike an anchor target, a bare id
 * here always names a Square — the index takes an explicit argument from a
 * human or an agent, so there is nothing to disambiguate against.
 * Throws with an actionable message rather than returning null.
 */
export function resolveIndexTarget(graph: Graph, text: string): IndexTarget {
  let squareId: string;
  let kind: string | undefined;
  let memberId: string | undefined;

  const full = FULL_RE.exec(text);
  const short = full ? null : SHORT_RE.exec(text);
  if (full) {
    squareId = full[1]!;
    kind = full[2];
    memberId = full[3];
  } else if (short) {
    squareId = short[1]!;
    kind = short[2]!;
    memberId = short[3]!;
  } else if (BARE_RE.test(text)) {
    squareId = text;
  } else {
    throw new Error(
      `"${text}" is not a Square id, concept URI or claim URI — write <square-id>, <square-id>#concept/<id> or <square-id>#<facet>/<id> (SPEC §15.6)`
    );
  }

  const square = graph.squares.get(squareId);
  if (!square) throw new Error(`no Square named "${squareId}"`);
  if (kind === undefined) return { kind: 'square', uri: squareUri(squareId), squareId };

  if (kind === 'concept') {
    if (!listConcepts(square).some((c) => c.id === memberId)) {
      throw new Error(`${squareUri(squareId)} declares no concept "${memberId}"`);
    }
    return { kind: 'concept', uri: conceptUri(squareId, memberId!), squareId, conceptId: memberId! };
  }

  const facet = kind as ClaimFacet;
  if (!listClaims(square).some((c) => c.facet === facet && c.id === memberId)) {
    throw new Error(`${squareUri(squareId)} has no ${facet} "${memberId}"`);
  }
  return { kind: 'claim', uri: claimUri(squareId, facet, memberId!), squareId, facet, claimId: memberId! };
}

/**
 * The entries of the forward map scoped to one target (§15.6). A Square scopes
 * to itself plus every concept and claim of it; a concept scopes to itself plus
 * the claims tagged with it; a claim scopes to itself.
 */
export function entriesForScope(graph: Graph, map: SourceMap, target: IndexTarget): IndexEntry[] {
  const square = graph.squares.get(target.squareId);
  const claims = square ? listClaims(square) : [];
  const uris = new Set<string>([target.uri]);
  if (target.kind === 'square') {
    for (const concept of square ? listConcepts(square) : []) uris.add(conceptUri(target.squareId, concept.id));
    for (const claim of claims) uris.add(claim.uri);
  } else if (target.kind === 'concept') {
    for (const claim of claims) {
      if (claim.concepts.includes(target.conceptId!)) uris.add(claim.uri);
    }
  }
  return map.entries.filter((e) => uris.has(e.target));
}

/** Selectors declared *at* one node: the Square top level, or one concept of it. */
function selectorsOf(map: SourceMap, squareId: string, conceptId?: string): SelectorMatch[] {
  return map.selectors.filter((s) =>
    conceptId === undefined
      ? s.scope.kind === 'square' && s.scope.squareId === squareId
      : s.scope.kind === 'concept' && s.scope.squareId === squareId && s.scope.conceptId === conceptId
  );
}

function anchorsOf(map: SourceMap, uri: string): ResolvedAnchor[] {
  return map.resolved
    .filter((r) => r.target.uri === uri)
    .sort((a, b) => (a.anchor.file === b.anchor.file ? a.anchor.line - b.anchor.line : a.anchor.file < b.anchor.file ? -1 : 1));
}

/** Files reached by a target, per §15.5 — the union, not just the direct hits. */
function fileCount(map: SourceMap, uri: string): number {
  return new Set(map.entries.filter((e) => e.target === uri).map((e) => e.path)).size;
}

function nodeLines(
  map: SourceMap,
  uri: string,
  heading: string,
  indent: string,
  selectors: SelectorMatch[],
  anchors: ResolvedAnchor[]
): string[] {
  const lines = [`${indent}${heading} — ${fileCount(map, uri)} file(s)`];
  const inner = `${indent}  `;
  for (const match of selectors) {
    const note = match.selector.note === undefined ? '' : ` — ${match.selector.note.trim()}`;
    const expect = match.selector.expect === undefined ? '' : ` [expect: ${match.selector.expect}]`;
    if (match.unconfined) {
      lines.push(`${inner}selector \`${match.selector.glob}\` — skipped (not a repo-relative glob without "..")`);
      continue;
    }
    lines.push(`${inner}selector \`${match.selector.glob}\`${expect}${note} → ${match.files.length} file(s)`);
    for (const file of match.files) lines.push(`${inner}  ${file}`);
  }
  for (const { anchor } of anchors) {
    const note = anchor.note === undefined ? '' : ` — ${anchor.note}`;
    lines.push(`${inner}anchor ${anchor.file}:${anchor.line} \`${anchor.target}\`${note}`);
  }
  return lines;
}

/**
 * The forward map as text (§15.6): every Square → its concepts → their claims.
 * A claim tagged with several concepts is listed under each of them; claims
 * with no tags are listed directly under their Square. Each node shows the
 * selectors and anchor sites declared *at* it, plus the size of its union.
 */
export function formatForwardIndex(graph: Graph, map: SourceMap, target?: IndexTarget): string {
  const lines: string[] = [];

  /** One claim node. Silent when nothing resolved to it, unless it is the target. */
  const claimNode = (squareId: string, facet: ClaimFacet, id: string, indent: string, force = false): void => {
    const uri = claimUri(squareId, facet, id);
    const anchors = anchorsOf(map, uri);
    if (anchors.length === 0 && !force) return;
    lines.push(...nodeLines(map, uri, `${facet} ${uri}`, indent, [], anchors));
  };

  /** One concept node, followed by the claims tagged with it. */
  const conceptNode = (squareId: string, conceptId: string, indent: string): void => {
    const square = graph.squares.get(squareId)!;
    const concept = listConcepts(square).find((c) => c.id === conceptId)!;
    const uri = conceptUri(squareId, conceptId);
    lines.push(
      ...nodeLines(
        map,
        uri,
        `concept ${uri} (${conceptDisplayName(concept)})`,
        indent,
        selectorsOf(map, squareId, conceptId),
        anchorsOf(map, uri)
      )
    );
    const claims = listClaims(square);
    for (const facet of CLAIM_FACETS) {
      for (const claim of claims) {
        if (claim.facet === facet && claim.concepts.includes(conceptId)) claimNode(squareId, facet, claim.id, `${indent}  `);
      }
    }
  };

  /** One Square node: the Square, its concepts, then its untagged claims. */
  const squareNode = (squareId: string): void => {
    const square = graph.squares.get(squareId)!;
    const uri = squareUri(squareId);
    lines.push(
      ...nodeLines(map, uri, `${uri} (${square.meta.name})`, '', selectorsOf(map, squareId), anchorsOf(map, uri))
    );
    for (const concept of listConcepts(square)) conceptNode(squareId, concept.id, '  ');
    const claims = listClaims(square);
    for (const facet of CLAIM_FACETS) {
      for (const claim of claims) {
        if (claim.facet === facet && claim.concepts.length === 0) claimNode(squareId, facet, claim.id, '  ');
      }
    }
  };

  if (target === undefined) {
    for (const square of [...graph.squares.values()].sort((a, b) => a.meta.id.localeCompare(b.meta.id))) {
      squareNode(square.meta.id);
    }
  } else if (target.kind === 'square') {
    squareNode(target.squareId);
  } else if (target.kind === 'concept') {
    conceptNode(target.squareId, target.conceptId!, '');
  } else {
    claimNode(target.squareId, target.facet!, target.claimId!, '', true);
  }

  return lines.length > 0 ? lines.join('\n') : '(no resolved sources)';
}

/**
 * The reverse map for one file (§15.6): every Square, concept, and claim
 * claiming it, with the selector or anchor responsible. This is the lookup an
 * agent runs before editing a file it did not map itself.
 */
export function formatReverseIndex(map: SourceMap, file: string): string {
  const lines: string[] = [file];
  if (!map.universe.includes(file)) {
    lines.push(
      '  (not in the scan universe — untracked, ignored by scanIgnore, inside the squares directory, or misspelled)'
    );
  }
  const entries = map.entries.filter((e) => e.path === file);
  if (entries.length === 0) {
    lines.push('  (no Square, concept or claim claims this file)');
    return lines.join('\n');
  }
  const width = Math.max(...entries.map((e) => e.target.length));
  for (const entry of entries) {
    const where = entry.line === undefined ? '' : `:${entry.line}`;
    const note = entry.note === undefined ? '' : ` — ${entry.note}`;
    lines.push(`  ${entry.target.padEnd(width)}  ${entry.via} \`${entry.match}\`${where}${note}`);
  }
  return lines.join('\n');
}

export interface IndexQuery {
  target?: string;
  file?: string;
}

/**
 * Normalize a `--file` argument to the spelling the map uses: repo-relative,
 * forward-slash, no `./` prefix. `src/a.ts`, `./src/a.ts`, `docs/../src/a.ts`
 * and an absolute path to the same file all name one entry; a path outside the
 * repository root is an error, not an empty result, because "no Square claims
 * it" would be a misleading answer for a file the map never covers.
 */
export function resolveIndexFile(graph: Graph, text: string): string {
  const root = path.resolve(graph.rootDir);
  const abs = path.resolve(root, text);
  const rel = path.relative(root, abs);
  if (rel === '' || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new Error(
      `--file ${JSON.stringify(text)} is outside the repository root ${root} — the source map covers this repository only (SPEC §15.4, §15.6)`
    );
  }
  return rel.split(path.sep).join('/');
}

/** Shared argument check: `<target>` and `--file` select opposite directions (§15.6). */
export function rejectBothSelectors(query: IndexQuery): void {
  if (query.target !== undefined && query.file !== undefined) {
    throw new Error(
      'index takes a <target> or --file, not both — they select opposite directions of the map (SPEC §15.6)'
    );
  }
}

/** The `--json` payload (§15.6): one entry per resolved pairing, in the defined order. */
export function indexJson(graph: Graph, map: SourceMap, query: IndexQuery): IndexEntry[] {
  rejectBothSelectors(query);
  if (query.file !== undefined) {
    const file = resolveIndexFile(graph, query.file);
    return map.entries.filter((e) => e.path === file);
  }
  if (query.target !== undefined) return entriesForScope(graph, map, resolveIndexTarget(graph, query.target));
  return map.entries;
}

/** The human rendering (§15.6), dispatched the same way as `indexJson`. */
export function indexText(graph: Graph, map: SourceMap, query: IndexQuery): string {
  rejectBothSelectors(query);
  if (query.file !== undefined) return formatReverseIndex(map, resolveIndexFile(graph, query.file));
  if (query.target !== undefined) return formatForwardIndex(graph, map, resolveIndexTarget(graph, query.target));
  return formatForwardIndex(graph, map);
}
