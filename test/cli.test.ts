// Runs the real CLI entry (src/cli.ts) as a child process against the demo
// fixture — including from a subdirectory, proving repository-root discovery.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { DEMO } from './helpers.ts';

const CLI = path.join(import.meta.dirname, '..', 'src', 'cli.ts');

function run(args: string[], cwd: string): string {
  return execFileSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
}

test('squaring validate exits 0 from the fixture root and from a subdirectory', () => {
  assert.match(run(['validate'], DEMO), /OK — no errors, no warnings\./);
  // From demo/src the command must walk up to the repo root, not fail on a
  // missing squares/ directory.
  assert.match(run(['validate'], path.join(DEMO, 'src')), /OK — no errors, no warnings\./);
});

test('squaring list prints every Square and Change', () => {
  const out = run(['list'], DEMO);
  assert.match(out, /Squares \(3\):/);
  assert.match(out, /Changes \(2\):/);
  assert.ok(out.includes('orders'));
  assert.ok(out.includes('add-refunds'));
});

test('squaring context prints the compiled pack', () => {
  const out = run(['context', 'orders'], DEMO);
  assert.ok(out.startsWith('# Context Pack — Orders (square://orders)'));
});
