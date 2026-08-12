// Resolution of the graph against the scan universe — SPEC §15.3, §15.5, §15.6.
//
// scan.ts produces raw anchors and the file set; this module resolves anchor
// targets against declared Squares, concepts and claims, applies the union
// rules of §15.5, and emits both the index entries (§15.6) and the findings
// that validate.ts turns into §11 errors 8, 10, 11 and warnings 3, 7 and 8.
// @sq graph-loader#concept/source-resolution -- the §15.5 union and its transpose

import { CLAIM_FACETS, claimUri, conceptUri, squareUri, type ClaimFacet } from './ids.ts';
import type { Diagnostic, Graph, SquareDoc } from './load.ts';
import type { Concept, Selector } from './schema.ts';
import {
  globMatches,
  isConfinedGlob,
  parseAnchorTarget,
  scan,
  type Anchor,
  type AnchorTarget
} from './scan.ts';

/** One claim of one Square, with the concept ids tagging it (§14.3). */
export interface ClaimRecord {
  squareId: string;
  facet: ClaimFacet;
  id: string;
  uri: string;
  concepts: string[];
}

/** What an anchor resolved to, once its target was matched against the graph. */
export interface ResolvedTarget {
  kind: 'square' | 'concept' | 'claim';
  uri: string;
  squareId: string;
  conceptId?: string;
  facet?: ClaimFacet;
  claimId?: string;
}

export interface ResolvedAnchor {
  anchor: Anchor;
  target: ResolvedTarget;
}

/** Where a selector was declared: the Square top level, or one of its concepts. */
export type SelectorScope =
  | { kind: 'square'; squareId: string }
  | { kind: 'concept'; squareId: string; conceptId: string };

export interface SelectorMatch {
  scope: SelectorScope;
  selector: Selector;
  /** universe files the glob matched; empty for a zero-match or unconfined glob */
  files: string[];
  /** absolute or `..`-carrying (§11 error 8): named and skipped, never enumerated */
  unconfined: boolean;
}

/** One resolved (target, file) pairing — the `--json` entry shape of §15.6. */
export interface IndexEntry {
  /** full URI of the Square, concept or claim */
  target: string;
  /** repo-relative path of the file */
  path: string;
  via: 'selector' | 'anchor';
  /** the glob text (selector) or the anchor target text, exactly as written */
  match: string;
  /** 1-based line of the anchor; absent on selector entries */
  line?: number;
  /** the selector's or the anchor's note, when present */
  note?: string;
}

export interface SourceMap {
  /** the scan universe (§15.4) */
  universe: string[];
  /** universe files sniffed binary: selectable, never anchor-read, exempt from `expect` */
  binary: Set<string>;
  /** universe files whose bytes could not be read: selectable, never exempt from `expect`, each §11 warning 8 */
  unreadable: Set<string>;
  /** every anchor found, including the ones that failed to resolve */
  anchors: Anchor[];
  /** anchors whose target resolved to something in the graph */
  resolved: ResolvedAnchor[];
  /** every declared selector with the files it matched */
  selectors: SelectorMatch[];
  /** every resolved pairing, deduped and in the §15.6 order */
  entries: IndexEntry[];
  /** §11 errors 8, 10, 11 and warnings 3, 7, 8 — already attributed */
  findings: Diagnostic[];
}

/** Every claim of a Square, in facet order, with its concept tags. */
export function listClaims(square: SquareDoc): ClaimRecord[] {
  const meta = square.meta;
  const out: ClaimRecord[] = [];
  const push = (facet: ClaimFacet, id: string, concepts: string[] | undefined): void => {
    out.push({ squareId: meta.id, facet, id, uri: claimUri(meta.id, facet, id), concepts: concepts ?? [] });
  };
  for (const c of meta.commitments ?? []) push('commitment', c.id, c.concepts);
  for (const c of meta.contracts?.provides ?? []) push('contract', c.id, c.concepts);
  for (const c of meta.contracts?.consumes ?? []) push('contract', c.id, c.concepts);
  for (const d of meta.decisions ?? []) push('decision', d.id, d.concepts);
  for (const s of meta.scenarios ?? []) push('scenario', s.id, s.concepts);
  for (const u of meta.unresolved ?? []) push('unresolved', u.id, u.concepts);
  return out;
}

/** Concepts declared by a Square (§14.2), in declaration order. */
export function listConcepts(square: SquareDoc): Concept[] {
  return square.meta.owns?.concepts ?? [];
}

/** Display name of a concept: `name`, else derived from the id (§14.2). */
export function conceptDisplayName(concept: Concept): string {
  if (concept.name !== undefined) return concept.name;
  return concept.id
    .split('-')
    .map((word) => (word.length === 0 ? word : word[0]!.toUpperCase() + word.slice(1)))
    .join(' ');
}

