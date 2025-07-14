# Productive.io MCP Server

An MCP (Model Context Protocol) server that enables Claude Desktop and other MCP-compatible clients to interact with the Productive.io API.

## Features

- **Companies & Projects**: List companies and projects with status filtering
- **Task Management**: List, create, and get individual tasks with various filters
- **Task Operations**: Add comments to tasks and update task status via workflow statuses
- **Board & Task List Management**: Create and manage boards and task lists within projects
- **People Management**: List people in your organization with filtering options
- **Workflow Management**: List and work with workflow statuses for proper task status updates
- **User Context**: Supports "me" references when PRODUCTIVE_USER_ID is configured
- **Activity Tracking**: View activities and recent updates across your organization

## Installation

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

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Add your Productive.io credentials:
   ```env
   PRODUCTIVE_API_TOKEN=your_api_token_here
   PRODUCTIVE_ORG_ID=your_organization_id_here
   ```

To obtain these credentials:
- Log in to Productive.io
- Go to Settings → API integrations
- Generate a new token (choose read-only for safety)
- Copy the token and organization ID

To find your user ID:
- You can use the API to list people and find your ID
- Or check the URL when viewing your profile in Productive.io

## Usage with Claude Desktop

1. Build the server:
   ```bash
   npm run build
   ```

2. Add the server to your Claude Desktop configuration file:
   - On macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - On Windows: `%APPDATA%\Claude\claude_desktop_config.json`

3. Add the following configuration:
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
   
   Replace `/path/to/productive-mcp` with the actual absolute path to your project directory.
   
   **Note**: `PRODUCTIVE_USER_ID` is optional but required for the `my_tasks` tool to work.

4. Restart Claude Desktop

## Available Tools

### User & Context Tools

#### whoami
Get the current user context and check which user ID is configured for "me" operations.

### Company & Project Tools

#### list_companies
Get a list of companies/customers from Productive.io

Parameters:
- `status` (optional): Filter by company status ('active' or 'archived')
- `limit` (optional): Number of companies to return (1-200, default: 30)

#### list_projects
Get a list of projects from Productive.io

Parameters:
- `status` (optional): Filter by project status ('active' or 'archived')
- `company_id` (optional): Filter projects by company ID
- `limit` (optional): Number of projects to return (1-200, default: 30)

### Board & Task List Tools

#### list_boards
Get a list of boards from projects

Parameters:
- `project_id` (optional): Filter boards by project ID
- `limit` (optional): Number of boards to return (max 200, default: 30)

#### create_board
Create a new board in a Productive.io project

Parameters:
- `project_id` (required): The ID of the project to create the board in
- `name` (required): Name of the board
- `description` (optional): Description of the board

#### list_task_lists
Get a list of task lists from boards

Parameters:
- `board_id` (optional): Filter task lists by board ID
- `limit` (optional): Number of task lists to return (max 200, default: 30)

#### create_task_list
Create a new task list in a board

Parameters:
- `board_id` (required): The ID of the board to create the task list in
- `project_id` (required): The ID of the project
- `name` (required): Name of the task list
- `description` (optional): Description of the task list

### Task Management Tools

#### list_tasks
Get a list of tasks from Productive.io

Parameters:
- `project_id` (optional): Filter tasks by project ID
- `assignee_id` (optional): Filter tasks by assignee ID
- `status` (optional): Filter by task status ('open' or 'closed')
- `limit` (optional): Number of tasks to return (1-200, default: 30)

#### get_project_tasks
Get all tasks for a specific project

Parameters:
- `project_id` (required): The ID of the project
- `status` (optional): Filter by task status ('open' or 'closed')

#### get_task
Get detailed information about a specific task

Parameters:
- `task_id` (required): The ID of the task to retrieve

#### create_task
Create a new task in Productive.io

Parameters:
- `title` (required): Task title
- `description` (optional): Task description
- `project_id` (optional): ID of the project to add the task to
- `board_id` (optional): ID of the board to add the task to
- `task_list_id` (optional): ID of the task list to add the task to
- `assignee_id` (optional): ID of the person to assign (use "me" for configured user)
- `due_date` (optional): Due date in YYYY-MM-DD format
- `status` (optional): Task status ('open' or 'closed', default: 'open')

