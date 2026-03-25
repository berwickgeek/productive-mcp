---
name: productive
description: Interact with Productive.io — log time, manage tasks, view projects, track activities, and more. Use when the user mentions Productive.io, timesheets, logging hours, recording time, task management in Productive, or any project management operations that should go through Productive.io.
argument-hint: [action and details]
---

# Productive.io Skill

Interact with Productive.io for project management, time tracking, task management, and more via the `productive` MCP server.

## Available Capabilities

### Time Tracking
- `list_time_entries` — view logged time (filter by date, person, project, task, service)
- `create_time_entry` — log new time entries
- `update_time_entry` — update an existing time entry (date, time, note, billable_time). Only works on unsubmitted/unapproved entries.
- `delete_time_entry` — delete an existing time entry. Only works on unsubmitted/unapproved entries.
- `get_project_services` — get services available for a project (needed to create time entries)
- `list_project_deals` — list deals/budgets for a project
- `list_deal_services` — list services for a deal/budget
- `list_services` — list all services in the org

### Task Management
- `list_tasks` / `get_task` / `get_project_tasks` / `my_tasks` — view tasks
- `create_task` — create new tasks
- `update_task_status` — change task status (requires workflow_status_id from `list_workflow_statuses`)
- `update_task_assignment` — reassign tasks
- `update_task_details` — edit task details
- `add_task_comment` — comment on tasks
- `update_task_sprint` — assign tasks to sprints
- `move_task_to_list` / `add_to_backlog` / `reposition_task` — organize tasks

### Projects & Organization
- `list_projects` / `list_companies` — browse projects and companies
- `list_boards` / `create_board` — manage project boards
- `list_task_lists` / `create_task_list` — manage task lists within boards
- `list_workflow_statuses` — see available status options

### Activity & Context
- `list_activities` / `get_recent_updates` — view recent changes across the org
- `whoami` — check current user context

## Time Entry Workflow (MUST FOLLOW)

When logging time, follow these steps in order:

### 1. Identify the correct project
- Map what the user describes to a Productive.io project. Use `list_projects` if needed.
- If unclear which project the work belongs to, **ask explicitly** — do not guess.
- The user may reference work that gets logged under a different project than expected. Use conversation context to determine this, but ask if ambiguous.

### 2. Get the project's services
- Use `get_project_services` with the project ID to get services belonging to that project's budget.

### 3. Handle budget errors automatically
- If `create_time_entry` fails with "outside budget date range", try other services for that project automatically — don't ask the user to look it up.

### 4. Draft the note and confirm
- Before creating, show the user a summary table of each entry (date, time, project, service, note).
- Ask if they want to add additional detail to the note — e.g. specific tasks accomplished, context about why the work was done, or references to conversations. Don't use generic notes.
- Once confirmed, create the entry.

### 5. Create the entry
- Use `create_time_entry` with `person_id: "me"` (requires PRODUCTIVE_USER_ID to be configured).
- If creating multiple entries across different projects, verify the project/service mapping for each one individually.

## Known Gotchas
- Service IDs change when budgets roll over. Always query fresh rather than reusing cached IDs.
- Some API tokens may not have permission for `list_project_deals` — use `get_project_services` instead.
- Task status updates require workflow_status_id (not simple strings). Use `list_workflow_statuses` first.
