import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { ProtocolError, ProtocolErrorCode } from '@modelcontextprotocol/server';

// ---- List Folders ----

const ListFoldersSchema = z.object({
  project_id: z.string().optional().describe('Filter folders by project ID'),
  status: z.number().optional().describe('Filter by status (1=active, 2=archived)'),
  limit: z.number().optional().default(30).describe('Number of folders to return (max 200)'),
});

export async function listFolders(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = ListFoldersSchema.parse(args || {});

    const response = await client.listFolders({
      project_id: params.project_id,
      status: params.status,
      limit: params.limit,
    });

    if (!response || !response.data || response.data.length === 0) {
      const filterText = params.project_id ? ` for project ${params.project_id}` : '';
      return {
        content: [{
          type: 'text',
          text: `No folders found${filterText}`,
        }],
      };
    }

    const foldersText = response.data.filter(folder => folder && folder.attributes).map(folder => {
      let text = `Folder: ${folder.attributes.name} (ID: ${folder.id})`;
      if (folder.attributes.position !== undefined) {
        text += `\nPosition: ${folder.attributes.position}`;
      }
      if (folder.attributes.archived_at) {
        text += `\nArchived at: ${folder.attributes.archived_at}`;
      }
      if (folder.relationships?.project?.data?.id) {
        text += `\nProject ID: ${folder.relationships.project.data.id}`;
      }
      return text;
    }).join('\n\n');

    return {
      content: [{
        type: 'text',
        text: foldersText,
      }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ProtocolError(
        ProtocolErrorCode.InvalidParams,
        `Invalid parameters: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      );
    }

    if (error instanceof Error) {
      throw new ProtocolError(
        ProtocolErrorCode.InternalError,
        `API error: ${error.message}`
      );
    }

    throw new ProtocolError(
      ProtocolErrorCode.InternalError,
      'Unknown error occurred while fetching folders'
    );
  }
}

export const listFoldersTool = {
  name: 'list_folders',
  description: 'Get a list of folders from Productive.io',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        description: 'Filter folders by project ID',
      },
      status: {
        type: 'number',
        description: 'Filter by status (1=active, 2=archived)',
      },
      limit: {
        type: 'number',
        description: 'Number of folders to return (max 200)',
        default: 30,
      },
    },
  },
};

// ---- Get Folder ----

const GetFolderSchema = z.object({
  folder_id: z.string().describe('The ID of the folder to retrieve'),
});

export async function getFolder(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = GetFolderSchema.parse(args || {});

    const response = await client.getFolder(params.folder_id);

    const folder = response.data;
    let text = `Folder: ${folder.attributes.name} (ID: ${folder.id})`;
    if (folder.attributes.position !== undefined) {
      text += `\nPosition: ${folder.attributes.position}`;
    }
    if (folder.attributes.archived_at) {
      text += `\nArchived at: ${folder.attributes.archived_at}`;
    }
    if (folder.attributes.hidden !== undefined) {
      text += `\nHidden: ${folder.attributes.hidden}`;
    }
    if (folder.attributes.created_at) {
      text += `\nCreated at: ${folder.attributes.created_at}`;
    }
    if (folder.attributes.updated_at) {
      text += `\nUpdated at: ${folder.attributes.updated_at}`;
    }
    if (folder.relationships?.project?.data?.id) {
      text += `\nProject ID: ${folder.relationships.project.data.id}`;
    }

    return {
      content: [{
        type: 'text',
        text: text,
      }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ProtocolError(
        ProtocolErrorCode.InvalidParams,
        `Invalid parameters: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      );
    }

    if (error instanceof Error) {
      throw new ProtocolError(
        ProtocolErrorCode.InternalError,
        `API error: ${error.message}`
      );
    }

    throw new ProtocolError(
      ProtocolErrorCode.InternalError,
      'Unknown error occurred while fetching folder'
    );
  }
}

export const getFolderTool = {
  name: 'get_folder',
  description: 'Get details of a specific folder from Productive.io',
  inputSchema: {
    type: 'object',
    properties: {
      folder_id: {
        type: 'string',
        description: 'The ID of the folder to retrieve',
      },
    },
    required: ['folder_id'],
  },
};

// ---- Create Folder ----

const CreateFolderSchema = z.object({
  project_id: z.string().describe('The ID of the project to create the folder in'),
  name: z.string().describe('Name of the folder'),
});