#### update_task_assignment
Update the assignee of an existing task

Parameters:
- `task_id` (required): ID of the task to update
- `assignee_id` (required): ID of the person to assign (use "me" for configured user, "null" to unassign)

#### my_tasks
Get tasks assigned to you (requires PRODUCTIVE_USER_ID to be configured)

Parameters:
- `status` (optional): Filter by task status ('open' or 'closed')
- `limit` (optional): Number of tasks to return (1-200, default: 30)

### Task Operations Tools

#### add_task_comment
Add a comment to a task

Parameters:
- `task_id` (required): ID of the task to add the comment to
- `comment` (required): Text content of the comment

#### update_task_status
Update the status of a task using workflow status ID

Parameters:
- `task_id` (required): ID of the task to update
- `workflow_status_id` (required): ID of the workflow status to set

#### list_workflow_statuses
List workflow statuses available in Productive.io (used for task status updates)

Parameters:
- `workflow_id` (optional): Filter by workflow ID
- `category_id` (optional): Filter by category (1=Not Started, 2=Started, 3=Closed)
- `limit` (optional): Number of statuses to return (1-200, default: 50)

### People Management Tools

#### list_people
List people in the organization with optional filters

Parameters:
- `company_id` (optional): Filter people by company ID
- `project_id` (optional): Filter people assigned to a specific project
- `is_active` (optional): Filter by active status
- `email` (optional): Filter by email address
- `limit` (optional): Maximum number of people to return (default: 50, max: 100)
- `page` (optional): Page number for pagination (default: 1)

#### get_project_people
Get all people assigned to a specific project

Parameters:
- `project_id` (required): The project ID to get people for
- `is_active` (optional): Filter by active status (default: true)
- `limit` (optional): Maximum number of people to return (default: 50, max: 100)
- `page` (optional): Page number for pagination (default: 1)

### Activity & Updates Tools

#### list_activities
List activities and changes across your organization

Parameters:
- `task_id` (optional): Filter activities by task ID
- `project_id` (optional): Filter activities by project ID
- `person_id` (optional): Filter activities by person ID
- `item_type` (optional): Filter by item type
- `event` (optional): Filter by event type
- `after` (optional): Filter activities after this date (ISO 8601 format)
- `before` (optional): Filter activities before this date (ISO 8601 format)
- `limit` (optional): Number of activities to return
- `page` (optional): Page number for pagination

#### get_recent_updates
Get recent updates and activities in a summarized format

Parameters:
- `limit` (optional): Number of recent updates to return (default: 20)
- `hours` (optional): Number of hours to look back (default: 24)

## Common Workflows

### Updating Task Status

To update a task's status, you need to use workflow status IDs rather than simple "open"/"closed" values:

1. **First, list available workflow statuses**:
   ```
   list_workflow_statuses
   ```
   This will show you all available statuses with their IDs and categories (Not Started=1, Started=2, Closed=3).

2. **Then update the task status**:
   ```
   update_task_status {
     "task_id": "12399194",
     "workflow_status_id": "specific_status_id_from_step_1"
   }
   ```

### Working with "me" Context

When `PRODUCTIVE_USER_ID` is configured, you can use "me" in several tools:
- `create_task` with `"assignee_id": "me"`
- `update_task_assignment` with `"assignee_id": "me"`
- `my_tasks` to get your assigned tasks
- `whoami` to verify your configured user context

### Creating Complete Task Workflows

1. **Create a board**: `create_board`
2. **Create task lists**: `create_task_list`
3. **Create tasks**: `create_task` 
4. **Add comments**: `add_task_comment`
5. **Update status**: Use `list_workflow_statuses` then `update_task_status`
6. **Track progress**: Use `list_activities` or `get_recent_updates`

## Development

- Run in development mode: `npm run dev`
- Build: `npm run build`
- Start built server: `npm start`

## License

ISC