/**
 * @fileoverview Guards the behaviour hints on the tool surface.
 *
 * Two things matter here. Every registered tool must be classified, so a new one cannot ship
 * looking as harmless as list_tasks. And the destructive set must be pinned by name, so
 * flipping delete_task to read-only is a test failure rather than a quiet loss of the only
 * signal a client has for gating it.
 *
 * @module tools/__tests__/annotations.test
 */

import { describe, it, expect } from 'vitest';
import { toolDefinitions } from '../../server.js';
import { TOOL_ANNOTATIONS, assertAnnotationsCover, withAnnotations } from '../annotations.js';

const names = toolDefinitions.map(d => d.name);

/** Every tool that removes or overwrites existing data. Changing this list should be deliberate. */
const DESTRUCTIVE = [
  'archive_folder',
  'archive_task_list',
  'delete_comment',
  'delete_page',
  'delete_task',
  'delete_task_dependency',
  'delete_todo',
  'update_comment',
  'update_folder',
  'update_page',
  'update_task_assignment',
  'update_task_details',
  'update_task_list',
  'update_task_sprint',
  'update_task_status',
  'update_todo',
];

describe('annotation coverage', () => {
  it('classifies every registered tool, with no entries for tools that no longer exist', () => {
    expect(assertAnnotationsCover(names)).toEqual({ missing: [], orphaned: [] });
  });

  it('covers the whole surface', () => {
    expect(names.length).toBe(72);
    expect(Object.keys(TOOL_ANNOTATIONS)).toHaveLength(72);
  });

  it('gives every tool a human-readable title', () => {
    for (const [name, a] of Object.entries(TOOL_ANNOTATIONS)) {
      expect(a.title, name).toBeTruthy();
    }
  });
});

describe('classification', () => {
  it('flags exactly the tools that remove or overwrite data', () => {
    const flagged = Object.entries(TOOL_ANNOTATIONS)
      .filter(([, a]) => a.destructiveHint)
      .map(([n]) => n)
      .sort();

    expect(flagged).toEqual(DESTRUCTIVE);
  });

  it('never marks a tool both read-only and destructive', () => {
    for (const [name, a] of Object.entries(TOOL_ANNOTATIONS)) {
      if (a.readOnlyHint) {
        expect(a.destructiveHint, name).toBeFalsy();
      }
    }
  });

  it('treats every delete_ and archive_ tool as destructive', () => {
    for (const name of names.filter(n => n.startsWith('delete_') || n.startsWith('archive_'))) {
      expect(TOOL_ANNOTATIONS[name].destructiveHint, name).toBe(true);
    }
  });

  it('treats every list_ and get_ tool as read-only', () => {
    for (const name of names.filter(n => n.startsWith('list_') || n.startsWith('get_'))) {
      expect(TOOL_ANNOTATIONS[name].readOnlyHint, name).toBe(true);
    }
  });

  it('marks creates as non-idempotent, since each call makes another one', () => {
    for (const name of names.filter(n => n.startsWith('create_') || n.startsWith('copy_'))) {
      expect(TOOL_ANNOTATIONS[name].idempotentHint, name).toBe(false);
      expect(TOOL_ANNOTATIONS[name].destructiveHint, name).toBe(false);
    }
  });

  it('marks reads as open-world, because Productive is shared with other people', () => {
    expect(TOOL_ANNOTATIONS.list_tasks.openWorldHint).toBe(true);
  });
});

describe('withAnnotations', () => {
  it('attaches the hints to every definition', () => {
    const annotated = withAnnotations(toolDefinitions);

    expect(annotated).toHaveLength(toolDefinitions.length);
    for (const d of annotated) {
      expect(d.annotations, d.name).toBeDefined();
    }
  });

  it('distinguishes delete_task from list_tasks, which was the whole problem', () => {
    const byName = Object.fromEntries(withAnnotations(toolDefinitions).map(d => [d.name, d.annotations]));

    expect(byName.list_tasks?.readOnlyHint).toBe(true);
    expect(byName.delete_task?.readOnlyHint).toBe(false);
    expect(byName.delete_task?.destructiveHint).toBe(true);
  });

  it('leaves a definition that carries its own annotations untouched', () => {
    const own = { name: 'list_tasks', annotations: { title: 'Bespoke' } };

    expect(withAnnotations([own])[0].annotations).toEqual({ title: 'Bespoke' });
  });
});
