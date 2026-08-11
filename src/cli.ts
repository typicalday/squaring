// The `squaring` CLI — SPEC §13. Thin wrapper over the library; every
// command loads the graph fresh from the current working directory.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { Command } from 'commander';
import { loadGraph, activeChanges, type Graph } from './load.ts';
import { validateGraph, hasErrors, formatDiagnostics } from './validate.ts';
import { compileContext } from './context.ts';
import { scaffoldSquare, scaffoldChange } from './scaffold.ts';
import { initRepo } from './init.ts';
import { startMcpServer } from './mcp.ts';
import { PROTOCOL_MD } from './protocol.ts';

const VERSION = '0.1.0';

function fail(message: string): never {
  process.stderr.write(`squaring: ${message}\n`);
  process.exit(1);
}

function loadOrFail(): Graph {
  let graph: Graph;
  try {
    graph = loadGraph(process.cwd());
  } catch (err) {
    // e.g. a malformed or out-of-bounds .squaring.json — a diagnostic, not a stack trace
    fail(err instanceof Error ? err.message : String(err));
  }
  // Loading itself only fails hard when the squares directory is missing;
  // per-file errors surface through `validate` and stay visible in other
  // commands' output paths.
  const missingDir = graph.diagnostics.find((d) => d.message.includes('squares directory not found'));
  if (missingDir) fail(missingDir.message);
  return graph;
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

const program = new Command();
program
  .name('squaring')
  .description('Squaring — a semantic control plane for software: Squares, Changes, Context Packs.')
  .version(VERSION);

program
  .command('init')
  .description('Create the squares/ layout, install PROTOCOL.md, and register the MCP server in .mcp.json')
  .action(() => {
    let result: ReturnType<typeof initRepo>;
    try {
      result = initRepo(process.cwd());
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
    for (const f of result.created) process.stdout.write(`created ${f}\n`);
    for (const f of result.updated) process.stdout.write(`updated ${f}\n`);
    if (result.created.length === 0 && result.updated.length === 0) {
      process.stdout.write('nothing to do — already initialized\n');
    }
    for (const note of result.notes) process.stdout.write(`note: ${note}\n`);
  });

program
  .command('validate')
  .description('Validate the Square Graph (schema + referential integrity); exit 1 on errors')
  .action(() => {
    const graph = loadOrFail();
    const diagnostics = validateGraph(graph);
    process.stdout.write(formatDiagnostics(diagnostics) + '\n');
    if (hasErrors(diagnostics)) process.exit(1);
  });

program
  .command('list')
  .description('List all Squares and Changes')
  .action(() => {
    const graph = loadOrFail();
    const squares = [...graph.squares.values()].sort((a, b) => a.meta.id.localeCompare(b.meta.id));
    process.stdout.write(`Squares (${squares.length}):\n`);
    for (const s of squares) {
      const extra = [s.meta.archetype, s.meta.partOf ? `partOf=${s.meta.partOf}` : undefined]
        .filter(Boolean)
        .join('  ');
      process.stdout.write(`  ${pad(s.meta.id, 28)} ${pad(s.meta.name, 32)} ${extra}\n`);
    }
    const changes = [...graph.changes.values()].sort((a, b) => a.meta.id.localeCompare(b.meta.id));
    process.stdout.write(`Changes (${changes.length}):\n`);
    for (const c of changes) {
      process.stdout.write(`  ${pad(c.meta.id, 28)} ${pad(c.meta.name, 32)} ${c.meta.type}  ${c.meta.phase}\n`);
    }
  });

program
  .command('show')
  .argument('<id>', 'Square or Change id, or square:// / change:// URI')
  .description('Print the source file for a Square or Change (file path, then verbatim content)')
  .action((rawId: string) => {
    const graph = loadOrFail();
    let id = rawId;
    let kind: 'square' | 'change' | null = null;
    if (rawId.startsWith('square://')) {
      id = rawId.slice('square://'.length).split('#')[0]!;
      kind = 'square';
    } else if (rawId.startsWith('change://')) {
      id = rawId.slice('change://'.length);
      kind = 'change';
    } else if (graph.squares.has(rawId) && graph.changes.has(rawId)) {
      fail(`"${rawId}" names both a Square and a Change — use square://${rawId} or change://${rawId}`);
    } else if (graph.squares.has(rawId)) {
      kind = 'square';
    } else if (graph.changes.has(rawId)) {
      kind = 'change';
    }
    const doc = kind === 'square' ? graph.squares.get(id) : kind === 'change' ? graph.changes.get(id) : undefined;
    if (!doc) fail(`no Square or Change named "${rawId}"`);
    process.stdout.write(`# file: ${doc.file}\n`);
    process.stdout.write(fs.readFileSync(path.join(graph.rootDir, doc.file), 'utf8'));
  });

program
  .command('graph')
  .description('Print the Square Graph as an adjacency listing (hierarchy, dependencies, contracts, Changes)')
  .action(() => {
    const graph = loadOrFail();
    const squares = [...graph.squares.values()].sort((a, b) => a.meta.id.localeCompare(b.meta.id));
    for (const s of squares) {
      const meta = s.meta;
      process.stdout.write(`square://${meta.id}  (${meta.name}${meta.archetype ? `, ${meta.archetype}` : ''})\n`);
      if (meta.partOf) process.stdout.write(`  partOf: square://${meta.partOf}\n`);
      for (const rel of meta.relationships ?? []) {
        process.stdout.write(`  ${rel.type}: ${rel.target}${rel.through ? ` (through ${rel.through})` : ''}\n`);
      }
      for (const c of meta.contracts?.provides ?? []) process.stdout.write(`  provides: ${c.id}\n`);
      for (const c of meta.contracts?.consumes ?? []) process.stdout.write(`  consumes: ${c.id} ← ${c.from}\n`);
    }
    const active = activeChanges(graph);
    if (active.length > 0) {
      process.stdout.write('Active Changes:\n');
      for (const c of active) {
        process.stdout.write(`  change://${c.meta.id}  [${c.meta.type}, ${c.meta.phase}] → ${c.meta.targets.join(', ')}\n`);
      }
    }
  });

program
  .command('context')
  .argument('<id>', 'Square or Change id, or square:// / change:// URI')
  .description('Compile and print the Context Pack for a Square or Change')
  .action((id: string) => {
    const graph = loadOrFail();
    try {
      process.stdout.write(compileContext(graph, id) + '\n');
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
  });

program
  .command('protocol')
  .description('Print the agent conformance protocol (same content as squares/PROTOCOL.md)')
  .action(() => {
    process.stdout.write(PROTOCOL_MD);
  });

const newCommand = program.command('new').description('Scaffold a new Square or Change file');

newCommand
  .command('square')
  .argument('<id>', 'kebab-case id (also the filename stem)')
  .option('--name <name>', 'display name (default: title-cased id)')
  .description('Create squares/<id>.square.md from the template')
  .action((id: string, options: { name?: string }) => {
    try {
      const result = scaffoldSquare(process.cwd(), id, options.name);
      process.stdout.write(`created ${result.file} — fill in the TODOs, then run \`squaring validate\`\n`);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
  });

newCommand
  .command('change')
  .argument('<id>', 'kebab-case id (also the filename stem)')
  .option('--name <name>', 'display name (default: title-cased id)')
  .option('--type <type>', 'evolution | refactor | repair | adoption', 'evolution')
  .description('Create squares/changes/<id>.change.md from the template')
  .action((id: string, options: { name?: string; type: string }) => {
    try {
      const result = scaffoldChange(process.cwd(), id, options.name, options.type);
      process.stdout.write(`created ${result.file} — fill in the TODOs, then run \`squaring validate\`\n`);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
  });

program
  .command('mcp')
  .description('Start the Squaring MCP server on stdio (register via `squaring init` / .mcp.json)')
  .action(async () => {
    await startMcpServer();
  });

await program.parseAsync(process.argv);
