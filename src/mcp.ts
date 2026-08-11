// The Squaring MCP server — SPEC §13. Stdio transport; every tool call
// reloads the graph from the discovered repository root (findRepoRoot walks
// up from the process working directory), so the server never serves stale
// state, needs no file watching, and works when the agent launches it from a
// subdirectory. Scaffold tools resolve the same root, so a scaffold from a
// subdirectory lands in the existing repo instead of starting a second one.
// Tool errors return `isError: true` rather than throwing, so the agent sees
// the message.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod';
import { loadGraph, activeChanges, findRepoRoot, type Graph } from './load.ts';
import { validateGraph, formatDiagnostics } from './validate.ts';
import { compileContext } from './context.ts';
import { scaffoldSquare, scaffoldChange } from './scaffold.ts';
import { PROTOCOL_MD } from './protocol.ts';
import { CHANGE_TYPES } from './schema.ts';
import { VERSION } from './version.ts';

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

function ok(text: string): ToolResult {
  return { content: [{ type: 'text', text }] };
}

function toolError(err: unknown): ToolResult {
  return { content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }], isError: true };
}

function docSource(graph: Graph, file: string): string {
  return `# file: ${file}\n${fs.readFileSync(path.join(graph.rootDir, file), 'utf8')}`;
}

/**
 * Build the MCP server. `options.rootDir` pins the repository root (used by
 * tests); without it, every tool call re-discovers the root from the process
 * working directory at call time.
 */
