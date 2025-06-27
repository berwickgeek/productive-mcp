# Productive.io MCP Server

An MCP (Model Context Protocol) server that enables Claude Desktop and other MCP-compatible clients to interact with the Productive.io API.

## Features

- List projects with optional status filtering
- List tasks with project and status filtering
- Get all tasks for a specific project

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

### list_companies
Get a list of companies/customers from Productive.io

Parameters:
- `status` (optional): Filter by company status ('active' or 'archived')
- `limit` (optional): Number of companies to return (1-200, default: 30)

### list_projects
Get a list of projects from Productive.io

Parameters:
- `status` (optional): Filter by project status ('active' or 'archived')
- `company_id` (optional): Filter projects by company ID
- `limit` (optional): Number of projects to return (1-200, default: 30)

### list_tasks
Get a list of tasks from Productive.io

Parameters:
- `project_id` (optional): Filter tasks by project ID
- `assignee_id` (optional): Filter tasks by assignee ID
- `status` (optional): Filter by task status ('open' or 'closed')
- `limit` (optional): Number of tasks to return (1-200, default: 30)

### get_project_tasks
Get all tasks for a specific project

Parameters:
- `project_id` (required): The ID of the project
- `status` (optional): Filter by task status ('open' or 'closed')

### my_tasks
Get tasks assigned to you (requires PRODUCTIVE_USER_ID to be configured)

Parameters:
- `status` (optional): Filter by task status ('open' or 'closed')
- `limit` (optional): Number of tasks to return (1-200, default: 30)

## Development

- Run in development mode: `npm run dev`
- Build: `npm run build`
- Start built server: `npm start`

## License

ISC