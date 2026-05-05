import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { ProtocolError, ProtocolErrorCode } from '@modelcontextprotocol/server';

// ---- Schemas ----

const listPagesSchema = z.object({
  project_id: z.string().optional(),
  sort: z.enum(['created_at', 'title', 'edited_at', 'updated_at']).optional(),
  limit: z.number().min(1).max(200).default(30).optional(),
});

const getPageSchema = z.object({
  page_id: z.string().min(1, 'Page ID is required'),
});

const createPageSchema = z.object({
  project_id: z.string().min(1, 'Project ID is required'),
  title: z.string().min(1, 'Title is required'),
  body: z.string().optional(),
  parent_page_id: z.number().optional().describe('ID of parent page (must also set root_page_id)'),
  root_page_id: z.number().optional().describe('ID of root page in the hierarchy (must also set parent_page_id)'),
});

const updatePageSchema = z.object({
  page_id: z.string().min(1, 'Page ID is required'),
  title: z.string().optional(),
  body: z.string().optional(),
});

const deletePageSchema = z.object({
  page_id: z.string().min(1, 'Page ID is required'),
});

const movePageSchema = z.object({
  page_id: z.string().min(1, 'Page ID is required'),
  target_doc_id: z.string().min(1, 'Target document ID is required'),
});

const copyPageSchema = z.object({
  template_id: z.string().min(1, 'Template ID (page to copy) is required'),
  project_id: z.string().optional().describe('Project ID to copy the page into (defaults to same project)'),
});

// ---- Handlers ----

