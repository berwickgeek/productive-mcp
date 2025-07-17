import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { ProductiveTaskList } from '../api/types.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const addToBacklogSchema = z.object({
  task_id: z.string().describe('ID of the task to add to backlog'),
  project_id: z.string().describe('ID of the project containing the task')
});

export async function addToBacklog(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const { task_id, project_id } = addToBacklogSchema.parse(args);
    
    // First, find all boards in the project
    const boardsResponse = await client.listBoards({ project_id });
    
    if (boardsResponse.data.length === 0) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `No boards found in project ${project_id}. Cannot create backlog.`
      );
    }
    
    // Look for a Backlog task list in each board
    let backlogListId: string | null = null;
    let boardId: string | null = null;
    
    for (const board of boardsResponse.data) {
      const taskListsResponse = await client.listTaskLists({ board_id: board.id });
      const backlogList = taskListsResponse.data.find(
        list => list.attributes.name.toLowerCase() === 'backlog'
      );
      
      if (backlogList) {
        backlogListId = backlogList.id;
        boardId = board.id;
        break;
      }
    }
    
    // If no backlog list found, create one in the first board
    if (!backlogListId) {
      boardId = boardsResponse.data[0].id;
      const createResponse = await client.createTaskList({
        data: {
          type: 'task_lists',
          attributes: {
            name: 'Backlog',
            description: 'Product backlog for unscheduled tasks',
            project_id: project_id
          },
          relationships: {
            board: {
              data: {
                id: boardId,
                type: 'boards'
              }
            }
          }
        }
      });
      
      backlogListId = createResponse.data.id;
    }
    
    // Move the task to the backlog
    await client.updateTask(task_id, {
      data: {
        type: 'tasks',
        id: task_id,
        relationships: {
          task_list: {
            data: {
              type: 'task_lists',
              id: backlogListId
            }
          }
        }
      }
    });
    
    return {
      content: [{
        type: 'text',
        text: `✅ Moved task ${task_id} to Backlog (list ID: ${backlogListId})`
      }]
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`
      );
    }
    throw error;
  }
}

export const addToBacklogTool = {
  name: 'add_to_backlog',
  description: 'Add a task to the project backlog. Creates a Backlog task list if it doesn\'t exist.',
  inputSchema: {
    type: 'object',
    properties: {
      task_id: {
        type: 'string',
        description: 'ID of the task to add to backlog'
      },
      project_id: {
        type: 'string',
        description: 'ID of the project containing the task'
      }
    },
    required: ['task_id', 'project_id']
  }
};