function err(file: string | undefined, message: string, line?: number): Diagnostic {
  return line === undefined ? { severity: 'error', file, message } : { severity: 'error', file, line, message };
}

function warn(file: string | undefined, message: string): Diagnostic {
  return { severity: 'warning', file, message };
}

const VIA_ORDER = { selector: 0, anchor: 1 } as const;

function compareEntries(a: IndexEntry, b: IndexEntry): number {
  if (a.target !== b.target) return a.target < b.target ? -1 : 1;
  if (a.path !== b.path) return a.path < b.path ? -1 : 1;
  if (a.via !== b.via) return VIA_ORDER[a.via] - VIA_ORDER[b.via];
  if (a.match !== b.match) return a.match < b.match ? -1 : 1;
  return (a.line ?? 0) - (b.line ?? 0);
}

/** A bare anchor target resolves against Square ids ∪ concept ids (§15.2). */
interface BareCandidate {
  target: ResolvedTarget;
}

function describeScope(scope: SelectorScope): string {
  return scope.kind === 'square'
    ? squareUri(scope.squareId)
    : conceptUri(scope.squareId, scope.conceptId);
}

/**
 * Resolve the whole graph against the scan universe. One pass over the
 * universe serves validate, index and Context Packs alike — callers that need
 * more than one of those build the map once and pass it down.
 */
