#!/usr/bin/env node
/**
 * Starts the built server over stdio and checks the surface it actually serves.
 *
 * Type-checking and unit tests both pass against source. This is the only step that proves
 * the compiled artifact starts, completes an MCP handshake, and advertises what it should.
 *
 * Makes no API calls, so it runs with a placeholder token and needs no credentials.
 *
 * Usage: node scripts/smoke-test.mjs
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const EXPECTED_TOOL_COUNT = 72;

/** Tools whose annotations a client relies on to gate a destructive call. */
const MUST_BE_DESTRUCTIVE = ['delete_task', 'delete_comment', 'delete_page', 'delete_todo'];

const failures = [];

/** Record a failure rather than throwing, so one run reports everything wrong at once. */
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    console.log(`  FAIL ${label}${detail ? ` (${detail})` : ''}`);
    failures.push(label);
  }
}

const transport = new StdioClientTransport({
  command: 'node',
  args: ['build/index.js'],
  env: {
    ...process.env,
    PRODUCTIVE_API_TOKEN: process.env.PRODUCTIVE_API_TOKEN ?? 'smoke-test-placeholder',
    PRODUCTIVE_ORG_ID: process.env.PRODUCTIVE_ORG_ID ?? '0',
  },
});

const client = new Client({ name: 'smoke-test', version: '1.0.0' }, { capabilities: {} });

try {
  await client.connect(transport);
  console.log('server started and completed the MCP handshake');

  // Instructions. These are silently dropped if they are ever moved back onto the
  // implementation-info object, which is a bug no unit test on the built artifact would see.
  const instructions = client.getInstructions() ?? '';
  check('serves instructions', instructions.length > 0, `${instructions.length} chars`);
  check('instructions carry the task-reading rule', instructions.includes('get_task_overview'));

  // Tools.
  const { tools } = await client.listTools();
  check(
    `serves ${EXPECTED_TOOL_COUNT} tools`,
    tools.length === EXPECTED_TOOL_COUNT,
    `got ${tools.length}`
  );

  const unannotated = tools.filter(t => !t.annotations).map(t => t.name);
  check('every tool is annotated', unannotated.length === 0, unannotated.join(', '));

  const untitled = tools.filter(t => !t.annotations?.title).map(t => t.name);
  check('every tool has a title', untitled.length === 0, untitled.join(', '));

  const byName = new Map(tools.map(t => [t.name, t]));
  for (const name of MUST_BE_DESTRUCTIVE) {
    check(`${name} is flagged destructive`, byName.get(name)?.annotations?.destructiveHint === true);
  }
  check(
    'list_tasks is flagged read-only',
    byName.get('list_tasks')?.annotations?.readOnlyHint === true
  );

  // Every tool needs a schema, or a client cannot call it at all.
  const schemaless = tools.filter(t => !t.inputSchema).map(t => t.name);
  check('every tool has an input schema', schemaless.length === 0, schemaless.join(', '));
} catch (error) {
  console.error('smoke test could not run:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.close().catch(() => {});
}

if (failures.length > 0) {
  console.error(`\n${failures.length} smoke check(s) failed`);
  process.exitCode = 1;
} else if (process.exitCode !== 1) {
  console.log('\nall smoke checks passed');
}
