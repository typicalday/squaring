// Identity and link grammar — SPEC §5.

export const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

export const CLAIM_FACETS = ['commitment', 'contract', 'decision', 'scenario', 'unresolved'] as const;
export type ClaimFacet = (typeof CLAIM_FACETS)[number];

export interface SquareRef {
  squareId: string;
  facet?: ClaimFacet;
  claimId?: string;
}

const SQUARE_URI_RE =
  /^square:\/\/([a-z0-9][a-z0-9-]*)(?:#(commitment|contract|decision|scenario|unresolved)\/([a-z0-9][a-z0-9-]*))?$/;
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

export function parseSquareUri(uri: string): SquareRef | null {
  const m = SQUARE_URI_RE.exec(uri);
  if (!m) return null;
  const ref: SquareRef = { squareId: m[1]! };
  if (m[2]) {
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
const URI_IN_PROSE_RE = /square:\/\/[a-z0-9][a-z0-9-]*(?:#[a-z]+\/[a-z0-9][a-z0-9-]*)?/g;

/** Extract addressable references from a Markdown body (SPEC §5, §11 error 3). */
export function extractBodyRefs(body: string): BodyRefs {
  const wiki = [...body.matchAll(WIKI_RE)].map((m) => m[1]!);
  const uris = [...body.matchAll(URI_IN_PROSE_RE)].map((m) => m[0]);
  return { wiki, uris };
}