export function buildSourceMap(graph: Graph): SourceMap {
  const { files: universe, binary, unreadable, anchors } = scan({
    rootDir: graph.rootDir,
    squaresDir: graph.squaresDir,
    scanIgnore: graph.scanIgnore
  });

  // ---- graph lookup tables -------------------------------------------------
  const conceptsBySquare = new Map<string, Map<string, Concept>>();
  const claimsBySquare = new Map<string, ClaimRecord[]>();
  const claimIdsBySquare = new Map<string, Map<ClaimFacet, Set<string>>>();
  /** concept id -> claims of the same Square tagged with it */
  const taggedClaims = new Map<string, ClaimRecord[]>();
  const bareIndex = new Map<string, BareCandidate[]>();

  const addBare = (key: string, target: ResolvedTarget): void => {
    const list = bareIndex.get(key);
    if (list) list.push({ target });
    else bareIndex.set(key, [{ target }]);
  };

  for (const square of graph.squares.values()) {
    const squareId = square.meta.id;
    const concepts = new Map<string, Concept>();
    for (const concept of listConcepts(square)) {
      // A duplicate concept id is §11 error 9 (validate.ts); the first
      // declaration wins here so resolution stays deterministic either way, and
      // the repeat is not indexed a second time — two entries with the same URI
      // would make a bare anchor "ambiguous" between a target and itself.
      if (concepts.has(concept.id)) continue;
      concepts.set(concept.id, concept);
      addBare(concept.id, { kind: 'concept', uri: conceptUri(squareId, concept.id), squareId, conceptId: concept.id });
    }
    conceptsBySquare.set(squareId, concepts);
    addBare(squareId, { kind: 'square', uri: squareUri(squareId), squareId });

    const claims = listClaims(square);
    claimsBySquare.set(squareId, claims);
    const byFacet = new Map<ClaimFacet, Set<string>>();
    for (const facet of CLAIM_FACETS) byFacet.set(facet, new Set());
    for (const claim of claims) {
      byFacet.get(claim.facet)!.add(claim.id);
      for (const tag of claim.concepts) {
        if (!concepts.has(tag)) continue; // undeclared tag is §11 error 9
        const key = `${squareId}#${tag}`;
        const list = taggedClaims.get(key);
        if (list) list.push(claim);
        else taggedClaims.set(key, [claim]);
      }
    }
    claimIdsBySquare.set(squareId, byFacet);
  }

  // ---- entry accumulation --------------------------------------------------
  const entries: IndexEntry[] = [];
  const seen = new Set<string>();
  // The dedup key below separates its fields with the escape sequence for NUL,
  // never a literal NUL byte: §15.4 step 4 sniffs a file binary on a NUL
  // anywhere in its first 8192 bytes, and a literal one here would make this
  // very module unreadable to the scanner — its own anchors dropped and its
  // `expect: annotated` selector silently satisfied. Applies to any source file.
  const add = (entry: IndexEntry): void => {
    const key = `${entry.target}\u0000${entry.path}\u0000${entry.via}\u0000${entry.match}\u0000${entry.line ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push(entry);
  };

  const findings: Diagnostic[] = [];

  // ---- universe-level findings (§11 warnings 7 and 8) ----------------------
  // Both describe the scan universe itself rather than any declaration in the
  // graph, so they are emitted before a single Square is looked at.

  // Warning 7 fires on the empty result, never on a named cause: a `dir`
  // covering the repository root, a `scanIgnore` broad enough to remove
  // everything, and a repository with nothing staged all produce the identical
  // silent failure — source mapping off while every other check passes. The
  // message names the two configurable inputs of §15.4 so the reader can see
  // which one it was (decision `empty-universe-warns` on square://graph-loader).
  if (universe.length === 0) {
    const ignore = graph.scanIgnore;
    const inForce =
      `squares dir ${JSON.stringify(graph.squaresDir)}; ` +
      (ignore.length === 0 ? 'no scanIgnore' : `scanIgnore ${ignore.map((g) => JSON.stringify(g)).join(', ')}`);
    findings.push(
      warn(
        // Only blame the config file when the config is capable of being the
        // cause; an empty universe under stock settings is the repository's
        // state, not a line someone wrote.
        graph.squaresDir === 'squares' && ignore.length === 0 ? undefined : '.squaring.json',
        `the scan universe is empty — no file is visible to the anchor scanner or to any \`sources\` glob, ` +
          `so every selector matches zero files and no anchor can be found (${inForce}) (SPEC §15.4, §11 warning 7)`
      )
    );
  }

  // Warning 8 is per file and independent of error 11: the error says a
  // declaring Square's coverage expectation is unmet, this says the bytes were
  // never examined. A file can raise both, and suppressing one would make it
  // conditional on an unrelated declaration.
  for (const file of [...unreadable].sort()) {
    findings.push(
      warn(
        file,
        'could not be read, so its anchors are unknown and missing from the index and from Context Packs ' +
          '(SPEC §15.4 step 4, §11 warning 8)'
      )
    );
  }

  // ---- anchors -------------------------------------------------------------
  const resolved: ResolvedAnchor[] = [];
  /** file -> Square ids reached by an anchor on it, for `expect: annotated` */
  const anchoredSquares = new Map<string, Set<string>>();

  for (const anchor of anchors) {
    const parsed = parseAnchorTarget(anchor.target);
    if (parsed === null) {
      findings.push(
        err(
          anchor.file,
          anchor.target.length === 0
            ? 'malformed anchor: empty target — write `@sq` then one target: `<square-id>`, `<square-id>#concept/<concept-id>` or `<square-id>#<facet>/<claim-id>` (SPEC §15.2, §11 error 10)'
            : `malformed anchor target ${JSON.stringify(anchor.target)}: not a square:// URI, a <square>#<kind>/<id> reference, or a bare id (SPEC §15.2, §11 error 10)`,
          anchor.line
        )
      );
      continue;
    }

    const target = resolveAnchorTarget(parsed, anchor);
    if (target === null) continue;

    resolved.push({ anchor, target });
    const reached = anchoredSquares.get(anchor.file);
    if (reached) reached.add(target.squareId);
    else anchoredSquares.set(anchor.file, new Set([target.squareId]));

    // §15.5: an anchor on a claim reaches that claim, every concept tagging
    // it, and the Square; an anchor on a concept reaches the concept and the
    // Square. The producing anchor labels every pairing it produces.
    const note = anchor.note === undefined ? {} : { note: anchor.note };
    const emit = (uri: string): void =>
      add({ target: uri, path: anchor.file, via: 'anchor', match: anchor.target, line: anchor.line, ...note });

    emit(target.uri);
    if (target.kind === 'claim') {
      for (const tag of claimTagsOf(target)) emit(conceptUri(target.squareId, tag));
    }
    if (target.kind !== 'square') emit(squareUri(target.squareId));
  }

  function claimTagsOf(target: ResolvedTarget): string[] {
    const claims = claimsBySquare.get(target.squareId) ?? [];
    const claim = claims.find((c) => c.facet === target.facet && c.id === target.claimId);
    const declared = conceptsBySquare.get(target.squareId);
    return (claim?.concepts ?? []).filter((tag) => declared?.has(tag) === true);
  }

  /** Resolve a parsed target, pushing a §11 error 10 finding when it cannot. */
  function resolveAnchorTarget(parsed: AnchorTarget, anchor: Anchor): ResolvedTarget | null {
    const dangling = (why: string): null => {
      findings.push(err(anchor.file, `dangling anchor ${JSON.stringify(anchor.target)}: ${why} (SPEC §11 error 10)`, anchor.line));
      return null;
    };

    if (parsed.kind === 'bare') {
      const candidates = bareIndex.get(parsed.id) ?? [];
      if (candidates.length === 0) {
        return dangling(`no Square or concept named "${parsed.id}"`);
      }
      if (candidates.length > 1) {
        const spelled = candidates.map((c) => c.target.uri).sort().join(', ');
        findings.push(
          err(
            anchor.file,
            `ambiguous anchor ${JSON.stringify(anchor.target)}: names ${candidates.length} targets (${spelled}) — spell the URI (SPEC §15.2, §11 error 10)`,
            anchor.line
          )
        );
        return null;
      }
      return candidates[0]!.target;
    }

    if (!graph.squares.has(parsed.squareId)) {
      return dangling(`Square "${parsed.squareId}" does not exist`);
    }
    if (parsed.kind === 'square') {
      return { kind: 'square', uri: squareUri(parsed.squareId), squareId: parsed.squareId };
    }
    if (parsed.kind === 'concept') {
      if (conceptsBySquare.get(parsed.squareId)?.has(parsed.conceptId) !== true) {
        return dangling(`${squareUri(parsed.squareId)} declares no concept "${parsed.conceptId}"`);
      }
      return {
        kind: 'concept',
        uri: conceptUri(parsed.squareId, parsed.conceptId),
        squareId: parsed.squareId,
        conceptId: parsed.conceptId
      };
    }
    if (claimIdsBySquare.get(parsed.squareId)?.get(parsed.facet)?.has(parsed.claimId) !== true) {
      return dangling(`${squareUri(parsed.squareId)} has no ${parsed.facet} "${parsed.claimId}"`);
    }
    return {
      kind: 'claim',
      uri: claimUri(parsed.squareId, parsed.facet, parsed.claimId),
      squareId: parsed.squareId,
      facet: parsed.facet,
      claimId: parsed.claimId
    };
  }

  // ---- selectors -----------------------------------------------------------
  const selectors: SelectorMatch[] = [];

  for (const square of graph.squares.values()) {
    const squareId = square.meta.id;
    const declared: Array<{ scope: SelectorScope; selector: Selector }> = [];
    for (const selector of square.meta.sources ?? []) {
      declared.push({ scope: { kind: 'square', squareId }, selector });
    }
    for (const concept of listConcepts(square)) {
      for (const selector of concept.sources ?? []) {
        declared.push({ scope: { kind: 'concept', squareId, conceptId: concept.id }, selector });
      }
    }

    for (const { scope, selector } of declared) {
      const scopeUri = describeScope(scope);
      if (!isConfinedGlob(selector.glob)) {
        findings.push(
          err(
            square.file,
            `sources glob ${JSON.stringify(selector.glob)} on ${scopeUri} must be a repo-relative glob without ".." (SPEC §15.3, §11 error 8)`
          )
        );
        selectors.push({ scope, selector, files: [], unconfined: true });
        continue;
      }

      const matched = globMatches(universe, selector.glob);
      selectors.push({ scope, selector, files: matched, unconfined: false });
      if (matched.length === 0) {
        findings.push(
          warn(square.file, `sources glob ${JSON.stringify(selector.glob)} on ${scopeUri} matches no files (SPEC §11 warning 3)`)
        );
      }

      const note = selector.note === undefined ? {} : { note: selector.note };
      for (const file of matched) {
        add({ target: scopeUri, path: file, via: 'selector', match: selector.glob, ...note });
        // files(square) ⊇ files(concept): a concept's selector maps its files
        // into the declaring Square too, labeled with the same selector (§15.5).
        if (scope.kind === 'concept') {
          add({ target: squareUri(squareId), path: file, via: 'selector', match: selector.glob, ...note });
        }
      }

      // expect: annotated coverage (§15.3, §11 error 11).
      if (selector.expect !== 'annotated') continue;
      for (const file of matched) {
        if (binary.has(file)) continue; // a binary can never carry an anchor
        if (anchoredSquares.get(file)?.has(squareId) === true) continue;
        // An unreadable file is not exempt: its anchors are unknown, and
        // treating unknown as satisfied would let a permission error pass the
        // check silently. The message names the read failure so the fix is not
        // mistaken for "add an anchor".
        const why = unreadable.has(file)
          ? 'could not be read, so its anchors are unknown; '
          : '';
        findings.push(
          err(
            file,
            `${why}no anchor resolving into ${squareUri(squareId)}, required by its \`expect: annotated\` selector ${JSON.stringify(selector.glob)}` +
              (scope.kind === 'concept' ? ` on ${scopeUri}` : '') +
              ' (SPEC §15.3, §11 error 11)'
          )
        );
      }
    }
  }

  entries.sort(compareEntries);
  return { universe, binary, unreadable, anchors, resolved, selectors, entries, findings };
}

/** Index entries whose target is exactly `uri`. */
export function entriesForTarget(map: SourceMap, uri: string): IndexEntry[] {
  return map.entries.filter((e) => e.target === uri);
}

/** Index entries for one repo-relative file — the reverse map (§15.6). */
export function entriesForFile(map: SourceMap, file: string): IndexEntry[] {
  return map.entries.filter((e) => e.path === file);
}

/** files(target) per §15.5 — the resolution set of one Square, concept or claim. */
export function filesForTarget(map: SourceMap, uri: string): string[] {
  return [...new Set(entriesForTarget(map, uri).map((e) => e.path))].sort();
}