export async function createFolder(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = CreateFolderSchema.parse(args || {});

    const folderData = {
      data: {
        type: 'folders' as const,
        attributes: {
          name: params.name,
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

    const response = await client.createFolder(folderData);

    let text = `Folder created successfully!\n`;
    text += `Name: ${response.data.attributes.name} (ID: ${response.data.id})`;
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
      throw new ProtocolError(
        ProtocolErrorCode.InvalidParams,
        `Invalid parameters: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      );
    }

    if (error instanceof Error) {
      throw new ProtocolError(
        ProtocolErrorCode.InternalError,
        `API error: ${error.message}`
      );
    }

    throw new ProtocolError(
      ProtocolErrorCode.InternalError,
      'Unknown error occurred while creating folder'
    );
  }
}

export const createFolderTool = {
  name: 'create_folder',
  description: 'Create a new folder in a Productive.io project',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        description: 'The ID of the project to create the folder in',
      },
      name: {
        type: 'string',
        description: 'Name of the folder',
      },
    },
    required: ['project_id', 'name'],
  },
};

// ---- Update Folder ----

const UpdateFolderSchema = z.object({
  folder_id: z.string().describe('The ID of the folder to update'),
  name: z.string().optional().describe('New name for the folder'),
});

export async function updateFolder(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = UpdateFolderSchema.parse(args || {});

    const folderData = {
      data: {
        type: 'folders' as const,
        id: params.folder_id,
        attributes: {
          ...(params.name !== undefined && { name: params.name }),
        },
      },
    };

    const response = await client.updateFolder(params.folder_id, folderData);

    let text = `Folder updated successfully!\n`;
    text += `Name: ${response.data.attributes.name} (ID: ${response.data.id})`;
    if (response.data.attributes.updated_at) {
      text += `\nUpdated at: ${response.data.attributes.updated_at}`;
    }

    return {
      content: [{
        type: 'text',
        text: text,
      }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ProtocolError(
        ProtocolErrorCode.InvalidParams,
        `Invalid parameters: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      );
    }

    if (error instanceof Error) {
      throw new ProtocolError(
        ProtocolErrorCode.InternalError,
        `API error: ${error.message}`
      );
    }

    throw new ProtocolError(
      ProtocolErrorCode.InternalError,
      'Unknown error occurred while updating folder'
    );
  }
}

export const updateFolderTool = {
  name: 'update_folder',
  description: 'Update an existing folder in Productive.io',
  inputSchema: {
    type: 'object',
    properties: {
      folder_id: {
        type: 'string',
        description: 'The ID of the folder to update',
      },
      name: {
        type: 'string',
        description: 'New name for the folder',
      },
    },
    required: ['folder_id'],
  },
};

// ---- Archive Folder ----

const ArchiveFolderSchema = z.object({
  folder_id: z.string().describe('The ID of the folder to archive'),
});

export async function archiveFolder(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = ArchiveFolderSchema.parse(args || {});

    await client.archiveFolder(params.folder_id);

    return {
      content: [{
        type: 'text',
        text: `Folder ${params.folder_id} archived successfully.`,
      }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ProtocolError(
        ProtocolErrorCode.InvalidParams,
        `Invalid parameters: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      );
    }

    if (error instanceof Error) {
      throw new ProtocolError(
        ProtocolErrorCode.InternalError,
        `API error: ${error.message}`
      );
    }

    throw new ProtocolError(
      ProtocolErrorCode.InternalError,
      'Unknown error occurred while archiving folder'
    );
  }
}

export const archiveFolderTool = {
  name: 'archive_folder',
  description: 'Archive a folder in Productive.io',
  inputSchema: {
    type: 'object',
    properties: {
      folder_id: {
        type: 'string',
        description: 'The ID of the folder to archive',
      },
    },
    required: ['folder_id'],
  },
};

// ---- Restore Folder ----

const RestoreFolderSchema = z.object({
  folder_id: z.string().describe('The ID of the folder to restore'),
});

export async function restoreFolder(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = RestoreFolderSchema.parse(args || {});

    await client.restoreFolder(params.folder_id);

    return {
      content: [{
        type: 'text',
        text: `Folder ${params.folder_id} restored successfully.`,
      }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ProtocolError(
        ProtocolErrorCode.InvalidParams,
        `Invalid parameters: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      );
    }

    if (error instanceof Error) {
      throw new ProtocolError(
        ProtocolErrorCode.InternalError,
        `API error: ${error.message}`
      );
    }

    throw new ProtocolError(
      ProtocolErrorCode.InternalError,
      'Unknown error occurred while restoring folder'
    );
  }
}

export const restoreFolderTool = {
  name: 'restore_folder',
  description: 'Restore an archived folder in Productive.io',
  inputSchema: {
    type: 'object',
    properties: {
      folder_id: {
        type: 'string',
        description: 'The ID of the folder to restore',
      },
    },
    required: ['folder_id'],
  },
};
