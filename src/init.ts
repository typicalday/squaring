// `squaring init` — SPEC §13. Creates the squares directory, installs
// PROTOCOL.md, and registers the MCP server in .mcp.json. Idempotent: safe
// to re-run; never overwrites an existing PROTOCOL.md silently (it rewrites
// it only because the file is tool-owned documentation, versioned with the
// tool).

import fs from 'node:fs';
import path from 'node:path';
import { resolveSquaresDir } from './load.ts';
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

  if (!fs.existsSync(absSquares)) {
    fs.mkdirSync(absSquares, { recursive: true });
    result.created.push(`${dir}/`);
  }
  if (!fs.existsSync(absChanges)) {
    fs.mkdirSync(absChanges, { recursive: true });
    result.created.push(`${dir}/changes/`);
  }

  const protocolPath = path.join(absSquares, 'PROTOCOL.md');
  const existed = fs.existsSync(protocolPath);
  const current = existed ? fs.readFileSync(protocolPath, 'utf8') : null;
  if (current !== PROTOCOL_MD) {
    fs.writeFileSync(protocolPath, PROTOCOL_MD);
    (existed ? result.updated : result.created).push(`${dir}/PROTOCOL.md`);
  }

  // Register the MCP server in .mcp.json (project-scope config for agent CLIs).
  const mcpPath = path.join(rootDir, '.mcp.json');
  let mcpConfig: { mcpServers?: Record<string, unknown> } = {};
  let mcpExisted = false;
  if (fs.existsSync(mcpPath)) {
    mcpExisted = true;
    try {
      mcpConfig = JSON.parse(fs.readFileSync(mcpPath, 'utf8')) as typeof mcpConfig;
    } catch {
      result.notes.push('.mcp.json exists but is not valid JSON — left untouched; add the squaring server manually.');
      mcpConfig = {};
      mcpExisted = false; // prevent write below from clobbering the broken file
    }
  }
  if (mcpExisted || !fs.existsSync(mcpPath)) {
    mcpConfig.mcpServers ??= {};
    if (mcpConfig.mcpServers['squaring'] === undefined) {
      mcpConfig.mcpServers['squaring'] = { command: 'squaring', args: ['mcp'] };
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
