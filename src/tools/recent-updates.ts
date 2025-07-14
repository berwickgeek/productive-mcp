import { z } from 'zod';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ProductiveAPIClient } from '../api/client.js';

const RecentUpdatesRequestSchema = z.object({
  project_id: z.string().optional(),
  days_back: z.number().min(1).max(30).default(7),
  limit: z.number().min(1).max(200).optional(),
});

export async function getRecentUpdates(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = RecentUpdatesRequestSchema.parse(args);
    
    // Calculate date range
    const afterDate = new Date();
    afterDate.setDate(afterDate.getDate() - params.days_back);
    const after = afterDate.toISOString();
    
    // Get activities for the specified timeframe
    const response = await client.listActivities({
      project_id: params.project_id,
      after,
      event: 'update', // Focus on updates only
      limit: params.limit || 100,
    });

    const activities = response.data;
    
    // Group activities by item type and summarize
    const summary: Record<string, { count: number; items: Set<string> }> = {};
    const detailedUpdates: Array<{
      date: string;
      type: string;
      id: string;
      changes: Record<string, any>;
      creator?: string;
    }> = [];
    
    for (const activity of activities) {
      const itemType = activity.attributes.item_type;
      const itemId = activity.attributes.item_id;
      
      if (!summary[itemType]) {
        summary[itemType] = { count: 0, items: new Set() };
      }
      
      summary[itemType].count++;
      summary[itemType].items.add(itemId);
      
      detailedUpdates.push({
        date: new Date(activity.attributes.created_at).toLocaleString(),
        type: itemType,
        id: itemId,
        changes: activity.attributes.changes || {},
        creator: activity.relationships?.creator?.data?.id,
      });
    }
    
    let output = `## Recent Updates Summary (Last ${params.days_back} Days)\n\n`;
    
    if (params.project_id) {
      output += `**Project ID:** ${params.project_id}\n\n`;
    }
    
    if (Object.keys(summary).length === 0) {
      output += 'No updates found in the specified timeframe.';
    } else {
      output += '### Summary by Item Type:\n';
      for (const [itemType, data] of Object.entries(summary)) {
        output += `• **${itemType}**: ${data.count} updates across ${data.items.size} items\n`;
      }
      
      output += '\n### Detailed Updates:\n\n';
      
      // Sort by date (most recent first)
      detailedUpdates.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      for (const update of detailedUpdates) {
        output += `**${update.date}** - ${update.type} (ID: ${update.id})\n`;
        
        if (update.creator) {
          output += `  👤 Updated by: Person ID ${update.creator}\n`;
        }
        
        if (Object.keys(update.changes).length > 0) {
          output += '  📝 Changes:\n';
          for (const [field, value] of Object.entries(update.changes)) {
            const changeText = typeof value === 'object' ? JSON.stringify(value) : String(value);
            output += `    • ${field}: ${changeText}\n`;
          }
        }
        
        output += '\n';
      }
    }
    
    return {
      content: [
        {
          type: 'text',
          text: output,
        },
      ],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid parameters: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      );
    }
    
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to get recent updates: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export const getRecentUpdatesTool = {
  name: 'get_recent_updates',
  description: 'Get a summary of recent updates and changes in the last N days, with detailed breakdown by item type',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        description: 'Optional project ID to filter updates for a specific project',
      },
      days_back: {
        type: 'number',
        description: 'Number of days to look back for recent updates (1-30, default: 7)',
        minimum: 1,
        maximum: 30,
        default: 7,
      },
      limit: {
        type: 'number',
        description: 'Maximum number of updates to analyze (1-200, default: 100)',
        minimum: 1,
        maximum: 200,
      },
    },
    additionalProperties: false,
  },
};