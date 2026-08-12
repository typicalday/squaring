// Public library surface of the `squaring` npm package.
// @sq squaring -- everything the published package promises to export

export {
  ID_RE,
  CLAIM_FACETS,
  type ClaimFacet,
  type SquareRef,
  squareUri,
  changeUri,
  claimUri,
  conceptUri,
  parseSquareUri,
  parseChangeUri,
  parseExternalUri,
  extractBodyRefs,
  resolveWikiLinks
} from './ids.ts';

export {
  COMMITMENT_KINDS,
  STRENGTHS,
  EVIDENCE_CLASSES,
  ARCHETYPES,
  CHANGE_TYPES,
  CHANGE_PHASES,
  SquareSchema,
  ChangeSchema,
  type Square,
  type Commitment,
  type Concept,
  type Selector,
  type Change
} from './schema.ts';

export {
  loadGraph,
  resolveSquaresDir,
  readConfig,
  findRepoRoot,
  activeChanges,
  changesTargeting,
  type Diagnostic,
  type SquaringConfig,
  type SquareDoc,
  type ChangeDoc,
  type Graph
} from './load.ts';

export {
  scan,
  scanUniverse,
  parseAnchorLine,
  parseAnchorTarget,
  isConfinedGlob,
  matchesGlob,
  globMatches,
  type Anchor,
  type AnchorTarget,
  type ScanResult,
  type ScanUniverseOptions
} from './scan.ts';

export {
  buildSourceMap,
  listClaims,
  listConcepts,
  conceptDisplayName,
  entriesForTarget,
  entriesForFile,
  filesForTarget,
  type ClaimRecord,
  type IndexEntry,
  type ResolvedAnchor,
  type ResolvedTarget,
  type SelectorMatch,
  type SelectorScope,
  type SourceMap
} from './sources.ts';

export {
  resolveIndexTarget,
  resolveIndexFile,
  entriesForScope,
  formatForwardIndex,
  formatReverseIndex,
  indexJson,
  indexText,
  type IndexQuery,
  type IndexTarget
} from './indexing.ts';

export { validateGraph, hasErrors, formatDiagnostics } from './validate.ts';

export { compileSquarePack, compileChangePack, compileContext, type PackOptions } from './context.ts';

export { squareTemplate, changeTemplate, scaffoldSquare, scaffoldChange, type ScaffoldResult } from './scaffold.ts';

export { initRepo, type InitResult } from './init.ts';

export { PROTOCOL_MD } from './protocol.ts';

export { createMcpServer, startMcpServer } from './mcp.ts';

export { VERSION } from './version.ts';
