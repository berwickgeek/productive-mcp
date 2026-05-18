import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const listPeopleSchema = z.object({
  company_id: z.string().optional(),
  project_id: z.string().optional(),
  is_active: z.boolean().default(true).optional(),
  email: z.string().optional(),
  limit: z.number().min(1).max(200).default(30).optional(),
});

const getPersonSchema = z.object({
  person_id: z.string().min(1, 'Person ID is required'),
});

export async function listPeopleTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = listPeopleSchema.parse(args || {});

    const response = await client.listPeople({
      company_id: params.company_id,
      project_id: params.project_id,
      is_active: params.is_active,
      email: params.email,
      limit: params.limit,
    });

    if (!response || !response.data || response.data.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'No people found matching the criteria.',
        }],
      };
    }

    const peopleText = response.data.filter(person => person && person.attributes).map(person => {
      const attrs = person.attributes;
      const name = `${attrs.first_name} ${attrs.last_name}`.trim();
      const lines = [`• ${name} (ID: ${person.id})`];

      if (attrs.email) lines.push(`  Email: ${attrs.email}`);
      if (attrs.title) lines.push(`  Title: ${attrs.title}`);
      if (attrs.role) lines.push(`  Role: ${attrs.role}`);
      if (attrs.is_active !== undefined) lines.push(`  Active: ${attrs.is_active}`);

      return lines.join('\n');
    }).join('\n\n');

    const summary = `Found ${response.data.length} ${response.data.length !== 1 ? 'people' : 'person'}${response.meta?.total_count ? ` (showing ${response.data.length} of ${response.meta.total_count})` : ''}:\n\n${peopleText}`;

    return {
      content: [{
        type: 'text',
        text: summary,
      }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`
      );
    }

    throw new McpError(
      ErrorCode.InternalError,
      error instanceof Error ? error.message : 'Unknown error occurred'
    );
  }
}

export async function getPersonTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = getPersonSchema.parse(args);

    const response = await client.getPerson(params.person_id);

    if (!response || !response.data) {
      return {
        content: [{
          type: 'text',
          text: `No person found with ID: ${params.person_id}`,
        }],
      };
    }

    const person = response.data;
    const attrs = person.attributes;
    const name = `${attrs.first_name} ${attrs.last_name}`.trim();

    const lines = [
      `${name} (ID: ${person.id})`,
      `Email: ${attrs.email}`,
    ];

    if (attrs.title) lines.push(`Title: ${attrs.title}`);
    if (attrs.role) lines.push(`Role: ${attrs.role}`);
    if (attrs.is_active !== undefined) lines.push(`Active: ${attrs.is_active}`);
    if (attrs.created_at) lines.push(`Created: ${attrs.created_at}`);

    return {
      content: [{
        type: 'text',
        text: lines.join('\n'),
      }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`
      );
    }

    throw new McpError(
      ErrorCode.InternalError,
      error instanceof Error ? error.message : 'Unknown error occurred'
    );
  }
}

export const listPeopleDefinition = {
  name: 'list_people',
  description: 'List people/members in the organization. Use project_id to see who is on a specific project. Returns person IDs that can be used with update_task_assignment.',
  inputSchema: {
    type: 'object',
    properties: {
      company_id: {
        type: 'string',
        description: 'Filter people by company ID',
      },
      project_id: {
        type: 'string',
        description: 'Filter people by project ID (shows who is on a project)',
      },
      is_active: {
        type: 'boolean',
        description: 'Filter by active status (default: true)',
        default: true,
      },
      email: {
        type: 'string',
        description: 'Filter by email address',
      },
      limit: {
        type: 'number',
        description: 'Number of people to return (1-200)',
        minimum: 1,
        maximum: 200,
        default: 30,
      },
    },
  },
};

export const getPersonDefinition = {
  name: 'get_person',
  description: 'Get details of a specific person by their ID.',
  inputSchema: {
    type: 'object',
    properties: {
      person_id: {
        type: 'string',
        description: 'The ID of the person to retrieve',
      },
    },
    required: ['person_id'],
  },
};
