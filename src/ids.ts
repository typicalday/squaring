// Identity and link grammar — SPEC §5.
// @sq resource-model#concept/uri-grammar -- ids, square:// and change:// URIs, claim URIs, concept URIs, [[wiki]] links

export const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

export const CLAIM_FACETS = ['commitment', 'contract', 'decision', 'scenario', 'unresolved'] as const;
export type ClaimFacet = (typeof CLAIM_FACETS)[number];

export interface SquareRef {
  squareId: string;
  facet?: ClaimFacet;
  claimId?: string;
  /** set instead of facet/claimId for a concept URI: square://<id>#concept/<cid> (§5, §14.2) */
  conceptId?: string;
}

// `concept` is a fragment kind alongside the five claim facets (§5, §14.2).
// It is deliberately *not* a member of CLAIM_FACETS: a concept is not a claim,
// so nothing that consumes a facet (suspensions, evidenceClass) can reach it.
const SQUARE_URI_RE =
  /^square:\/\/([a-z0-9][a-z0-9-]*)(?:#(commitment|contract|decision|scenario|unresolved|concept)\/([a-z0-9][a-z0-9-]*))?$/;
const CHANGE_URI_RE = /^change:\/\/([a-z0-9][a-z0-9-]*)$/;
const EXTERNAL_URI_RE = /^external:\/\/([a-z0-9][a-z0-9-]*)$/;

export function squareUri(id: string): string {
  return `square://${id}`;
}

export function changeUri(id: string): string {
  return `change://${id}`;
}

export function claimUri(squareId: string, facet: ClaimFacet, claimId: string): string {
  return `square://${squareId}#${facet}/${claimId}`;
}

export function conceptUri(squareId: string, conceptId: string): string {
  return `square://${squareId}#concept/${conceptId}`;
}

export function parseSquareUri(uri: string): SquareRef | null {
  const m = SQUARE_URI_RE.exec(uri);
  if (!m) return null;
  const ref: SquareRef = { squareId: m[1]! };
  if (m[2] === 'concept') {
    ref.conceptId = m[3]!;
  } else if (m[2]) {
    ref.facet = m[2] as ClaimFacet;
    ref.claimId = m[3]!;
  }
  return ref;
}

export function parseChangeUri(uri: string): string | null {
  const m = CHANGE_URI_RE.exec(uri);
  return m ? m[1]! : null;
}

export function parseExternalUri(uri: string): string | null {
  const m = EXTERNAL_URI_RE.exec(uri);
  return m ? m[1]! : null;
}

export interface BodyRefs {
  /** ids referenced as [[id]] wiki links */
  wiki: string[];
  /** full square:// URIs found in prose */
  uris: string[];
}

const WIKI_RE = /\[\[([a-z0-9][a-z0-9-]*)\]\]/g;
// The fragment kind is matched loosely (`[a-z]+`, not the closed set) on
// purpose: a prose URI with a misspelled fragment kind is still extracted, so
// resolveRef reports it as a broken reference (§11 error 3) instead of the
// scanner silently dropping it. `#concept/` is inside that loose set and is
// now a valid kind — parseSquareUri accepts it (§5, §14.2), which is what
// keeps a legitimate concept link in prose from being rejected as malformed.
const URI_IN_PROSE_RE = /square:\/\/[a-z0-9][a-z0-9-]*(?:#[a-z]+\/[a-z0-9][a-z0-9-]*)?/g;

/** Extract addressable references from a Markdown body (SPEC §5, §11 error 3). */
export function extractBodyRefs(body: string): BodyRefs {
  const wiki = [...body.matchAll(WIKI_RE)].map((m) => m[1]!);
  const uris = [...body.matchAll(URI_IN_PROSE_RE)].map((m) => m[0]);
  return { wiki, uris };
}

/** Replace `[[id]]` authoring sugar with the canonical `square://id` URI (SPEC §5). */
export function resolveWikiLinks(text: string): string {
  return text.replace(WIKI_RE, (_match, id: string) => `square://${id}`);
}
