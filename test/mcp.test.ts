// Drives the real MCP server end-to-end: createMcpServer connected to an SDK
// Client over a linked in-memory transport pair, against the demo fixture.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../src/mcp.ts';
import { loadGraph } from '../src/load.ts';
import { compileContext } from '../src/context.ts';
import { PROTOCOL_MD } from '../src/protocol.ts';
import { DEMO } from './helpers.ts';

async function connectedClient(rootDir: string): Promise<Client> {
  const server = createMcpServer({ rootDir });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'squaring-test', version: '0.0.0' });
  await client.connect(clientTransport);
  return client;
}

function textOf(result: unknown): string {
  const content = (result as { content: Array<{ type: string; text: string }> }).content;
  return content.map((c) => c.text).join('');
}

test('the MCP server exposes the nine SPEC §13 tools', async () => {
  const client = await connectedClient(DEMO);
  try {
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    assert.deepEqual(names, [
      'context_pack',
      'get_change',
      'get_graph',
      'get_protocol',
      'get_square',
      'list_squares',
      'scaffold_change',
      'scaffold_square',
      'validate'
    ]);
  } finally {
    await client.close();
  }
});

test('get_protocol returns PROTOCOL_MD and validate reports the clean fixture', async () => {
  const client = await connectedClient(DEMO);
  try {
    const protocol = await client.callTool({ name: 'get_protocol', arguments: {} });
    assert.equal(textOf(protocol), PROTOCOL_MD);

    const validate = await client.callTool({ name: 'validate', arguments: {} });
    assert.equal(textOf(validate), 'OK — no errors, no warnings.');
  } finally {
    await client.close();
  }
});

test('context_pack matches the library compiler byte for byte', async () => {
  const client = await connectedClient(DEMO);
  try {
    const result = await client.callTool({ name: 'context_pack', arguments: { id: 'orders' } });
    assert.equal(textOf(result), compileContext(loadGraph(DEMO), 'orders'));
  } finally {
    await client.close();
  }
});

test('unknown ids come back as isError results, not dropped connections', async () => {
  const client = await connectedClient(DEMO);
  try {
    const result = await client.callTool({ name: 'get_square', arguments: { id: 'ghost' } });
    assert.equal(result.isError, true);
    assert.match(textOf(result), /no Square named "ghost"/);
  } finally {
    await client.close();
  }
});
