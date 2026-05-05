import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { ProtocolError, ProtocolErrorCode } from '@modelcontextprotocol/server';

// ---- Schemas ----

const listTodosSchema = z.object({
  task_id: z.string().optional(),
  status: z.enum(['open', 'closed']).optional(),
  limit: z.number().min(1).max(200).default(50).optional(),
});

const getTodoSchema = z.object({
  todo_id: z.string().min(1, 'Todo ID is required'),
});

const createTodoSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  task_id: z.string().optional(),
  deal_id: z.string().optional(),
  assignee_id: z.string().optional(),
  due_date: z.string().optional(),
});

const updateTodoSchema = z.object({
  todo_id: z.string().min(1, 'Todo ID is required'),
  description: z.string().optional(),
  closed: z.boolean().optional(),
  due_date: z.string().optional(),
});

const deleteTodoSchema = z.object({
  todo_id: z.string().min(1, 'Todo ID is required'),
});

// ---- Handlers ----

export async function listTodosTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = listTodosSchema.parse(args);

    const queryParams: Record<string, unknown> = {};
    if (params.task_id) queryParams.task_id = params.task_id;
    if (params.status) queryParams.status = params.status === 'open' ? 1 : 2;
    if (params.limit) queryParams.limit = params.limit;

    const response = await client.listTodos(queryParams);

    if (!response.data || response.data.length === 0) {
      return {
        content: [{ type: 'text', text: 'No todos found matching the criteria.' }],
      };
    }

    let text = `Found ${response.data.length} todo(s):\n\n`;

    for (const todo of response.data) {
      const attrs = todo.attributes;
      const closedStatus = attrs.closed ? 'Closed' : 'Open';
      text += `- [${closedStatus}] ${attrs.description}\n`;
      text += `  ID: ${todo.id}\n`;
      if (attrs.due_date) text += `  Due: ${attrs.due_date}\n`;
      if (attrs.position !== undefined) text += `  Position: ${attrs.position}\n`;
      text += `\n`;
    }

    return {
      content: [{ type: 'text', text: text.trimEnd() }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ProtocolError(
        ProtocolErrorCode.InvalidParams,
        `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`
      );
    }
    throw new ProtocolError(
      ProtocolErrorCode.InternalError,
      error instanceof Error ? error.message : 'Unknown error occurred'
    );
  }
}

export async function getTodoTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = getTodoSchema.parse(args);
    const response = await client.getTodo(params.todo_id);
    const todo = response.data;
    const attrs = todo.attributes;

    let text = `Todo: ${attrs.description}\n`;
    text += `ID: ${todo.id}\n`;
    text += `Status: ${attrs.closed ? 'Closed' : 'Open'}\n`;
    if (attrs.closed_at) text += `Closed at: ${attrs.closed_at}\n`;
    if (attrs.due_date) text += `Due date: ${attrs.due_date}\n`;
    if (attrs.due_time) text += `Due time: ${attrs.due_time}\n`;
    text += `Created at: ${attrs.created_at}\n`;
    if (attrs.todoable_type) text += `Todoable type: ${attrs.todoable_type}\n`;
    if (attrs.position !== undefined) text += `Position: ${attrs.position}\n`;

    if (todo.relationships?.task?.data) {
      text += `Task ID: ${todo.relationships.task.data.id}\n`;
    }
    if (todo.relationships?.deal?.data) {
      text += `Deal ID: ${todo.relationships.deal.data.id}\n`;
    }
    if (todo.relationships?.assignee?.data) {
      text += `Assignee ID: ${todo.relationships.assignee.data.id}\n`;
    }

    return {
      content: [{ type: 'text', text: text.trimEnd() }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ProtocolError(
        ProtocolErrorCode.InvalidParams,
        `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`
      );
    }
    throw new ProtocolError(
      ProtocolErrorCode.InternalError,
      error instanceof Error ? error.message : 'Unknown error occurred'
    );
  }
}

export async function createTodoTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = createTodoSchema.parse(args);

    const relationships: Record<string, { data: { id: string; type: string } }> = {};
    if (params.task_id) {
      relationships.task = { data: { id: params.task_id, type: 'tasks' } };
    }
    if (params.deal_id) {
      relationships.deal = { data: { id: params.deal_id, type: 'deals' } };
    }
    if (params.assignee_id) {
      relationships.assignee = { data: { id: params.assignee_id, type: 'people' } };
    }

    const todoData = {
      data: {
        type: 'todos' as const,
        attributes: {
          description: params.description,
          ...(params.due_date ? { due_date: params.due_date } : {}),
        },
        relationships,
      },
    };

    const response = await client.createTodo(todoData);
    const todo = response.data;

    let text = `Todo created successfully!\n`;
    text += `ID: ${todo.id}\n`;
    text += `Description: ${todo.attributes.description}`;
    if (todo.attributes.due_date) text += `\nDue date: ${todo.attributes.due_date}`;

    return {
      content: [{ type: 'text', text }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ProtocolError(
        ProtocolErrorCode.InvalidParams,
        `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`
      );
    }
    throw new ProtocolError(
      ProtocolErrorCode.InternalError,
      error instanceof Error ? error.message : 'Unknown error occurred'
    );
  }
}

