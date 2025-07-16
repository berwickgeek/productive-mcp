import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ProductiveTimeEntryCreate } from '../api/types.js';

// Helper function to parse time input into minutes
function parseTimeToMinutes(timeInput: string): number {
  const input = timeInput.toLowerCase().trim();
  
  // Handle hour formats: "2h", "2.5h", "2 hours"
  const hourMatch = input.match(/^(\d*\.?\d+)\s*h(?:ours?)?$/);
  if (hourMatch) {
    return Math.round(parseFloat(hourMatch[1]) * 60);
  }
  
  // Handle minute formats: "120m", "120 minutes"
  const minuteMatch = input.match(/^(\d+)\s*m(?:inutes?)?$/);
  if (minuteMatch) {
    return parseInt(minuteMatch[1], 10);
  }
  
  // Handle decimal hour formats: "2.5", "1.25"
  const decimalMatch = input.match(/^(\d*\.?\d+)$/);
  if (decimalMatch) {
    return Math.round(parseFloat(decimalMatch[1]) * 60);
  }
  
  throw new Error(`Invalid time format: ${timeInput}. Use formats like "2h", "120m", or "2.5"`);
}

// Helper function to parse date input
function parseDate(dateInput: string): string {
  const input = dateInput.toLowerCase().trim();
  const today = new Date();
  
  if (input === 'today') {
    return today.toISOString().split('T')[0];
  }
  
  if (input === 'yesterday') {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  }
  
  // Validate YYYY-MM-DD format
  const dateMatch = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateMatch) {
    const year = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10);
    const day = parseInt(dateMatch[3], 10);
    
    // Basic validation
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      throw new Error(`Invalid date: ${dateInput}`);
    }
    
    return input;
  }
  
  throw new Error(`Invalid date format: ${dateInput}. Use "today", "yesterday", or YYYY-MM-DD format`);
}

const listTimeEntriesSchema = z.object({
  date: z.string().optional(),
  after: z.string().optional(),
  before: z.string().optional(),
  person_id: z.string().optional(),
  project_id: z.string().optional(),
  task_id: z.string().optional(),
  service_id: z.string().optional(),
  limit: z.number().min(1).max(200).default(30).optional(),
});

const createTimeEntrySchema = z.object({
  date: z.string().min(1, 'Date is required'),
  time: z.string().min(1, 'Time is required'),
  person_id: z.string().min(1, 'Person ID is required'),
  service_id: z.string().min(1, 'Service ID is required'),
  task_id: z.string().optional().describe('Optional task ID - use list_project_tasks to find available tasks for the project'),
  note: z.string().min(10, 'Work description must be at least 10 characters').describe('REQUIRED: Detailed description of work performed - be specific about what was accomplished, including bullet points if multiple items'),
  billable_time: z.string().optional(),
  confirm: z.boolean().optional().default(false),
});

const listServicesSchema = z.object({
  company_id: z.string().optional(),
  limit: z.number().min(1).max(200).default(30).optional(),
});

const getProjectServicesSchema = z.object({
  project_id: z.string().min(1, 'Project ID is required'),
  limit: z.number().min(1).max(200).default(30).optional(),
});

