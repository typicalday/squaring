// Public library surface of @typicalday/squaring.

export {
  ID_RE,
  CLAIM_FACETS,
  type ClaimFacet,
  type SquareRef,
  squareUri,
  changeUri,
  claimUri,
  parseSquareUri,
  parseChangeUri,
  parseExternalUri,
  extractBodyRefs
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
  type Change
} from './schema.ts';

export {
  loadGraph,
  resolveSquaresDir,
  activeChanges,
  changesTargeting,
  type Diagnostic,
  type SquareDoc,
  type ChangeDoc,
  type Graph
} from './load.ts';

export { validateGraph, hasErrors, formatDiagnostics } from './validate.ts';

export { compileSquarePack, compileChangePack, compileContext } from './context.ts';

export { squareTemplate, changeTemplate, scaffoldSquare, scaffoldChange, type ScaffoldResult } from './scaffold.ts';

export { initRepo, type InitResult } from './init.ts';

export { PROTOCOL_MD } from './protocol.ts';

export { startMcpServer } from './mcp.ts';
