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
└── tools/            # Individual tool implementations
    ├── companies.ts  # list_companies tool
    ├── projects.ts   # list_projects tool
    ├── tasks.ts      # list_tasks, get_project_tasks tools
    └── my-tasks.ts   # my_tasks tool (requires user context)
```

### Key Implementation Details

1. **Dotenv Silencing**: The config module temporarily overrides stdout.write to prevent dotenv from outputting debug info that would corrupt the MCP protocol

2. **Status Integer Mapping**:

   - Tasks use integers: `1` = open, `2` = closed
   - Projects/Companies use strings: `'active'`, `'archived'`

3. **API Filter Formats**:

   - Company ID: Plain integer string `filter[company_id]=123` (NOT wrapped in brackets)
   - Task status: Integer value `filter[status]=1`
   - All IDs should be strings in the TypeScript interfaces

4. **Tool Pattern**: Each tool follows this structure:

   - Zod schema for input validation
   - Tool function that catches errors and returns MCP-formatted responses
   - Tool definition object with name, description, and JSON schema

5. **Error Handling**: Use McpError with appropriate error codes:
   - `ErrorCode.InvalidParams` for validation errors
   - `ErrorCode.InternalError` for API or other errors

## Common Development Tasks

### Adding a New Tool

1. Create a new file in `src/tools/`
2. Define the Zod schema for parameters
3. Implement the tool function with this signature:
   ```typescript
   export async function myTool(
     client: ProductiveAPIClient,
     args: unknown
   ): Promise<{ content: Array<{ type: string; text: string }> }>;
   ```
4. Export a tool definition object
5. Import and register in `server.ts`:
   - Add to the tools array in ListToolsRequestSchema handler
   - Add a case in the CallToolRequestSchema switch statement

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

## Environment Variables

Required:

- `PRODUCTIVE_API_TOKEN`: API token from Productive.io settings
- `PRODUCTIVE_ORG_ID`: Organization ID

Optional:

- `PRODUCTIVE_USER_ID`: Required for my_tasks tool
- `PRODUCTIVE_API_BASE_URL`: Defaults to https://api.productive.io/api/v2/

## Development Memories

- Before beginning any task, review the docs/productive-mcp-development.yaml file for reference
- As we develop this service, maintain the docs/productive-mcp-development.yaml file for reference
