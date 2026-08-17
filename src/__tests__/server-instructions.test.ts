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
import { buildInstructions } from '../server-instructions.js';
import { getTaskDefinition } from '../tools/tasks.js';
import { getTaskOverviewDefinition } from '../tools/task-overview.js';
import { getCommentDefinition } from '../tools/comments.js';

describe('buildInstructions', () => {
  it('routes a task ID to get_task_overview and names the wasteful sequence', () => {
    const text = buildInstructions('686685');

    expect(text).toContain('get_task_overview FIRST');
    expect(text).toMatch(/Do NOT call get_task, list_comments or get_comment first/);
  });

  it('explains the "me" shorthand when a user is configured', () => {
    expect(buildInstructions('686685')).toContain('686685');
    expect(buildInstructions('686685')).toContain('"me"');
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

    // The redirect must come before any mention of what get_task returns, since a model
    // that stops reading after the first clause should already have been sent away.
    expect(d.indexOf('get_task_overview')).toBeLessThan(d.indexOf('ONLY'));
    expect(d).toContain('wasted round trip');
  });

  it('get_comment points at get_task_overview for whole threads', () => {
    expect(getCommentDefinition.description).toContain('get_task_overview');
  });

  it('get_task_overview still claims the entry point', () => {
    expect(getTaskOverviewDefinition.description).toContain('START HERE');
  });
});
