import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const listCompaniesSchema = z.object({
  status: z.enum(['active', 'archived']).optional(),
  limit: z.number().min(1).max(200).default(30).optional(),
});

export async function listCompaniesTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = listCompaniesSchema.parse(args);
    
    const response = await client.listCompanies({
      status: params.status,
      limit: params.limit,
    });
    
    if (!response.data || response.data.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'No companies found matching the criteria.',
        }],
      };
    }
    
    const companiesText = response.data.map(company => {
      const tags = company.attributes.tag_list?.length 
        ? `Tags: ${company.attributes.tag_list.join(', ')}` 
        : '';
      
      return `• ${company.attributes.name} (ID: ${company.id})
  ${company.attributes.domain ? `Domain: ${company.attributes.domain}` : 'No domain'}
  ${company.attributes.description ? `Description: ${company.attributes.description}` : ''}
  ${tags}`;
    }).join('\n\n');
    
    const summary = `Found ${response.data.length} compan${response.data.length !== 1 ? 'ies' : 'y'}${response.meta?.total_count ? ` (showing ${response.data.length} of ${response.meta.total_count})` : ''}:\n\n${companiesText}`;
    
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

export const listCompaniesDefinition = {
  name: 'list_companies',
  description: 'Get a list of companies/customers from Productive.io',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['active', 'archived'],
        description: 'Filter by company status',
      },
      limit: {
        type: 'number',
        description: 'Number of companies to return (1-200)',
        minimum: 1,
        maximum: 200,
        default: 30,
      },
    },
  },
};