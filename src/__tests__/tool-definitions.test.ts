/**
 * @fileoverview Guards the advertised tool surface against self-inconsistency.
 * @module __tests__/tool-definitions.test
 */

import { describe, it, expect } from 'vitest';
import { toolDefinitions } from '../server.js';

const TOOL_NAMES = new Set(toolDefinitions.map((tool) => tool.name));

/**
 * Prefixes used by this server's tool names. A snake_case token starting with
 * one of these inside a description is almost certainly meant to be a tool
 * reference rather than prose.
 */
const TOOL_NAME_PREFIXES = [
  'list_',
  'get_',
  'create_',
  'update_',
  'delete_',
  'add_',
  'move_',
  'copy_',
  'archive_',
  'restore_',
  'reposition_',
  'pin_',
  'unpin_',
  'my_',
];

/** Every parameter name across every tool, so we do not mistake one for a tool. */
const PARAMETER_NAMES = new Set(
  toolDefinitions.flatMap((tool) =>
    Object.keys((tool.inputSchema as { properties?: Record<string, unknown> }).properties ?? {})
  )
);

/** Pull the snake_case tokens out of a tool definition that look like tool names. */
function extractToolReferences(tool: (typeof toolDefinitions)[number]): string[] {
  const blob = `${tool.description} ${JSON.stringify(tool.inputSchema)}`;
  const tokens = blob.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? [];
  return [...new Set(tokens)].filter(
    (token) => TOOL_NAME_PREFIXES.some((prefix) => token.startsWith(prefix)) && !PARAMETER_NAMES.has(token)
  );
}

describe('tool definitions', () => {
  it('advertises tools with unique names', () => {
    expect(TOOL_NAMES.size).toBe(toolDefinitions.length);
  });

  it('gives every tool a name and a description', () => {
    for (const tool of toolDefinitions) {
      expect(tool.name, 'every tool needs a name').toBeTruthy();
      expect(tool.description, `${tool.name} needs a description`).toBeTruthy();
    }
  });

  it('never points at a tool that does not exist', () => {
    const dangling: Array<{ tool: string; reference: string }> = [];

    for (const tool of toolDefinitions) {
      for (const reference of extractToolReferences(tool)) {
        if (!TOOL_NAMES.has(reference)) {
          dangling.push({ tool: tool.name, reference });
        }
      }
    }

    expect(dangling).toEqual([]);
  });

  it('describes the timesheet workflow using real tool names', () => {
    const createTimeEntry = toolDefinitions.find((tool) => tool.name === 'create_time_entry');
    expect(createTimeEntry).toBeDefined();
    expect(createTimeEntry!.description).toContain('get_project_tasks');
    expect(createTimeEntry!.description).not.toContain('list_project_tasks');
  });
});
