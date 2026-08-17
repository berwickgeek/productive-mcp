/**
 * @fileoverview Behaviour hints for every registered tool.
 *
 * Without these, a client cannot tell delete_task from list_tasks: both are just a name and a
 * schema, so nothing can gate the destructive ones or safely retry the idempotent ones.
 *
 * Kept as one table rather than scattered across the definition files so the safety
 * classification can be read and audited in a single place. `assertAnnotationsCover` is
 * called by a test, so a new tool cannot ship unclassified.
 *
 * These are HINTS. The SDK is explicit that clients must not treat them as a security
 * boundary, and nothing here replaces a real confirmation gate on a destructive tool.
 *
 * The policy, applied consistently below:
 *
 * - `readOnlyHint`  true when the call changes nothing in Productive.
 * - `destructiveHint` true when it removes or overwrites existing data (delete, archive, and
 *   any update that replaces a value). False when the change is purely additive, which is
 *   what the spec means by the distinction between an insert and an update or delete.
 * - `idempotentHint` true when repeating the call with the same arguments leaves the same end
 *   state. Creates are false, because each call makes another one.
 * - `openWorldHint` true throughout: Productive is a shared external system, so results can
 *   change between two identical calls because of what other people did.
 *
 * @module tools/annotations
 */

import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';

/** Reads Productive and changes nothing. */
function read(title: string): ToolAnnotations {
  return { title, readOnlyHint: true, openWorldHint: true };
}

/** Adds something new. Calling it again adds another. */
function create(title: string): ToolAnnotations {
  return {
    title,
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  };
}

/** Sets a value without discarding anything. Repeating it is a no-op. */
function set(title: string): ToolAnnotations {
  return {
    title,
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  };
}

/** Overwrites or removes existing data. Repeating it leaves the same end state. */
function destroy(title: string): ToolAnnotations {
  return {
    title,
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  };
}

/**
 * Behaviour hints keyed by tool name.
 *
 * Every name registered in server.ts must appear here exactly once.
 */
export const TOOL_ANNOTATIONS: Record<string, ToolAnnotations> = {
  // Reads. get_attachment is included deliberately: it writes a file into the local
  // attachment cache, but changes nothing in Productive, which is what the hint describes.
  get_attachment: read('Get attachment'),
  get_comment: read('Get comment'),
  get_folder: read('Get folder'),
  get_page: read('Get page'),
  get_person: read('Get person'),
  get_project_services: read('Get project services (deprecated)'),
  get_project_tasks: read('Get project tasks'),
  get_recent_updates: read('Get recent updates'),
  get_task: read('Get task metadata only'),
  get_task_dependency: read('Get task dependency'),
  get_task_list: read('Get task list'),
  get_task_overview: read('Task briefing (start here)'),
  get_todo: read('Get todo'),
  list_activities: read('List activities'),
  list_boards: read('List boards'),
  list_comments: read('List comments (bodies truncated)'),
  list_companies: read('List companies'),
  list_deal_services: read('List deal services'),
  list_folders: read('List folders'),
  list_pages: read('List pages'),
  list_people: read('List people'),
  list_project_deals: read('List project deals'),
  list_projects: read('List projects'),
  list_services: read('List services (deprecated)'),
  list_subtasks: read('List subtasks'),
  list_task_dependencies: read('List task dependencies'),
  list_task_lists: read('List task lists'),
  list_tasks: read('List tasks'),
  list_time_entries: read('List time entries'),
  list_todos: read('List todos'),
  list_workflow_statuses: read('List workflow statuses'),
  my_tasks: read('My tasks'),
  whoami: read('Who am I'),

  // Creates.
  add_task_comment: create('Add comment to task'),
  copy_page: create('Copy page'),
  copy_task_list: create('Copy task list'),
  create_board: create('Create board'),
  create_folder: create('Create folder'),
  create_page: create('Create page'),
  create_subtask: create('Create subtask'),
  create_task: create('Create task'),
  create_task_dependency: create('Create task dependency'),
  create_task_list: create('Create task list'),
  create_time_entry: create('Log time entry'),
  create_todo: create('Create todo'),

  // Additive or positional changes. Nothing is lost, and repeating them changes nothing.
  add_comment_reaction: set('React to comment'),
  add_to_backlog: set('Move task to backlog'),
  move_page: set('Move page'),
  move_task_list: set('Move task list to board'),
  move_task_to_list: set('Move task to list'),
  pin_comment: set('Pin comment'),
  reposition_task: set('Reposition task'),
  reposition_task_list: set('Reposition task list'),
  restore_folder: set('Restore folder'),
  restore_task_list: set('Restore task list'),
  unpin_comment: set('Unpin comment'),

  // Overwrites and removals. These are the ones a client should think about gating.
  archive_folder: destroy('Archive folder'),
  archive_task_list: destroy('Archive task list'),
  delete_comment: destroy('Delete comment'),
  delete_page: destroy('Delete page'),
  delete_task: destroy('Delete task'),
  delete_task_dependency: destroy('Delete task dependency'),
  delete_todo: destroy('Delete todo'),
  update_comment: destroy('Edit comment'),
  update_folder: destroy('Update folder'),
  update_page: destroy('Update page'),
  update_task_assignment: destroy('Reassign task'),
  update_task_details: destroy('Update task details'),
  update_task_list: destroy('Update task list'),
  update_task_sprint: destroy('Set task sprint'),
  update_task_status: destroy('Set task status'),
  update_todo: destroy('Update todo'),
};

/** A tool definition as registered in server.ts. */
interface ToolDefinitionLike {
  name: string;
  annotations?: ToolAnnotations;
}

/**
 * Attach the hints to each definition.
 *
 * A definition that already carries its own `annotations` keeps them, so a tool can opt out
 * of the table without being silently overridden.
 *
 * @param definitions - The registered tool definitions.
 * @returns The same definitions, annotated.
 */
export function withAnnotations<T extends { name: string }>(
  definitions: T[]
): Array<T & { annotations?: ToolAnnotations }> {
  return definitions.map(d => {
    const existing = (d as ToolDefinitionLike).annotations;
    return existing ? d : { ...d, annotations: TOOL_ANNOTATIONS[d.name] };
  });
}

/**
 * Check the table against the registered tools, in both directions.
 *
 * @param names - Every registered tool name.
 * @returns Tools with no entry, and entries naming a tool that no longer exists.
 */
export function assertAnnotationsCover(names: string[]): {
  missing: string[];
  orphaned: string[];
} {
  const annotated = new Set(Object.keys(TOOL_ANNOTATIONS));
  return {
    missing: names.filter(n => !annotated.has(n)).sort(),
    orphaned: Object.keys(TOOL_ANNOTATIONS).filter(n => !names.includes(n)).sort(),
  };
}
