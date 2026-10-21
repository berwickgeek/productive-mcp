#!/usr/bin/env node
/**
 * End-to-end check of upload_attachment against the live API, through the built server.
 *
 * Uploads the given files to a task with upload_attachment, downloads each one back with
 * get_attachment, and compares SHA-256 of the local file with the downloaded copy. An
 * attachment record existing proves nothing: Productive creates one with a URL before any
 * bytes arrive. Only a matching hash is a pass.
 *
 * Writes to Productive. Run it from the repo root so the server finds .env, and point it at
 * a task you own.
 *
 * Usage: node scripts/verify-upload.mjs <task_id> <absolute file path>...
 */

import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const [taskId, ...filePaths] = process.argv.slice(2);
if (!taskId || filePaths.length === 0) {
  console.error('Usage: node scripts/verify-upload.mjs <task_id> <absolute file path>...');
  process.exit(2);
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

const transport = new StdioClientTransport({ command: 'node', args: ['build/index.js'], env: process.env });
const client = new Client({ name: 'verify-upload', version: '1.0.0' }, { capabilities: {} });

let failed = false;
try {
  await client.connect(transport);

  const upload = await client.callTool({
    name: 'upload_attachment',
    arguments: { file_paths: filePaths, task_id: taskId },
  });
  const uploadText = upload.content[0].text;
  console.log(uploadText);
  if (upload.isError) throw new Error('upload_attachment returned an error');

  const ids = [...uploadText.matchAll(/- ID (\d+): /g)].map((m) => m[1]);
  if (ids.length !== filePaths.length) {
    throw new Error(`expected ${filePaths.length} attachment ids, got ${ids.length}`);
  }

  const download = await client.callTool({ name: 'get_attachment', arguments: { attachment_ids: ids } });
  const downloadText = download.content[0].text;
  const saved = [...downloadText.matchAll(/Saved to: (.+)/g)].map((m) => m[1].trim());

  console.log('');
  filePaths.forEach((localPath, i) => {
    const local = sha256(readFileSync(localPath));
    const remote = saved[i] ? sha256(readFileSync(saved[i])) : '(not downloaded)';
    const match = local === remote;
    if (!match) failed = true;
    console.log(`${match ? 'MATCH   ' : 'MISMATCH'} attachment ${ids[i]}  ${localPath}`);
    console.log(`         local  ${local}`);
    console.log(`         remote ${remote}`);
  });
} catch (error) {
  failed = true;
  console.error(`verify-upload failed: ${error.message}`);
} finally {
  await client.close();
}

process.exit(failed ? 1 : 0);
