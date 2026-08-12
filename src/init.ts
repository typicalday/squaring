// `squaring init` — SPEC §13. Creates the squares directory, installs
// PROTOCOL.md, and registers the MCP server in .mcp.json. Idempotent: safe
// to re-run; never overwrites an existing PROTOCOL.md silently (it rewrites
// it only because the file is tool-owned documentation, versioned with the
// tool).
// @sq cli -- `squaring init`, one of the two writing commands

import fs from 'node:fs';
import path from 'node:path';
import { resolveSquaresDir, refuseSymlinkTarget } from './load.ts';
import { PROTOCOL_MD } from './protocol.ts';

export interface InitResult {
  created: string[];
  updated: string[];
  notes: string[];
}

export function initRepo(rootDir: string): InitResult {
  const result: InitResult = { created: [], updated: [], notes: [] };
  const dir = resolveSquaresDir(rootDir);
  const absSquares = path.join(rootDir, dir);
  const absChanges = path.join(absSquares, 'changes');

  // resolveSquaresDir realpath-validates the top-level squares dir; guard every
  // nested write target below it (the changes/ subdir and the leaf files this
  // function creates) so a hostile clone cannot pre-place a symlink that
  // redirects a write outside the repository.
  refuseSymlinkTarget(absChanges, `${dir}/changes`);

  if (!fs.existsSync(absSquares)) {
    fs.mkdirSync(absSquares, { recursive: true });
    result.created.push(`${dir}/`);
  }
  if (!fs.existsSync(absChanges)) {
    fs.mkdirSync(absChanges, { recursive: true });
    result.created.push(`${dir}/changes/`);
  }

  const protocolPath = path.join(absSquares, 'PROTOCOL.md');
  refuseSymlinkTarget(protocolPath, `${dir}/PROTOCOL.md`);
  const existed = fs.existsSync(protocolPath);
  const current = existed ? fs.readFileSync(protocolPath, 'utf8') : null;
  if (current !== PROTOCOL_MD) {
    fs.writeFileSync(protocolPath, PROTOCOL_MD);
    (existed ? result.updated : result.created).push(`${dir}/PROTOCOL.md`);
  }

  // Register the MCP server in .mcp.json (project-scope config for agent CLIs).
  const mcpPath = path.join(rootDir, '.mcp.json');
  refuseSymlinkTarget(mcpPath, '.mcp.json');
  const isPlainObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);
  let mcpConfig: Record<string, unknown> = {};
  let mcpExisted = false;
  let mcpWritable = true;
  if (fs.existsSync(mcpPath)) {
    mcpExisted = true;
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
    } catch {
      result.notes.push('.mcp.json exists but is not valid JSON — left untouched; add the squaring server manually.');
      mcpWritable = false;
    }
    if (mcpWritable) {
      // Valid JSON can still be the wrong shape (an array, a string, or a
      // non-object mcpServers). Refuse to touch those rather than throw.
      if (isPlainObject(parsed) && (parsed['mcpServers'] === undefined || isPlainObject(parsed['mcpServers']))) {
        mcpConfig = parsed;
      } else {
        result.notes.push(
          '.mcp.json exists but does not have the expected { "mcpServers": { ... } } shape — left untouched; add the squaring server manually.'
        );
        mcpWritable = false;
      }
    }
  }
  if (mcpWritable) {
    const servers = isPlainObject(mcpConfig['mcpServers']) ? mcpConfig['mcpServers'] : {};
    mcpConfig['mcpServers'] = servers;
    if (servers['squaring'] === undefined) {
      servers['squaring'] = { command: 'squaring', args: ['mcp'] };
      fs.writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2) + '\n');
      (mcpExisted ? result.updated : result.created).push('.mcp.json');
    }
  }

  result.notes.push(
    `Point your agent at ${dir}/PROTOCOL.md (e.g. reference it from CLAUDE.md or AGENTS.md) so the conformance rules load with every session.`
  );
  result.notes.push(`Author your first Square with: squaring new square <id>`);
  return result;
}
