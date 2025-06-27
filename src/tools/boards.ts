import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const ListBoardsSchema = z.object({
  project_id: z.string().optional().describe('Filter boards by project ID'),
  limit: z.number().optional().default(30).describe('Number of boards to return (max 200)'),
});

export async function listBoards(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = ListBoardsSchema.parse(args);
    
    const response = await client.listBoards({
      project_id: params.project_id,
      limit: params.limit,
    });
    
    if (!response.data || response.data.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'No boards found',
        }],
      };
    }
    
    const boardsText = response.data.map(board => {
      let text = `Board: ${board.attributes.name} (ID: ${board.id})`;
      if (board.attributes.description) {
        text += `\nDescription: ${board.attributes.description}`;
      }
      if (board.attributes.position !== undefined) {
        text += `\nPosition: ${board.attributes.position}`;
      }
      if (board.relationships?.project?.data?.id) {
        text += `\nProject ID: ${board.relationships.project.data.id}`;
      }
      return text;
    }).join('\n\n');
    
    return {
      content: [{
        type: 'text',
        text: boardsText,
      }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid parameters: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      );
    }
    
    if (error instanceof Error) {
      throw new McpError(
        ErrorCode.InternalError,
        `API error: ${error.message}`
      );
    }
    
    throw new McpError(
      ErrorCode.InternalError,
      'Unknown error occurred while fetching boards'
    );
  }
}

export const listBoardsTool = {
  name: 'list_boards',
  description: 'Get a list of boards from Productive.io',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        description: 'Filter boards by project ID',
      },
      limit: {
        type: 'number',
        description: 'Number of boards to return (max 200)',
        default: 30,
      },
    },
  },
};

const CreateBoardSchema = z.object({
  project_id: z.string().describe('The ID of the project to create the board in'),
  name: z.string().describe('Name of the board'),
  description: z.string().optional().describe('Description of the board'),
});

export async function createBoard(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = CreateBoardSchema.parse(args);
    
    const boardData = {
      data: {
        type: 'boards' as const,
        attributes: {
          name: params.name,
          description: params.description,
        },
        relationships: {
          project: {
            data: {
              id: params.project_id,
              type: 'projects' as const,
            },
          },
        },
      },
    };
    
    const response = await client.createBoard(boardData);
    
    let text = `Board created successfully!\n`;
    text += `Name: ${response.data.attributes.name} (ID: ${response.data.id})`;
    if (response.data.attributes.description) {
      text += `\nDescription: ${response.data.attributes.description}`;
    }
    text += `\nProject ID: ${params.project_id}`;
    if (response.data.attributes.created_at) {
      text += `\nCreated at: ${response.data.attributes.created_at}`;
    }
    
    return {
      content: [{
        type: 'text',
        text: text,
      }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid parameters: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      );
    }
    
    if (error instanceof Error) {
      throw new McpError(
        ErrorCode.InternalError,
        `API error: ${error.message}`
      );
    }
    
    throw new McpError(
      ErrorCode.InternalError,
      'Unknown error occurred while creating board'
    );
  }
}

export const createBoardTool = {
  name: 'create_board',
  description: 'Create a new board in a Productive.io project',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        description: 'The ID of the project to create the board in',
      },
      name: {
        type: 'string',
        description: 'Name of the board',
      },
      description: {
        type: 'string',
        description: 'Description of the board',
      },
    },
    required: ['project_id', 'name'],
  },
};