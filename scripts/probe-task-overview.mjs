/**
 * Manual probe: run get_task_overview against the live Productive API.
 * Usage: node scripts/probe-task-overview.mjs <task_id> [comment_limit]
 */
import { getTaskOverviewTool } from '../build/tools/task-overview.js';
import { ProductiveAPIClient } from '../build/api/client.js';
import { getConfig } from '../build/config/index.js';

const [taskId, commentLimit] = process.argv.slice(2);
if (!taskId) {
  console.error('Usage: node scripts/probe-task-overview.mjs <task_id> [comment_limit]');
  process.exit(1);
}

const client = new ProductiveAPIClient(getConfig());
const result = await getTaskOverviewTool(client, {
  task_id: taskId,
  ...(commentLimit ? { comment_limit: Number(commentLimit) } : {}),
});

const text = result.content[0].text;
console.log(text);
console.error(`\n[probe] ${text.length} chars, roughly ${Math.round(text.length / 4)} tokens`);
