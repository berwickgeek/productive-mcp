# Productive.io MCP Server

[![npm version](https://badge.fury.io/js/productive-mcp.svg)](https://www.npmjs.com/package/productive-mcp)

An MCP (Model Context Protocol) server that enables Claude Desktop, Claude Code, and other MCP-compatible clients to interact with the Productive.io API.

## Features

- **Companies & Projects**: List companies and projects with status filtering
- **Folders**: Full CRUD with archive/restore for organizing project content
- **Task Lists**: Full lifecycle management — create, update, archive/restore, copy, move, reposition
- **Task Management**: List, create, update, delete tasks with various filters
- **Subtasks**: Create and list subtasks under parent tasks
- **Task Operations**: Comments, status updates, sprint assignment, repositioning
- **Comments**: Full CRUD with pin/unpin and reactions
- **Todos**: Checklist items on tasks — create, update, close/reopen, delete
- **Pages/Docs**: Full document management with nested page hierarchies, move, and copy
- **People Management**: List people in your organization with filtering options
- **Workflow Management**: List and work with workflow statuses for proper task status updates
- **Time Tracking**: List and create time entries with service/deal integration
- **User Context**: Supports "me" references when PRODUCTIVE_USER_ID is configured
- **Activity Tracking**: View activities and recent updates across your organization

## Installation

### Via npm (Recommended)

Install globally:
```bash
npm install -g productive-mcp
```

Or run directly with npx (no installation required):
```bash
npx productive-mcp
```

### From Source

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the project:
   ```bash
   npm run build
   ```

## Configuration

### Getting Your Credentials

To obtain your Productive.io credentials:
1. Log in to Productive.io
2. Go to Settings → API integrations
3. Generate a new token (choose read-only for safety, or full access for task creation)
4. Copy the token and organization ID

To find your user ID:
- You can use the API to list people and find your ID
- Or check the URL when viewing your profile in Productive.io

### Environment Variables

The server requires the following environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `PRODUCTIVE_API_TOKEN` | Yes | Your Productive.io API token |
| `PRODUCTIVE_ORG_ID` | Yes | Your organization ID |
| `PRODUCTIVE_USER_ID` | No | Your user ID (required for `my_tasks` tool) |

## Usage with Claude Desktop

Add the server to your Claude Desktop configuration file:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

### Using npx (Recommended)

```json
{
  "mcpServers": {
    "productive": {
      "command": "npx",
      "args": ["-y", "productive-mcp"],
      "env": {
        "PRODUCTIVE_API_TOKEN": "your_api_token_here",
        "PRODUCTIVE_ORG_ID": "your_organization_id_here",
        "PRODUCTIVE_USER_ID": "your_user_id_here"
      }
    }
  }
}
```

### Using Global Installation

```json
{
  "mcpServers": {
    "productive": {
      "command": "productive-mcp",
      "env": {
        "PRODUCTIVE_API_TOKEN": "your_api_token_here",
        "PRODUCTIVE_ORG_ID": "your_organization_id_here",
        "PRODUCTIVE_USER_ID": "your_user_id_here"
      }
    }
  }
}
```

### Using Local Build

```json
{
  "mcpServers": {
    "productive": {
      "command": "node",
      "args": ["/path/to/productive-mcp/build/index.js"],
      "env": {
        "PRODUCTIVE_API_TOKEN": "your_api_token_here",
        "PRODUCTIVE_ORG_ID": "your_organization_id_here",
        "PRODUCTIVE_USER_ID": "your_user_id_here"
      }
    }
  }
}
```

**Note**: `PRODUCTIVE_USER_ID` is optional but required for the `my_tasks` tool to work.

After adding the configuration, restart Claude Desktop.

## Usage with Claude Code

Add the server to your Claude Code configuration using the CLI:

```bash
claude mcp add productive -- npx -y productive-mcp
```

Then set your environment variables. You can either:

**Option 1**: Add to your shell profile (`~/.zshrc` or `~/.bashrc`):
```bash
export PRODUCTIVE_API_TOKEN="your_api_token_here"
export PRODUCTIVE_ORG_ID="your_organization_id_here"
export PRODUCTIVE_USER_ID="your_user_id_here"
```

**Option 2**: Create a wrapper script and add it as an MCP server:

1. Create a script file (e.g., `~/scripts/productive-mcp.sh`):
   ```bash
   #!/bin/bash
   export PRODUCTIVE_API_TOKEN="your_api_token_here"
   export PRODUCTIVE_ORG_ID="your_organization_id_here"
   export PRODUCTIVE_USER_ID="your_user_id_here"
   npx -y productive-mcp
   ```

2. Make it executable:
   ```bash
   chmod +x ~/scripts/productive-mcp.sh
   ```

3. Add to Claude Code:
   ```bash
   claude mcp add productive ~/scripts/productive-mcp.sh
   ```

**Option 3**: Edit the Claude Code settings file directly at `~/.claude/settings.json`:
```json
{
  "mcpServers": {
    "productive": {
      "command": "npx",
      "args": ["-y", "productive-mcp"],
      "env": {
        "PRODUCTIVE_API_TOKEN": "your_api_token_here",
        "PRODUCTIVE_ORG_ID": "your_organization_id_here",
        "PRODUCTIVE_USER_ID": "your_user_id_here"
      }
    }
  }
}
```

Restart Claude Code after configuration.

## Available Tools

### User & Context Tools

| Tool | Description |
|------|-------------|
| `whoami` | Get current user context and configured user ID |

### Company & Project Tools

| Tool | Description |
|------|-------------|
| `list_companies` | List companies/customers. Filter by `status` (active/archived), `limit` |
| `list_projects` | List projects. Filter by `status`, `company_id`, `limit` |

### Folder Tools

| Tool | Description |
|------|-------------|
| `list_folders` | List folders in a project. Filter by `project_id`, `status` (1=active, 2=archived), `limit` |
| `get_folder` | Get folder details by `folder_id` |
| `create_folder` | Create a folder. Requires `project_id`, `name` |
| `update_folder` | Rename a folder. Requires `folder_id`, optional `name` |
| `archive_folder` | Archive a folder by `folder_id` |
| `restore_folder` | Restore an archived folder by `folder_id` |

### Board & Task List Tools

| Tool | Description |
|------|-------------|
| `list_boards` | List boards. Filter by `project_id`, `limit` |
| `create_board` | Create a board. Requires `project_id`, `name` |
| `list_task_lists` | List task lists. Filter by `board_id`, `limit` |
| `create_task_list` | Create a task list. Requires `board_id`, `project_id`, `name` |
| `get_task_list` | Get task list details by `task_list_id` |
| `update_task_list` | Rename a task list. Requires `task_list_id`, optional `name` |
| `archive_task_list` | Archive a task list by `task_list_id` |
| `restore_task_list` | Restore an archived task list by `task_list_id` |
| `copy_task_list` | Copy a task list. Requires `name`, `template_id`, `project_id`, `board_id`. Optional `copy_open_tasks`, `copy_assignees` |
| `move_task_list` | Move a task list to another board. Requires `task_list_id`, `board_id` |
| `reposition_task_list` | Reorder a task list. Requires `task_list_id`, `move_before_id` |

### Task Management Tools

| Tool | Description |
|------|-------------|
| `list_tasks` | List tasks. Filter by `project_id`, `assignee_id`, `status` (open/closed), `limit` |
| `get_project_tasks` | Get all tasks for a project. Requires `project_id`, optional `status` |
| `get_task` | Get task details by `task_id` |
| `create_task` | Create a task. Requires `title`. Optional `project_id`, `board_id`, `task_list_id`, `assignee_id` ("me" supported), `due_date`, `status` |
| `update_task_assignment` | Assign/unassign a task. Requires `task_id`, `assignee_id` ("me" or "null" supported) |
| `update_task_details` | Update title/description. Requires `task_id`, optional `title`, `description`, `description_html` |
| `update_task_status` | Set workflow status by name or ID. Requires `task_id` and either `status_name` (e.g. "In Progress", "On Hold") or `workflow_status_id`. Automatically resolves the task's project workflow, supports custom statuses |
| `delete_task` | Delete a task by `task_id` |
| `my_tasks` | Get tasks assigned to you. Optional `status`, `limit` |
| `reposition_task` | Reorder a task within a list |
| `update_task_sprint` | Move task to a sprint/task list |
| `move_task_to_list` | Move a task to a different task list |
| `add_to_backlog` | Move a task to the backlog |

### Task Dependency Tools

| Tool | Description |
|------|-------------|
| `list_task_dependencies` | List dependencies for a task. Filter by `task_id` (what it blocks) or `dependent_task_id` (what blocks it) |
| `get_task_dependency` | Get dependency details by `dependency_id` |
| `create_task_dependency` | Create a dependency. Requires `task_id` (blocker), `dependent_task_id` (blocked). Optional `type_id`: 1 = blocks (default), 2 = is blocked by, 3 = related to |
| `delete_task_dependency` | Remove a dependency by `dependency_id` |

### Subtask Tools

| Tool | Description |
|------|-------------|
| `list_subtasks` | List subtasks of a parent task. Requires `parent_task_id`, optional `limit` |
| `create_subtask` | Create a subtask. Requires `parent_task_id`, `title`. Optional `project_id`, `task_list_id`, `assignee_id`, `due_date`, `description` |

### Comment Tools

| Tool | Description |
|------|-------------|
| `add_task_comment` | Add a comment to a task. Requires `task_id`, `comment` (supports HTML) |
| `list_comments` | List comments. Filter by `task_id`, `project_id`, `limit` |
| `get_comment` | Get full comment details by `comment_id` |
| `update_comment` | Edit a comment. Requires `comment_id`, `body` |
| `delete_comment` | Delete a comment by `comment_id` |
| `pin_comment` | Pin a comment by `comment_id` |
| `unpin_comment` | Unpin a comment by `comment_id` |
| `add_comment_reaction` | Add a reaction. Requires `comment_id`, `reaction` (e.g. "like") |

### Todo Tools

| Tool | Description |
|------|-------------|
| `list_todos` | List todos on a task. Filter by `task_id`, `status` (open/closed), `limit` |
| `get_todo` | Get todo details by `todo_id` |
| `create_todo` | Create a todo. Requires `description`. Optional `task_id`, `deal_id`, `assignee_id`, `due_date` |
| `update_todo` | Update a todo. Requires `todo_id`. Optional `description`, `closed` (boolean), `due_date` |
| `delete_todo` | Delete a todo by `todo_id` |

### Page/Document Tools

| Tool | Description |
|------|-------------|
| `list_pages` | List pages. Filter by `project_id`, `sort` (title/created_at/edited_at/updated_at), `limit` |
| `get_page` | Get full page content by `page_id` |
| `create_page` | Create a page. Requires `project_id`, `title`. Optional `body` (HTML), `parent_page_id`, `root_page_id` |
| `update_page` | Update a page. Requires `page_id`. Optional `title`, `body` |
| `delete_page` | Delete a page by `page_id` |
| `move_page` | Move page under another. Requires `page_id`, `target_doc_id` |
| `copy_page` | Copy a page. Requires `template_id`. Optional `project_id` |

### Workflow Tools

| Tool | Description |
|------|-------------|
| `list_workflow_statuses` | List workflow statuses. Filter by `workflow_id`, `category_id` (1=Not Started, 2=Started, 3=Closed), `limit` |

### Time Tracking Tools

| Tool | Description |
|------|-------------|
| `list_time_entries` | List time entries. Filter by `date`, `after`, `before`, `person_id`, `project_id`, `task_id`, `service_id` |
| `create_time_entry` | Create a time entry. Requires `date`, `time` (minutes), `person_id`, `service_id`. Optional `task_id`, `note` |
| `list_services` | List services. Filter by `company_id`, `limit` |
| `get_project_services` | Get services for a project |
| `list_project_deals` | List deals/budgets for a project |
| `list_deal_services` | List services for a deal/budget |

### Activity & Updates Tools

| Tool | Description |
|------|-------------|
| `list_activities` | List activities. Filter by `task_id`, `project_id`, `person_id`, `item_type`, `event`, `after`, `before` |
| `get_recent_updates` | Get recent updates. Optional `limit`, `hours` |

## Common Workflows

### Updating Task Status

You can update a task's status by name — no need to look up IDs:

```
update_task_status {
  "task_id": "12399194",
  "status_name": "On Hold"
}
```

The tool automatically resolves the task's project workflow and matches the status name (case-insensitive, supports partial matching). This works with custom workflow statuses too.

If the name doesn't match or is ambiguous, it returns the available statuses for that project:

```
No workflow status matching "banana" found.

Available statuses:
  • "Pending" (ID: 102305) — Not Started
  • "Open" (ID: 102291) — Started
  • "On Hold" (ID: 102306) — Started
  • "Waiting" (ID: 102307) — Started
  • "Closed" (ID: 102292) — Closed
```

You can also pass `workflow_status_id` directly if you already know the ID.

### Working with "me" Context

When `PRODUCTIVE_USER_ID` is configured, you can use "me" in several tools:
- `create_task` with `"assignee_id": "me"`
- `update_task_assignment` with `"assignee_id": "me"`
- `my_tasks` to get your assigned tasks
- `whoami` to verify your configured user context

### Creating Complete Task Workflows

1. **Create a folder**: `create_folder`
2. **Create task lists**: `create_task_list`
3. **Create tasks**: `create_task`
4. **Break down work**: `create_subtask` for sub-items, `create_todo` for checklists
5. **Add comments**: `add_task_comment`
6. **Update status**: `update_task_status` with `status_name` (e.g. "Open", "On Hold", "Closed")
7. **Track progress**: Use `list_activities` or `get_recent_updates`

### Building Documentation

1. **Create a root page**: `create_page` with `project_id` and `title`
2. **Add child pages**: `create_page` with `parent_page_id` and `root_page_id` set to the root
3. **Nest deeper**: Set `parent_page_id` to the parent and `root_page_id` to the root page
4. **Reorganize**: Use `move_page` to reparent pages, `copy_page` to duplicate

## Development

- Run in development mode: `npm run dev`
- Build: `npm run build`
- Start built server: `npm start`

## License

ISC