import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const WhoAmIArgsSchema = z.object({});

export async function whoAmI(
  client: ProductiveAPIClient,
  args: unknown,
  config?: { PRODUCTIVE_USER_ID?: string }
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    WhoAmIArgsSchema.parse(args);
    
    if (!config?.PRODUCTIVE_USER_ID) {
      return {
        content: [{
          type: 'text',
          text: 'No user is configured. Set PRODUCTIVE_USER_ID environment variable to enable user context.',
        }],
      };
    }
    
    // Try to get the user details from the API
    try {
      const response = await client.listPeople({
        limit: 1,
      });
      
      // Find the configured user in the response
      const currentUser = response.data.find(person => person.id === config.PRODUCTIVE_USER_ID);
      
      if (currentUser) {
        const fullName = `${currentUser.attributes.first_name} ${currentUser.attributes.last_name}`.trim();
        return {
          content: [{
            type: 'text',
            text: `Current user: ${fullName} (ID: ${config.PRODUCTIVE_USER_ID}, Email: ${currentUser.attributes.email})
            
When you use "me" in any command, it refers to this user.`,
          }],
        };
      }
    } catch (error) {
      // If we can't fetch user details, just show the ID
    }
    
    return {
      content: [{
        type: 'text',
        text: `Current user ID: ${config.PRODUCTIVE_USER_ID}
        
When you use "me" in any command, it refers to this user ID.`,
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

export const whoAmITool = {
  name: 'whoami',
  description: 'Get the current user context. Shows which user ID is configured as "me" for all operations.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};