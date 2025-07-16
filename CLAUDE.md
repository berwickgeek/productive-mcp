# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

```bash
# Install dependencies
npm install

# Build the project (required before running)
npm run build

# Watch mode for development
npm run dev

# Run the built server (for testing)
npm start
```

## Architecture Overview

This is an MCP (Model Context Protocol) server that bridges Claude Desktop with the Productive.io API. The architecture follows these key principles:

### MCP Protocol Requirements

- **CRITICAL**: stdout is reserved EXCLUSIVELY for JSON-RPC protocol messages
- Any console.log() or stdout output will break the MCP connection
- All debugging must use console.error() (goes to stderr)
- The server uses stdio transport with newline-delimited JSON messages

### Code Organization

```
src/
├── index.ts          # Entry point - minimal, just starts the server
├── server.ts         # MCP server setup, tool registration, request routing
├── config/           # Environment configuration with dotenv silencing
├── api/
│   ├── client.ts     # Productive API client with typed methods
│   └── types.ts      # TypeScript interfaces for API responses
├── prompts/          # MCP prompt implementations
│   └── timesheet.ts  # Timesheet workflow prompts
└── tools/            # Individual tool implementations
    ├── companies.ts  # list_companies tool
    ├── projects.ts   # list_projects tool
    ├── tasks.ts      # list_tasks, get_project_tasks, create_task tools
    ├── my-tasks.ts   # my_tasks tool (requires user context)
    ├── time-entries.ts # Timesheet workflow tools
    ├── workflow-statuses.ts # Workflow status management
    ├── activities.ts # Activity tracking
    ├── comments.ts   # Task comments
    └── task-status.ts # Task status updates
```

### Key Implementation Details

1. **Dotenv Silencing**: The config module temporarily overrides stdout.write to prevent dotenv from outputting debug info that would corrupt the MCP protocol

2. **Status Integer Mapping**:

   - Tasks use integers: `1` = open, `2` = closed
   - Projects/Companies use strings: `'active'`, `'archived'`
   - Time entries use minutes for duration (parsed from "2h", "120m", etc.)
   - Workflow statuses use separate IDs (different from basic open/closed)

3. **API Filter Formats**:

   - Company ID: Plain integer string `filter[company_id]=123` (NOT wrapped in brackets)
   - Task status: Integer value `filter[status]=1`
   - All IDs should be strings in the TypeScript interfaces
   - Time entries follow hierarchy: Project → Deal/Budget → Service → Task → Time Entry

4. **Tool Pattern**: Each tool follows this structure:

   - Zod schema for input validation
   - Tool function that catches errors and returns MCP-formatted responses
   - Tool definition object with name, description, and JSON schema

5. **Error Handling**: Use McpError with appropriate error codes:
   - `ErrorCode.InvalidParams` for validation errors
   - `ErrorCode.InternalError` for API or other errors

6. **Timesheet Workflow Pattern**: Hierarchical 5-step workflow:
   - Step 1: Project selection (`list_projects`)
   - Step 2: Budget/Deal selection (`list_project_deals`)
   - Step 3: Service selection (`list_deal_services`)
   - Step 4: Task selection (`get_project_tasks` - recommended)
   - Step 5: Time entry creation (`create_time_entry` with confirmation)

7. **MCP Prompts Architecture**: Interactive workflow guidance:
   - `timesheet_entry`: Complete guided workflow
   - `timesheet_step`: Step-by-step assistance
   - Progress tracking and validation
   - Hierarchical workflow enforcement

8. **Time/Date Parsing**: Flexible input formats:
   - Time: "2h", "120m", "2.5h", "2.5" (assumed hours)
   - Date: "today", "yesterday", "YYYY-MM-DD"
   - Automatic conversion to API-required formats

## Common Development Tasks

### Adding a New Tool

1. Create a new file in `src/tools/`
2. Define the Zod schema for parameters
3. Implement the tool function with this signature:
   ```typescript
   export async function myTool(
     client: ProductiveAPIClient,
     args: unknown,
     config?: { PRODUCTIVE_USER_ID?: string }
   ): Promise<{ content: Array<{ type: string; text: string }> }>;
   ```
4. Export a tool definition object with proper workflow step annotation
5. Import and register in `server.ts`:
   - Add to the tools array in ListToolsRequestSchema handler
   - Add a case in the CallToolRequestSchema switch statement
   - Pass config parameter if tool supports "me" references

### Adding MCP Prompts