export async function listTimeEntresTool(
  client: ProductiveAPIClient,
  args: unknown,
  config?: { PRODUCTIVE_USER_ID?: string }
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = listTimeEntriesSchema.parse(args);
    
    // Handle "me" reference for person_id
    let personId = params.person_id;
    if (personId === 'me') {
      if (!config?.PRODUCTIVE_USER_ID) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Cannot use "me" reference - PRODUCTIVE_USER_ID is not configured in environment'
        );
      }
      personId = config.PRODUCTIVE_USER_ID;
    }
    
    const response = await client.listTimeEntries({
      date: params.date,
      after: params.after,
      before: params.before,
      person_id: personId,
      project_id: params.project_id,
      task_id: params.task_id,
      service_id: params.service_id,
      limit: params.limit,
    });
    
    if (!response.data || response.data.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'No time entries found matching the criteria.',
        }],
      };
    }
    
    const entriesText = response.data.map(entry => {
      const personId = entry.relationships?.person?.data?.id;
      const serviceId = entry.relationships?.service?.data?.id;
      const taskId = entry.relationships?.task?.data?.id;
      const projectId = entry.relationships?.project?.data?.id;
      
      const hours = Math.floor(entry.attributes.time / 60);
      const minutes = entry.attributes.time % 60;
      const timeDisplay = hours > 0 
        ? (minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`)
        : `${minutes}m`;
      
      let billableDisplay = '';
      if (entry.attributes.billable_time !== undefined && entry.attributes.billable_time !== entry.attributes.time) {
        const billableHours = Math.floor(entry.attributes.billable_time / 60);
        const billableMinutes = entry.attributes.billable_time % 60;
        const billableTimeDisplay = billableHours > 0 
          ? (billableMinutes > 0 ? `${billableHours}h ${billableMinutes}m` : `${billableHours}h`)
          : `${billableMinutes}m`;
        billableDisplay = ` (Billable: ${billableTimeDisplay})`;
      }
      
      return `• Time Entry (ID: ${entry.id})
  Date: ${entry.attributes.date}
  Time: ${timeDisplay}${billableDisplay}
  Note: ${entry.attributes.note || 'No note'}
  Person ID: ${personId || 'Unknown'}
  Service ID: ${serviceId || 'Unknown'}
  Task ID: ${taskId || 'None'}
  Project ID: ${projectId || 'None'}`;
    }).join('\n\n');
    
    const totalMinutes = response.data.reduce((sum, entry) => sum + entry.attributes.time, 0);
    const totalHours = Math.floor(totalMinutes / 60);
    const totalMins = totalMinutes % 60;
    const totalDisplay = totalHours > 0 
      ? (totalMins > 0 ? `${totalHours}h ${totalMins}m` : `${totalHours}h`)
      : `${totalMins}m`;
    
    const summary = `Found ${response.data.length} time entr${response.data.length !== 1 ? 'ies' : 'y'}${response.meta?.total_count ? ` (showing ${response.data.length} of ${response.meta.total_count})` : ''}:\n\nTotal Time: ${totalDisplay}\n\n${entriesText}`;
    
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

export async function createTimeEntryTool(
  client: ProductiveAPIClient,
  args: unknown,
  config?: { PRODUCTIVE_USER_ID?: string }
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = createTimeEntrySchema.parse(args);
    
    // Handle "me" reference for person_id
    let personId = params.person_id;
    if (personId === 'me') {
      if (!config?.PRODUCTIVE_USER_ID) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Cannot use "me" reference - PRODUCTIVE_USER_ID is not configured in environment'
        );
      }
      personId = config.PRODUCTIVE_USER_ID;
    }
    
    // Parse and validate date
    let parsedDate: string;
    try {
      parsedDate = parseDate(params.date);
    } catch (error) {
      throw new McpError(
        ErrorCode.InvalidParams,
        error instanceof Error ? error.message : 'Invalid date format'
      );
    }
    
    // Parse and validate time
    let timeInMinutes: number;
    try {
      timeInMinutes = parseTimeToMinutes(params.time);
    } catch (error) {
      throw new McpError(
        ErrorCode.InvalidParams,
        error instanceof Error ? error.message : 'Invalid time format'
      );
    }
    
    // Parse billable time if provided
    let billableTimeInMinutes: number | undefined;
    if (params.billable_time) {
      try {
        billableTimeInMinutes = parseTimeToMinutes(params.billable_time);
      } catch (error) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid billable time format: ${error instanceof Error ? error.message : 'Invalid time format'}`
        );
      }
    }
    
    // If not confirmed, show confirmation details
    if (!params.confirm) {
      const hours = Math.floor(timeInMinutes / 60);
      const minutes = timeInMinutes % 60;
      const timeDisplay = hours > 0 
        ? (minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`)
        : `${minutes}m`;
      
      let billableDisplay = '';
      if (billableTimeInMinutes !== undefined) {
        const billableHours = Math.floor(billableTimeInMinutes / 60);
        const billableMins = billableTimeInMinutes % 60;
        const billableTimeDisplay = billableHours > 0 
          ? (billableMins > 0 ? `${billableHours}h ${billableMins}m` : `${billableHours}h`)
          : `${billableMins}m`;
        billableDisplay = `\nBillable Time: ${billableTimeDisplay}`;
      }
      
      return {
        content: [{
          type: 'text',
          text: `Time Entry Ready to Create:

Date: ${parsedDate}
Time: ${timeDisplay}${billableDisplay}
Person ID: ${personId}${params.person_id === 'me' ? ' (me)' : ''}
Service ID: ${params.service_id}
${params.task_id ? `Task ID: ${params.task_id}` : 'No task specified'}
${params.note ? `Note: ${params.note}` : 'No note'}

To create this time entry, call this tool again with the same parameters and add "confirm": true`,
        }],
      };
    }
    
    const timeEntryData: ProductiveTimeEntryCreate = {
      data: {
        type: 'time_entries',
        attributes: {
          date: parsedDate,
          time: timeInMinutes,
          ...(billableTimeInMinutes !== undefined && { billable_time: billableTimeInMinutes }),
          ...(params.note && { note: params.note }),
        },
        relationships: {
          person: {
            data: {
              id: personId,
              type: 'people',
            },
          },
          service: {
            data: {
              id: params.service_id,
              type: 'services',
            },
          },
        },
      },
    };
    
    // Add task relationship if provided
    if (params.task_id) {
      timeEntryData.data.relationships.task = {
        data: {
          id: params.task_id,
          type: 'tasks',
        },
      };
    }
    
    const response = await client.createTimeEntry(timeEntryData);
    
    const hours = Math.floor(response.data.attributes.time / 60);
    const minutes = response.data.attributes.time % 60;
    const timeDisplay = hours > 0 
      ? (minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`)
      : `${minutes}m`;
    
    let billableDisplay = '';
    if (response.data.attributes.billable_time !== undefined && response.data.attributes.billable_time !== response.data.attributes.time) {
      const billableHours = Math.floor(response.data.attributes.billable_time / 60);
      const billableMins = response.data.attributes.billable_time % 60;
      const billableTimeDisplay = billableHours > 0 
        ? (billableMins > 0 ? `${billableHours}h ${billableMins}m` : `${billableHours}h`)
        : `${billableMins}m`;
      billableDisplay = `\nBillable Time: ${billableTimeDisplay}`;
    }
    
    let text = `Time entry created successfully!
Date: ${response.data.attributes.date}
Time: ${timeDisplay}${billableDisplay}
ID: ${response.data.id}`;
    
    if (response.data.attributes.note) {
      text += `\nNote: ${response.data.attributes.note}`;
    }
    
    text += `\nPerson ID: ${personId}`;
    if (params.person_id === 'me' && config?.PRODUCTIVE_USER_ID) {
      text += ` (me)`;
    }
    
    text += `\nService ID: ${params.service_id}`;
    
    if (params.task_id) {
      text += `\nTask ID: ${params.task_id}`;
    }
    
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

export async function listServicesTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = listServicesSchema.parse(args);
    
    const response = await client.listServices({
      company_id: params.company_id,
      limit: params.limit,
    });
    
    if (!response.data || response.data.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'No services found matching the criteria.',
        }],
      };
    }
    
    const servicesText = response.data.map(service => {
      const companyId = service.relationships?.company?.data?.id;
      return `• ${service.attributes.name} (ID: ${service.id})
  ${companyId ? `Company ID: ${companyId}` : ''}
  ${service.attributes.description ? `Description: ${service.attributes.description}` : 'No description'}`;
    }).join('\n\n');
    
    const summary = `Found ${response.data.length} service${response.data.length !== 1 ? 's' : ''}${response.meta?.total_count ? ` (showing ${response.data.length} of ${response.meta.total_count})` : ''}:\n\n${servicesText}`;
    
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