export function createMcpServer(options?: { rootDir?: string }): McpServer {
  const resolveRoot = (): string => options?.rootDir ?? findRepoRoot(process.cwd()) ?? process.cwd();

  /** Run a tool body against a freshly loaded graph; convert throws to isError results. */
  function withGraph(body: (graph: Graph) => string): ToolResult {
    try {
      return ok(body(loadGraph(resolveRoot())));
    } catch (err) {
      return toolError(err);
    }
  }

  const server = new McpServer({ name: 'squaring', version: VERSION });

  server.registerTool(
    'get_protocol',
    {
      description:
        'The Squaring agent conformance rules (A1–A9) and Change lifecycle. Read this once per session before working in a squared repository.'
    },
    () => ok(PROTOCOL_MD)
  );

  server.registerTool(
    'list_squares',
    {
      description:
        'List every Square (id, name, archetype, partOf, purpose) and every Change (id, name, type, phase) in this repository.'
    },
    () =>
      withGraph((graph) => {
        const lines: string[] = [];
        const squares = [...graph.squares.values()].sort((a, b) => a.meta.id.localeCompare(b.meta.id));
        lines.push(`${squares.length} Square(s):`);
        for (const s of squares) {
          const tags = [s.meta.archetype, s.meta.partOf ? `partOf=${s.meta.partOf}` : undefined].filter(Boolean);
          lines.push(`- square://${s.meta.id} — ${s.meta.name}${tags.length ? ` [${tags.join(', ')}]` : ''}`);
          lines.push(`  ${s.meta.purpose.trim().replace(/\s+/g, ' ')}`);
        }
        const changes = [...graph.changes.values()].sort((a, b) => a.meta.id.localeCompare(b.meta.id));
        lines.push(`${changes.length} Change(s):`);
        for (const c of changes) {
          lines.push(`- change://${c.meta.id} — ${c.meta.name} [${c.meta.type}, ${c.meta.phase}]`);
        }
        if (graph.diagnostics.length > 0) {
          lines.push(`⚠ ${graph.diagnostics.length} file(s) failed to load — run the validate tool.`);
        }
        return lines.join('\n');
      })
  );

  server.registerTool(
    'get_square',
    {
      description:
        'Return the source file of one Square verbatim (YAML frontmatter + body) plus its file path. Edit this file to change the Square, then run validate.',
      inputSchema: { id: z.string().describe('Square id, e.g. "orders"') }
    },
    ({ id }) =>
      withGraph((graph) => {
        const doc = graph.squares.get(id);
        if (!doc) throw new Error(`no Square named "${id}" — use list_squares`);
        return docSource(graph, doc.file);
      })
  );

  server.registerTool(
    'get_change',
    {
      description:
        'Return the source file of one Change verbatim (YAML frontmatter + body) plus its file path. Edit this file to update the Change, then run validate.',
      inputSchema: { id: z.string().describe('Change id, e.g. "core-v0-1"') }
    },
    ({ id }) =>
      withGraph((graph) => {
        const doc = graph.changes.get(id);
        if (!doc) throw new Error(`no Change named "${id}" — use list_squares`);
        return docSource(graph, doc.file);
      })
  );

  server.registerTool(
    'get_graph',
    {
      description:
        'The Square Graph as an adjacency listing: hierarchy (partOf), dependencies, provided/consumed contracts, and active Changes with their targets.'
    },
    () =>
      withGraph((graph) => {
        const lines: string[] = [];
        for (const s of [...graph.squares.values()].sort((a, b) => a.meta.id.localeCompare(b.meta.id))) {
          const meta = s.meta;
          lines.push(`square://${meta.id} (${meta.name}${meta.archetype ? `, ${meta.archetype}` : ''})`);
          if (meta.partOf) lines.push(`  partOf: square://${meta.partOf}`);
          for (const rel of meta.relationships ?? []) {
            lines.push(`  ${rel.type}: ${rel.target}${rel.through ? ` (through ${rel.through})` : ''}`);
          }
          for (const c of meta.contracts?.provides ?? []) lines.push(`  provides: ${c.id}`);
          for (const c of meta.contracts?.consumes ?? []) lines.push(`  consumes: ${c.id} ← ${c.from}`);
        }
        const active = activeChanges(graph);
        if (active.length > 0) {
          lines.push('Active Changes:');
          for (const c of active) {
            lines.push(`  change://${c.meta.id} [${c.meta.type}, ${c.meta.phase}] → ${c.meta.targets.join(', ')}`);
          }
        }
        return lines.length > 0 ? lines.join('\n') : '(empty graph — no Squares yet)';
      })
  );

  server.registerTool(
    'validate',
    {
      description:
        'Validate the Square Graph: schema conformance and referential integrity (SPEC §11). Run after every edit to a .square.md or .change.md file.'
    },
    () => withGraph((graph) => formatDiagnostics(validateGraph(graph)))
  );

  server.registerTool(
    'context_pack',
    {
      description:
        'Compile the Context Pack for a Square or Change — the read-optimized brief (purpose, non-goals, commitments, contracts, decisions, unresolved questions, active Changes). Read it before reading code.',
      inputSchema: {
        id: z.string().describe('Square or Change id, or an explicit square://<id> / change://<id> URI')
      }
    },
    ({ id }) => withGraph((graph) => compileContext(graph, id))
  );

  server.registerTool(
    'scaffold_square',
    {
      description:
        'Create squares/<id>.square.md from the template (errors if the file exists). Then edit the file to fill in purpose, non-goals, commitments.',
      inputSchema: {
        id: z.string().describe('kebab-case id; becomes the filename stem'),
        name: z.string().optional().describe('display name (default: title-cased id)')
      }
    },
    ({ id, name }) => {
      try {
        const result = scaffoldSquare(resolveRoot(), id, name);
        return ok(`created ${result.file} — fill in the TODOs, then run validate`);
      } catch (err) {
        return toolError(err);
      }
    }
  );

  server.registerTool(
    'scaffold_change',
    {
      description:
        'Create squares/changes/<id>.change.md from the template (errors if the file exists). Start one before editing code whose Squares you will touch (rule A2).',
      inputSchema: {
        id: z.string().describe('kebab-case id; becomes the filename stem'),
        name: z.string().optional().describe('display name (default: title-cased id)'),
        type: z.enum(CHANGE_TYPES).optional().describe('evolution (default) | refactor | repair | adoption')
      }
    },
    ({ id, name, type }) => {
      try {
        const result = scaffoldChange(resolveRoot(), id, name, type ?? 'evolution');
        return ok(`created ${result.file} — fill in the TODOs, then run validate`);
      } catch (err) {
        return toolError(err);
      }
    }
  );

  return server;
}

export async function startMcpServer(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout carries the MCP protocol; stderr is the only safe log channel.
  process.stderr.write(`squaring mcp server ready (cwd: ${process.cwd()})\n`);
}