export async function listPagesTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = listPagesSchema.parse(args || {});

    const response = await client.listPages({
      project_id: params.project_id,
      sort: params.sort,
      limit: params.limit,
    });

    if (!response || !response.data || response.data.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'No pages found matching the criteria.',
        }],
      };
    }

    const pagesText = response.data.filter(page => page && page.attributes).map(page => {
      const projectId = page.relationships?.project?.data?.id;
      return `• ${page.attributes.title} (ID: ${page.id})
  ${projectId ? `Project ID: ${projectId}` : ''}
  ${page.attributes.edited_at ? `Edited at: ${page.attributes.edited_at}` : ''}
  ${page.attributes.version_number != null ? `Version: ${page.attributes.version_number}` : ''}`;
    }).join('\n\n');

    const summary = `Found ${response.data.length} page${response.data.length !== 1 ? 's' : ''}${response.meta?.total_count ? ` (showing ${response.data.length} of ${response.meta.total_count})` : ''}:\n\n${pagesText}`;

    return {
      content: [{
        type: 'text',
        text: summary,
      }],
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

export async function getPageTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = getPageSchema.parse(args);
    const response = await client.getPage(params.page_id);
    const page = response.data;

    const creatorId = page.relationships?.creator?.data?.id;
    const creatorResource = creatorId && response.included
      ? response.included.find((item: { type: string; id: string }) => item.type === 'people' && item.id === creatorId)
      : undefined;
    const creatorName = creatorResource
      ? `${creatorResource.attributes.first_name || ''} ${creatorResource.attributes.last_name || ''}`.trim()
      : undefined;

    const projectId = page.relationships?.project?.data?.id;
    const projectResource = projectId && response.included
      ? response.included.find((item: { type: string; id: string }) => item.type === 'projects' && item.id === projectId)
      : undefined;
    const projectName = projectResource?.attributes?.name;

    let text = `Page: ${page.attributes.title} (ID: ${page.id})\n`;
    if (projectName) text += `Project: ${projectName} (ID: ${projectId})\n`;
    else if (projectId) text += `Project ID: ${projectId}\n`;
    if (creatorName) text += `Creator: ${creatorName}\n`;
    if (page.attributes.public_access != null) text += `Public access: ${page.attributes.public_access}\n`;
    if (page.attributes.version_number != null) text += `Version: ${page.attributes.version_number}\n`;
    if (page.attributes.parent_page_id != null) text += `Parent page ID: ${page.attributes.parent_page_id}\n`;
    if (page.attributes.root_page_id != null) text += `Root page ID: ${page.attributes.root_page_id}\n`;
    text += `Created at: ${page.attributes.created_at}\n`;
    text += `Updated at: ${page.attributes.updated_at}\n`;
    if (page.attributes.edited_at) text += `Edited at: ${page.attributes.edited_at}\n`;
    if (page.attributes.last_activity_at) text += `Last activity at: ${page.attributes.last_activity_at}\n`;
    text += `\nBody:\n${page.attributes.body || '(empty)'}`;

    return {
      content: [{
        type: 'text',
        text,
      }],
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

export async function createPageTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = createPageSchema.parse(args);

    const response = await client.createPage({
      data: {
        type: 'pages',
        attributes: {
          title: params.title,
          body: params.body,
          parent_page_id: params.parent_page_id,
          root_page_id: params.root_page_id,
        },
        relationships: {
          project: {
            data: { id: params.project_id, type: 'projects' },
          },
        },
      },
    });

    const page = response.data;

    let text = `Page created successfully!\n`;
    text += `Title: ${page.attributes.title}\n`;
    text += `Page ID: ${page.id}\n`;
    text += `Project ID: ${params.project_id}\n`;
    if (params.parent_page_id != null) text += `Parent page ID: ${params.parent_page_id}\n`;
    text += `Created at: ${page.attributes.created_at}`;

    return {
      content: [{
        type: 'text',
        text,
      }],
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

export async function updatePageTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = updatePageSchema.parse(args);

    const attributes: { title?: string; body?: string } = {};
    if (params.title !== undefined) attributes.title = params.title;
    if (params.body !== undefined) attributes.body = params.body;

    const response = await client.updatePage(params.page_id, {
      data: {
        type: 'pages',
        id: params.page_id,
        attributes,
      },
    });

    const page = response.data;

    let text = `Page updated successfully!\n`;
    text += `Title: ${page.attributes.title}\n`;
    text += `Page ID: ${page.id}\n`;
    text += `Updated at: ${page.attributes.updated_at}`;

    return {
      content: [{
        type: 'text',
        text,
      }],
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

export async function deletePageTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = deletePageSchema.parse(args);
    await client.deletePage(params.page_id);

    return {
      content: [{
        type: 'text',
        text: `Page ${params.page_id} deleted successfully.`,
      }],
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

export async function movePageTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = movePageSchema.parse(args);
    await client.movePage(params.page_id, params.target_doc_id);

    return {
      content: [{
        type: 'text',
        text: `Page ${params.page_id} moved under document ${params.target_doc_id} successfully.`,
      }],
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

export async function copyPageTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = copyPageSchema.parse(args);
    const response = await client.copyPage(params.template_id, params.project_id);
    const page = response.data;

    let text = `Page copied successfully!\n`;
    text += `Title: ${page.attributes.title}\n`;
    text += `New page ID: ${page.id}\n`;
    text += `Created at: ${page.attributes.created_at}`;

    return {
      content: [{
        type: 'text',
        text,
      }],
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

export const listPagesDefinition = {
  name: 'list_pages',
  description: 'List pages/documents from Productive.io. Optionally filter by project and sort by various fields.',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        description: 'Filter pages by project ID',
      },
      sort: {
        type: 'string',
        enum: ['created_at', 'title', 'edited_at', 'updated_at'],
        description: 'Sort pages by a field',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of pages to return (1-200, default 30)',
      },
    },
    required: [],
  },
};

export const getPageDefinition = {
  name: 'get_page',
  description: 'Get a single page/document from Productive.io by ID, including full body content, creator, and project details.',
  inputSchema: {
    type: 'object',
    properties: {
      page_id: {
        type: 'string',
        description: 'ID of the page to retrieve (required)',
      },
    },
    required: ['page_id'],
  },
};

export const createPageDefinition = {
  name: 'create_page',
  description: 'Create a new page/document in Productive.io. The body supports HTML formatting.',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        description: 'ID of the project to create the page in (required)',
      },
      title: {
        type: 'string',
        description: 'Title of the page (required)',
      },
      body: {
        type: 'string',
        description: 'Body content of the page (optional). Supports HTML formatting.',
      },
      parent_page_id: {
        type: 'number',
        description: 'ID of the parent page to nest this page under. Must be set together with root_page_id.',
      },
      root_page_id: {
        type: 'number',
        description: 'ID of the root (top-level) page in the hierarchy. Must be set together with parent_page_id. For direct children of root, set both to the root page ID.',
      },
    },
    required: ['project_id', 'title'],
  },
};

export const updatePageDefinition = {
  name: 'update_page',
  description: 'Update an existing page/document in Productive.io. Supports updating title and/or body.',
  inputSchema: {
    type: 'object',
    properties: {
      page_id: {
        type: 'string',
        description: 'ID of the page to update (required)',
      },
      title: {
        type: 'string',
        description: 'New title for the page',
      },
      body: {
        type: 'string',
        description: 'New body content for the page. Supports HTML formatting.',
      },
    },
    required: ['page_id'],
  },
};

export const deletePageDefinition = {
  name: 'delete_page',
  description: 'Delete a page/document from Productive.io.',
  inputSchema: {
    type: 'object',
    properties: {
      page_id: {
        type: 'string',
        description: 'ID of the page to delete (required)',
      },
    },
    required: ['page_id'],
  },
};

export const movePageDefinition = {
  name: 'move_page',
  description: 'Move a page/document under another page in Productive.io.',
  inputSchema: {
    type: 'object',
    properties: {
      page_id: {
        type: 'string',
        description: 'ID of the page to move (required)',
      },
      target_doc_id: {
        type: 'string',
        description: 'ID of the parent page to move this page under (required)',
      },
    },
    required: ['page_id', 'target_doc_id'],
  },
};

export const copyPageDefinition = {
  name: 'copy_page',
  description: 'Copy a page/document from a template in Productive.io.',
  inputSchema: {
    type: 'object',
    properties: {
      template_id: {
        type: 'string',
        description: 'ID of the page to use as a template for the copy (required)',
      },
      project_id: {
        type: 'string',
        description: 'Project ID to copy the page into (optional, defaults to same project)',
      },
    },
    required: ['template_id'],
  },
};