export async function getProjectServicesTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = getProjectServicesSchema.parse(args);
    
    // First get the project to verify it exists and get company info
    const projectResponse = await client.listProjects({
      limit: 1,
    });
    
    // Then get services for the project's company
    // Note: This is a simplified approach - in practice you might need
    // to get the project details first to find its company
    const response = await client.listServices({
      limit: params.limit,
    });
    
    if (!response.data || response.data.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `No active services found for project ${params.project_id}.`,
        }],
      };
    }
    
    const servicesText = response.data.map(service => {
      const companyId = service.relationships?.company?.data?.id;
      
      return `• ${service.attributes.name} (ID: ${service.id})
  ${companyId ? `Company ID: ${companyId}` : ''}
  ${service.attributes.description ? `Description: ${service.attributes.description}` : 'No description'}`;
    }).join('\n\n');
    
    const summary = `Services available for project ${params.project_id} (${response.data.length} service${response.data.length !== 1 ? 's' : ''}):\n\n${servicesText}`;
    
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

export const listTimeEntriesDefinition = {
  name: 'list_time_entries',
  description: 'View existing time entries from Productive.io with detailed information including service and budget relationships. Use this to see what time has been logged and to which projects/services. If PRODUCTIVE_USER_ID is configured, you can use "me" to refer to the configured user for person_id.',
  inputSchema: {
    type: 'object',
    properties: {
      date: {
        type: 'string',
        description: 'Filter by specific date (YYYY-MM-DD format)',
      },
      after: {
        type: 'string',
        description: 'Filter entries after this date (YYYY-MM-DD format)',
      },
      before: {
        type: 'string',
        description: 'Filter entries before this date (YYYY-MM-DD format)',
      },
      person_id: {
        type: 'string',
        description: 'Filter by person ID. If PRODUCTIVE_USER_ID is configured in environment, "me" refers to that user.',
      },
      project_id: {
        type: 'string',
        description: 'Filter by project ID',
      },
      task_id: {
        type: 'string',
        description: 'Filter by task ID',
      },
      service_id: {
        type: 'string',
        description: 'Filter by service ID',
      },
      limit: {
        type: 'number',
        description: 'Number of time entries to return (1-200)',
        minimum: 1,
        maximum: 200,
        default: 30,
      },
    },
    required: [],
  },
};

