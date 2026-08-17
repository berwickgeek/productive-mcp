/**
 * @fileoverview Guards the cross-tool routing rule that stops a client calling get_task
 *               and then get_task_overview for the same task.
 *
 * The rule lives in the MCP `instructions` field rather than a tool description, because a
 * model weighs each tool description on its own and the literal name match wins. Tool
 * descriptions still carry a matching redirect as a second line of defence.
 *
 * @module __tests__/server-instructions.test
 */

import { describe, it, expect } from 'vitest';
import { SERVER_INFO, buildInstructions, buildServerOptions } from '../server-instructions.js';
import { getTaskDefinition } from '../tools/tasks.js';
import { getTaskOverviewDefinition } from '../tools/task-overview.js';
import { getCommentDefinition } from '../tools/comments.js';

describe('buildServerOptions', () => {
  // The original bug: guidance was put on the Implementation object as `description`, which
  // the SDK never reads. These two assertions are the regression guard for that shape.
  it('puts the instructions on ServerOptions, where the SDK reads them', () => {
    const options = buildServerOptions('686685');

    expect(typeof options.instructions).toBe('string');
    expect(options.instructions).toContain('get_task_overview');
  });

  it('keeps guidance off the Implementation object, where it would be dropped', () => {
    expect(Object.keys(SERVER_INFO).sort()).toEqual(['name', 'version']);
  });

  it('still declares the tool and prompt capabilities', () => {
    expect(buildServerOptions('686685').capabilities).toMatchObject({ tools: {}, prompts: {} });
  });
});

describe('buildInstructions', () => {
  it('routes a task ID to get_task_overview and names the wasteful sequence', () => {
    const text = buildInstructions('686685');

    expect(text).toContain('get_task_overview FIRST');
    expect(text).toMatch(/Do NOT call get_task, list_comments or get_comment first/);
  });

  it('sends deeper comment history to comment_limit rather than list_comments', () => {
    expect(buildInstructions('686685')).toContain('comment_limit');
  });

  it('names only the tools that actually resolve "me", and routes listing to my_tasks', () => {
    const text = buildInstructions('686685');

    expect(text).toContain('686685');
    // These four resolve "me" internally; list_tasks forwards it raw to the API.
    for (const tool of ['create_task', 'update_task_assignment', 'create_time_entry', 'list_time_entries']) {
      expect(text).toContain(tool);
    }
    expect(text).toContain('my_tasks');
    expect(text).toMatch(/list_tasks forwards assignee_id/);
  });

  it('says the shorthand is unavailable when no user is configured', () => {
    const text = buildInstructions(undefined);

    expect(text).toContain('PRODUCTIVE_USER_ID');
    expect(text).not.toContain('assignee_id');
  });
});

describe('task-reading tool descriptions', () => {
  it('get_task points at get_task_overview before describing itself', () => {
    const d = getTaskDefinition.description;
    const redirect = d.indexOf('get_task_overview');
    const caveat = d.indexOf('ONLY');

    // Both must be present: a bare `redirect < caveat` passes at -1 if the redirect is
    // deleted outright, which is the exact drift this test exists to catch.
    expect(redirect).toBeGreaterThanOrEqual(0);
    expect(caveat).toBeGreaterThanOrEqual(0);
    // A model that stops reading after the first clause should already have been sent away.
    expect(redirect).toBeLessThan(caveat);
    expect(d).toContain('wasted round trip');
  });

  it('get_comment points at get_task_overview for whole threads', () => {
    expect(getCommentDefinition.description).toContain('get_task_overview');
  });

  it('get_task_overview still claims the entry point', () => {
    expect(getTaskOverviewDefinition.description).toContain('START HERE');
  });
});
