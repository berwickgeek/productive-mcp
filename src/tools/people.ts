import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

type ToolResult = { content: Array<{ type: string; text: string }> };

const listPeopleSchema = z.object({
  company_id: z.string().optional(),
  project_id: z.string().optional(),
  is_active: z.boolean().optional(),
  email: z.string().optional(),
  limit: z.number().min(1).max(200).default(30).optional(),
  page: z.number().min(1).optional(),
});

const getPersonSchema = z.object({
  person_id: z.string().min(1, 'Person ID is required'),
});

function handleError(error: unknown): never {
  if (error instanceof z.ZodError) {
    throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`);
  }
  throw new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : 'Unknown error occurred');
}

export async function listPeopleTool(client: ProductiveAPIClient, args: unknown): Promise<ToolResult> {
  try {
    const params = listPeopleSchema.parse(args || {});

    const response = await client.listPeople({
      company_id: params.company_id,
      project_id: params.project_id,
      is_active: params.is_active,
      email: params.email,
      limit: params.limit,
      page: params.page,
    });

    if (!response.data || response.data.length === 0) {
      return { content: [{ type: 'text', text: 'No people found matching the criteria.' }] };
    }

    const peopleText = response.data.map(person => {
      const name = `${person.attributes.first_name} ${person.attributes.last_name}`.trim();
      const companyId = person.relationships?.company?.data?.id;
      const status = person.attributes.is_active === false ? 'inactive' : 'active';
      return `• ${name} (ID: ${person.id})
  Email: ${person.attributes.email}
  Status: ${status}
  ${person.attributes.title ? `Title: ${person.attributes.title}` : ''}
  ${person.attributes.role ? `Role: ${person.attributes.role}` : ''}
  ${companyId ? `Company ID: ${companyId}` : ''}`.trim();
    }).join('\n\n');

    const total = response.meta?.total_count;
    const summary = `Found ${response.data.length} person/people${total ? ` (showing ${response.data.length} of ${total})` : ''}:\n\n${peopleText}`;

    return { content: [{ type: 'text', text: summary }] };
  } catch (error) {
    handleError(error);
  }
}

export async function getPersonTool(client: ProductiveAPIClient, args: unknown): Promise<ToolResult> {
  try {
    const params = getPersonSchema.parse(args);
    const response = await client.getPerson(params.person_id);
    const person = response.data;
    const name = `${person.attributes.first_name} ${person.attributes.last_name}`.trim();
    const companyId = person.relationships?.company?.data?.id;
    const status = person.attributes.is_active === false ? 'inactive' : 'active';

    let text = `Person Details:\n\n`;
    text += `Name: ${name}\n`;
    text += `ID: ${person.id}\n`;
    text += `Email: ${person.attributes.email}\n`;
    text += `Status: ${status}\n`;
    if (person.attributes.title) text += `Title: ${person.attributes.title}\n`;
    if (person.attributes.role) text += `Role: ${person.attributes.role}\n`;
    if (companyId) text += `Company ID: ${companyId}\n`;
    if (person.attributes.created_at) text += `Created: ${person.attributes.created_at}\n`;

    return { content: [{ type: 'text', text }] };
  } catch (error) {
    handleError(error);
  }
}

export const listPeopleDefinition = {
  name: 'list_people',
  description: 'List people (team members) in your Productive.io organization. Use to find person IDs for task assignment, time entries, and filtering. Supports filtering by company, project membership, active status, and email.',
  inputSchema: {
    type: 'object',
    properties: {
      company_id: { type: 'string', description: 'Filter by company ID' },
      project_id: { type: 'string', description: 'Filter by project membership (people assigned to this project)' },
      is_active: { type: 'boolean', description: 'Filter by active status (true = active, false = inactive/archived)' },
      email: { type: 'string', description: 'Filter by email address' },
      limit: { type: 'number', description: 'Number of results to return (1-200, default: 30)', minimum: 1, maximum: 200, default: 30 },
      page: { type: 'number', description: 'Page number for pagination', minimum: 1 },
    },
  },
};

export const getPersonDefinition = {
  name: 'get_person',
  description: 'Get detailed information about a specific person by their ID.',
  inputSchema: {
    type: 'object',
    properties: {
      person_id: { type: 'string', description: 'The ID of the person to retrieve (required)' },
    },
    required: ['person_id'],
  },
};