export const createTimeEntryDefinition = {
  name: 'create_time_entry',
  description: 'STEP 5 (FINAL) of timesheet workflow: Create a time entry with detailed work description. COMPLETE WORKFLOW: 1) list_projects → 2) list_project_deals → 3) list_deal_services → 4) list_project_tasks (recommended) → 5) create_time_entry. You MUST provide: valid service_id from the hierarchy, detailed work notes (minimum 10 chars), and optionally link to a specific task_id. This tool requires confirmation before creating. If PRODUCTIVE_USER_ID is configured, use "me" for person_id.',
  inputSchema: {
    type: 'object',
    properties: {
      date: {
        type: 'string',
        description: 'Date for the time entry. Accepts "today", "yesterday", or YYYY-MM-DD format (required)',
      },
      time: {
        type: 'string',
        description: 'Time duration. Accepts formats like "2h", "120m", "2.5h", or "2.5" (assumed hours) (required)',
      },
      person_id: {
        type: 'string',
        description: 'ID of the person logging time. If PRODUCTIVE_USER_ID is configured in environment, "me" refers to that user. (required)',
      },
      service_id: {
        type: 'string',
        description: 'ID of the service being performed (required)',
      },
      task_id: {
        type: 'string',
        description: 'ID of the task being worked on (recommended - use list_project_tasks to find available tasks)',
      },
      note: {
        type: 'string',
        description: 'REQUIRED: Detailed description of work performed - be specific about what was accomplished, include bullet points if multiple items (minimum 10 characters)',
        minLength: 10,
      },
      billable_time: {
        type: 'string',
        description: 'Billable time duration, same format as time field. If not specified, defaults to the time value (optional)',
      },
      confirm: {
        type: 'boolean',
        description: 'Set to true to confirm and create the time entry. First call without this to see confirmation details.',
        default: false,
      },
    },
    required: ['date', 'time', 'person_id', 'service_id', 'note'],
  },
};

export const listServicesDefinition = {
  name: 'list_services',
  description: 'List all services in the organization. NOTE: For timesheet entries, use the proper workflow instead: list_projects → list_project_deals → list_deal_services → create_time_entry. This tool shows all services but does not indicate which project/budget they belong to.',
  inputSchema: {
    type: 'object',
    properties: {
      company_id: {
        type: 'string',
        description: 'Filter services by company ID',
      },
      limit: {
        type: 'number',
        description: 'Number of services to return (1-200)',
        minimum: 1,
        maximum: 200,
        default: 30,
      },
    },
    required: [],
  },
};

// Zod schema for list project deals/budgets
const listProjectDealsSchema = z.object({
  project_id: z.string().min(1, 'Project ID is required'),
  budget_type: z.number().int().min(1).max(2).optional().describe('Budget type: 1 = deal, 2 = budget'),
  limit: z.number().min(1).max(200).default(30).optional(),
});