export async function updateTodoTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = updateTodoSchema.parse(args);

    const attributes: Record<string, unknown> = {};
    if (params.description !== undefined) attributes.description = params.description;
    if (params.closed !== undefined) attributes.closed = params.closed;
    if (params.due_date !== undefined) attributes.due_date = params.due_date;

    const todoData = {
      data: {
        type: 'todos' as const,
        id: params.todo_id,
        attributes,
      },
    };

    const response = await client.updateTodo(params.todo_id, todoData);
    const todo = response.data;

    let text = `Todo updated successfully!\n`;
    text += `ID: ${todo.id}\n`;
    text += `Description: ${todo.attributes.description}\n`;
    text += `Status: ${todo.attributes.closed ? 'Closed' : 'Open'}`;
    if (todo.attributes.due_date) text += `\nDue date: ${todo.attributes.due_date}`;

    return {
      content: [{ type: 'text', text }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ProtocolError(
        ProtocolErrorCode.InvalidParams,
        `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`
      );
    }
    throw new ProtocolError(
      ProtocolErrorCode.InternalError,
      error instanceof Error ? error.message : 'Unknown error occurred'
    );
  }
}

export async function deleteTodoTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = deleteTodoSchema.parse(args);
    await client.deleteTodo(params.todo_id);

    return {
      content: [{ type: 'text', text: `Todo ${params.todo_id} deleted successfully.` }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ProtocolError(
        ProtocolErrorCode.InvalidParams,
        `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`
      );
    }
    throw new ProtocolError(
      ProtocolErrorCode.InternalError,
      error instanceof Error ? error.message : 'Unknown error occurred'
    );
  }
}

// ---- Definitions ----

export const listTodosDefinition = {
  name: 'list_todos',
  description: 'List todos from Productive.io, optionally filtered by task and status.',
  inputSchema: {
    type: 'object',
    properties: {
      task_id: {
        type: 'string',
        description: 'Filter todos by task ID',
      },
      status: {
        type: 'string',
        enum: ['open', 'closed'],
        description: 'Filter by status: "open" or "closed"',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of todos to return (1-200, default 50)',
      },
    },
    required: [],
  },
};

export const getTodoDefinition = {
  name: 'get_todo',
  description: 'Get a single todo by ID from Productive.io with all attributes.',
  inputSchema: {
    type: 'object',
    properties: {
      todo_id: {
        type: 'string',
        description: 'ID of the todo to retrieve (required)',
      },
    },
    required: ['todo_id'],
  },
};

export const createTodoDefinition = {
  name: 'create_todo',
  description: 'Create a new todo in Productive.io.',
  inputSchema: {
    type: 'object',
    properties: {
      description: {
        type: 'string',
        description: 'Description of the todo (required)',
      },
      task_id: {
        type: 'string',
        description: 'ID of the task to associate the todo with',
      },
      deal_id: {
        type: 'string',
        description: 'ID of the deal to associate the todo with',
      },
      assignee_id: {
        type: 'string',
        description: 'ID of the person to assign the todo to',
      },
      due_date: {
        type: 'string',
        description: 'Due date in YYYY-MM-DD format',
      },
    },
    required: ['description'],
  },
};

export const updateTodoDefinition = {
  name: 'update_todo',
  description: 'Update an existing todo in Productive.io.',
  inputSchema: {
    type: 'object',
    properties: {
      todo_id: {
        type: 'string',
        description: 'ID of the todo to update (required)',
      },
      description: {
        type: 'string',
        description: 'Updated description for the todo',
      },
      closed: {
        type: 'boolean',
        description: 'Set to true to close the todo, false to reopen it',
      },
      due_date: {
        type: 'string',
        description: 'Updated due date in YYYY-MM-DD format',
      },
    },
    required: ['todo_id'],
  },
};

export const deleteTodoDefinition = {
  name: 'delete_todo',
  description: 'Delete a todo from Productive.io.',
  inputSchema: {
    type: 'object',
    properties: {
      todo_id: {
        type: 'string',
        description: 'ID of the todo to delete (required)',
      },
    },
    required: ['todo_id'],
  },
};