1. Create prompt functions in `src/prompts/`
2. Define Zod schemas for prompt arguments
3. Implement prompt generators that return messages array
4. Export prompt definition objects
5. Register in `server.ts`:
   - Add to prompts array in ListPromptsRequestSchema handler
   - Add case in GetPromptRequestSchema switch statement

### Timesheet Workflow Implementation

When implementing timesheet-related features:

1. **Follow the hierarchy**: Project → Deal/Budget → Service → Task → Time Entry
2. **Validate service relationships**: Ensure service_id belongs to the correct deal/budget
3. **Use confirmation patterns**: Preview before creating time entries
4. **Support flexible parsing**: Handle various time/date input formats
5. **Enforce detailed notes**: Require meaningful work descriptions (min 10 chars)
6. **Link to tasks when possible**: Improve tracking with task_id relationships

### Testing Locally

1. Build the project: `npm run build`
2. Set environment variables in `.env`
3. Run directly: `node build/index.js`
4. For Claude Desktop integration, update `~/Library/Application Support/Claude/claude_desktop_config.json`

## Productive API Gotchas

- Task status filter expects integers (1/2), not strings
- Company ID filter expects plain integer, not array notation
- No `/me` endpoint - user context requires explicit user ID configuration
- Rate limits: 100 requests/10 seconds, 4000 requests/30 minutes
- **Time entry hierarchy**: Must follow Project → Deal/Budget → Service → Task chain
- **Service validation**: Services must be linked to deals/budgets, not accessed directly
- **Workflow vs basic status**: Tasks have both status (1/2) and workflow_status_id fields
- **Time parsing**: API expects minutes, but users input hours/minutes in various formats
- **Date flexibility**: Support "today"/"yesterday" but API requires YYYY-MM-DD format
- **Confirmation requirement**: Time entries should be confirmed before creation to prevent accidents

## Environment Variables

Required:

- `PRODUCTIVE_API_TOKEN`: API token from Productive.io settings
- `PRODUCTIVE_ORG_ID`: Organization ID

Optional:

- `PRODUCTIVE_USER_ID`: Required for my_tasks tool and "me" references in timesheet workflow
- `PRODUCTIVE_API_BASE_URL`: Defaults to https://api.productive.io/api/v2/

## Timesheet Workflow Environment Setup

For full timesheet functionality, ensure:

```bash
# Required for basic functionality
PRODUCTIVE_API_TOKEN=your_token_here
PRODUCTIVE_ORG_ID=your_org_id_here

# Required for "me" references in timesheet workflow
PRODUCTIVE_USER_ID=your_user_id_here
```

Find your user ID by:
1. Using the `whoami` tool if already configured
2. Using `list_people` and finding your email
3. Checking Productive.io user settings

## Workflow Patterns

### Timesheet Entry Workflow

The timesheet workflow enforces a strict hierarchy to ensure proper time tracking:

```typescript
// Step 1: Find project
const projects = await client.listProjects();

// Step 2: Get deals/budgets for project
const deals = await client.listProjectDeals({ project_id });

// Step 3: Get services for selected deal/budget
const services = await client.listDealServices({ deal_id });

// Step 4: Get tasks for project (recommended)
const tasks = await client.listProjectTasks({ project_id });

// Step 5: Create time entry with service hierarchy
const timeEntry = await client.createTimeEntry({
  service_id, // Required - from step 3
  task_id,    // Optional - from step 4
  date,       // Parsed from "today", "yesterday", or "YYYY-MM-DD"
  time,       // Parsed from "2h", "120m", etc. to minutes
  person_id,  // Can be "me" if PRODUCTIVE_USER_ID configured
  note,       // Required detailed work description
  confirm: true // Required for actual creation
});
```

### Testing Timesheet Workflow

```bash
# Test the complete workflow
npm run build
node build/index.js

# In Claude Desktop, use the timesheet_entry prompt:
# "I need to log 2 hours of work on Project X for today"
```

## Development Memories

- Before beginning any task, review the docs/productive-mcp-development.yaml file for reference
- As we develop this service, maintain the docs/productive-mcp-development.yaml file for reference
- The timesheet workflow is the most complex feature - it requires strict hierarchy validation
- MCP prompts provide guided workflows - use them for complex multi-step operations
- Always test time/date parsing edge cases ("2.5h", "today", "yesterday")
- Confirmation patterns prevent accidental data creation
- "me" references work across tools when PRODUCTIVE_USER_ID is configured
