// Single source of truth for the tool version: package.json. createRequire
// resolves ../package.json correctly from both src/ (native type stripping)
// and dist/ (tsc output), so the CLI and MCP server can never drift from the
// published version.
// @sq squaring#concept/distribution -- the version string every face reports, read from the manifest

import { createRequire } from 'node:module';

export const VERSION: string = (createRequire(import.meta.url)('../package.json') as { version: string }).version;
