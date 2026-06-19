// One-off verification: spawn the built MCP server and call list_comments
// for a task whose thread previously crashed with a null-body comment.
// Usage: node scripts/verify-list-comments.mjs <task_id>
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const taskId = process.argv[2] ?? '18263163';
const mcpConfig = JSON.parse(readFileSync(new URL('../.mcp.json', import.meta.url), 'utf8'));
const { env } = mcpConfig.mcpServers.productive;

const server = spawn('node', ['build/index.js'], {
  env: { ...process.env, ...env },
  stdio: ['pipe', 'pipe', 'inherit'],
});

let buffer = '';
const pending = new Map();
server.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  let idx;
  while ((idx = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.id !== undefined && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});

function request(id, method, params) {
  return new Promise((resolve) => {
    pending.set(id, resolve);
    server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

await request(1, 'initialize', {
  protocolVersion: '2024-11-05',
  capabilities: {},
  clientInfo: { name: 'verify-script', version: '0.0.0' },
});
server.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

const result = await request(2, 'tools/call', {
  name: 'list_comments',
  arguments: { task_id: taskId },
});

if (result.error) {
  console.error('TOOL ERROR:', JSON.stringify(result.error, null, 2));
  process.exitCode = 1;
} else {
  console.log(result.result.content[0].text);
}
server.kill();
