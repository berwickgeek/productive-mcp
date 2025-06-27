import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';

const ListPeopleArgsSchema = z.object({
  company_id: z.string().optional().describe('Filter people by company ID'),
  project_id: z.string().optional().describe('Filter people assigned to a specific project'),
  is_active: z.boolean().optional().describe('Filter by active status'),
  email: z.string().optional().describe('Filter by email address'),
  limit: z.number().positive().max(100).default(50).optional().describe('Maximum number of people to return'),
  page: z.number().positive().default(1).optional().describe('Page number for pagination'),
});

export async function listPeople(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = ListPeopleArgsSchema.parse(args);
    const response = await client.listPeople(params);
    
    const peopleList = response.data.map(person => {
      const fullName = `${person.attributes.first_name} ${person.attributes.last_name}`.trim();
      const status = person.attributes.is_active ? 'Active' : 'Inactive';
      
      return `• ${fullName} (ID: ${person.id})
  - Email: ${person.attributes.email}
  - Title: ${person.attributes.title || 'N/A'}
  - Role: ${person.attributes.role || 'N/A'}
  - Status: ${status}`;
    }).join('\n\n');
    
    const totalCount = response.meta?.total_count || response.data.length;
    const summary = `Found ${totalCount} people${params.project_id ? ' on project' : ''}${params.company_id ? ' in company' : ''}:\n\n${peopleList}`;
    
    return {
      content: [{
        type: 'text',
        text: summary,
      }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid parameters: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
    }
    throw error;
  }
}

export const listPeopleTool = {
  name: 'list_people',
  description: 'List people in the organization with optional filters',
  inputSchema: {
    type: 'object',
    properties: {
      company_id: {
        type: 'string',
        description: 'Filter people by company ID',
      },
      project_id: {
        type: 'string',
        description: 'Filter people assigned to a specific project',
      },
      is_active: {
        type: 'boolean',
        description: 'Filter by active status',
      },
      email: {
        type: 'string',
        description: 'Filter by email address',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of people to return (default: 50, max: 100)',
      },
      page: {
        type: 'number',
        description: 'Page number for pagination (default: 1)',
      },
    },
  },
};

const GetProjectPeopleArgsSchema = z.object({
  project_id: z.string().describe('The project ID to get people for'),
  is_active: z.boolean().optional().default(true).describe('Filter by active status'),
  limit: z.number().positive().max(100).default(50).optional().describe('Maximum number of people to return'),
  page: z.number().positive().default(1).optional().describe('Page number for pagination'),
});

export async function getProjectPeople(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = GetProjectPeopleArgsSchema.parse(args);
    const response = await client.listPeople({
      project_id: params.project_id,
      is_active: params.is_active,
      limit: params.limit,
      page: params.page,
    });
    
    if (response.data.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `No people found assigned to project ${params.project_id}.`,
        }],
      };
    }
    
    const peopleList = response.data.map(person => {
      const fullName = `${person.attributes.first_name} ${person.attributes.last_name}`.trim();
      const status = person.attributes.is_active ? 'Active' : 'Inactive';
      
      return `• ${fullName} (ID: ${person.id})
  - Email: ${person.attributes.email}
  - Title: ${person.attributes.title || 'N/A'}
  - Role: ${person.attributes.role || 'N/A'}
  - Status: ${status}`;
    }).join('\n\n');
    
    const totalCount = response.meta?.total_count || response.data.length;
    const summary = `Found ${totalCount} people assigned to project ${params.project_id}:\n\n${peopleList}`;
    
    return {
      content: [{
        type: 'text',
        text: summary,
      }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid parameters: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
    }
    throw error;
  }
}

export const getProjectPeopleTool = {
  name: 'get_project_people',
  description: 'Get all people assigned to a specific project',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        description: 'The project ID to get people for',
      },
      is_active: {
        type: 'boolean',
        description: 'Filter by active status (default: true)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of people to return (default: 50, max: 100)',
      },
      page: {
        type: 'number',
        description: 'Page number for pagination (default: 1)',
      },
    },
    required: ['project_id'],
  },
};