// Tool function for list project deals/budgets
export async function listProjectDealsTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = listProjectDealsSchema.parse(args);
    
    const response = await client.listProjectDeals({
      project_id: params.project_id,
      budget_type: params.budget_type,
      limit: params.limit,
    });
    
    if (!response.data || response.data.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'No deals/budgets found for this project.',
        }],
      };
    }
    
    const dealsText = response.data.map(deal => {
      const budgetType = deal.attributes.budget_type === 1 ? 'Deal' : 
                        deal.attributes.budget_type === 2 ? 'Budget' : 'Unknown';
      const value = deal.attributes.value ? ` (Value: ${deal.attributes.value})` : '';
      
      return `• ${budgetType} (ID: ${deal.id})
  Name: ${deal.attributes.name}${value}`;
    }).join('\n\n');
    
    const typeFilter = params.budget_type === 1 ? ' deals' : 
                      params.budget_type === 2 ? ' budgets' : ' deals/budgets';
    
    const summary = `Found ${response.data.length}${typeFilter} for project ${params.project_id}:\n\n${dealsText}`;
    
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

// Zod schema for list deal services
const listDealServicesSchema = z.object({
  deal_id: z.string().min(1, 'Deal/Budget ID is required'),
  limit: z.number().min(1).max(200).default(30).optional(),
});

// Tool function for list deal services
export async function listDealServicesTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = listDealServicesSchema.parse(args);
    
    const response = await client.listDealServices({
      deal_id: params.deal_id,
      limit: params.limit,
    });
    
    if (!response.data || response.data.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'No services found for this deal/budget.',
        }],
      };
    }
    
    const servicesText = response.data.map(service => {
      return `• Service (ID: ${service.id})
  Name: ${service.attributes.name || 'Unnamed Service'}
  ${service.attributes.description ? `Description: ${service.attributes.description}` : 'No description'}`;
    }).join('\n\n');
    
    const summary = `Found ${response.data.length} service${response.data.length !== 1 ? 's' : ''} for deal/budget ${params.deal_id}:\n\n${servicesText}`;
    
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

export const listProjectDealsDefinition = {
  name: 'list_project_deals',
  description: 'STEP 2 of timesheet workflow: Get deals/budgets for a specific project. COMPLETE WORKFLOW: 1) list_projects → 2) list_project_deals → 3) list_deal_services → 4) list_project_tasks (recommended) → 5) create_time_entry. This follows: Project → Deal/Budget → Service → Task → Time Entry.',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        description: 'The ID of the project (required)',
      },
      budget_type: {
        type: 'number',
        description: 'Filter by budget type: 1 = deal, 2 = budget',
        minimum: 1,
        maximum: 2,
      },
      limit: {
        type: 'number',
        description: 'Number of deals/budgets to return (1-200)',
        minimum: 1,
        maximum: 200,
        default: 30,
      },
    },
    required: ['project_id'],
  },
};

export const listDealServicesDefinition = {
  name: 'list_deal_services',
  description: 'STEP 3 of timesheet workflow: Get services for a specific deal/budget. COMPLETE WORKFLOW: 1) list_projects → 2) list_project_deals → 3) list_deal_services → 4) list_project_tasks (recommended) → 5) create_time_entry. After this, optionally use list_project_tasks to find specific tasks to link your time entry to.',
  inputSchema: {
    type: 'object',
    properties: {
      deal_id: {
        type: 'string',
        description: 'The ID of the deal/budget (required)',
      },
      limit: {
        type: 'number',
        description: 'Number of services to return (1-200)',
        minimum: 1,
        maximum: 200,
        default: 30,
      },
    },
    required: ['deal_id'],
  },
};

export const getProjectServicesDefinition = {
  name: 'get_project_services',
  description: 'DEPRECATED: Use the proper workflow instead: list_projects → list_project_deals → list_deal_services → create_time_entry. This tool does not properly handle the project → deal/budget → service hierarchy required for timesheet entries.',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        description: 'The ID of the project',
      },
      limit: {
        type: 'number',
        description: 'Number of services to return (1-200)',
        minimum: 1,
        maximum: 200,
        default: 30,
      },
    },
    required: ['project_id'],
  },
};