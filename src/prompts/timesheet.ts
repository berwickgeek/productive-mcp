import { z } from 'zod';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

// Zod schema for timesheet prompt arguments
const timesheetPromptSchema = z.object({
  project_name: z.string().optional().describe('Optional project name or ID to start with'),
  date: z.string().optional().describe('Date for time entry (today, yesterday, or YYYY-MM-DD)'),
  time: z.string().optional().describe('Time duration (e.g., "2h", "120m", "1.5h")'),
  work_description: z.string().optional().describe('Brief description of work performed'),
});

/**
 * Generate a guided timesheet entry prompt that walks users through the complete workflow
 */
export async function generateTimesheetPrompt(args: unknown): Promise<{
  description: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: {
      type: 'text';
      text: string;
    };
  }>;
}> {
  try {
    const params = timesheetPromptSchema.parse(args);
    
    const projectHint = params.project_name ? `for project "${params.project_name}"` : '';
    const dateHint = params.date ? ` on ${params.date}` : '';
    const timeHint = params.time ? ` (${params.time})` : '';
    
    const workflowGuidance = `I'll help you create a timesheet entry${projectHint}${dateHint}${timeHint}. 

**TIMESHEET WORKFLOW OVERVIEW:**
This requires 5 steps to ensure your time is logged to the correct budget and service:

1. **🏢 Project Selection** - Find the right project
2. **💰 Budget/Deal Selection** - Choose the correct budget or deal within the project  
3. **⚙️ Service Selection** - Pick the specific service type for this work
4. **📋 Task Selection** - Link to a specific task (recommended)
5. **📝 Time Entry Creation** - Log time with detailed work notes

**WHY THIS WORKFLOW?**
Productive.io follows a strict hierarchy: Project → Budget/Deal → Service → Task → Time Entry
Each time entry must be linked to a specific service within a budget to ensure proper billing and tracking.

Let's start the workflow:`;

    let messages: Array<{ role: 'user' | 'assistant'; content: { type: 'text'; text: string } }> = [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Please help me create a timesheet entry${projectHint}${dateHint}${timeHint}${params.work_description ? ` for: ${params.work_description}` : ''}`
        }
      },
      {
        role: 'assistant',
        content: {
          type: 'text',
          text: workflowGuidance
        }
      }
    ];

    // Add project-specific guidance if project name provided
    if (params.project_name) {
      messages.push({
        role: 'assistant',
        content: {
          type: 'text',
          text: `**STEP 1: 🏢 Project Selection**
Since you mentioned "${params.project_name}", let me search for matching projects:

\`\`\`
I'll use: list_projects to find projects matching "${params.project_name}"
\`\`\`

Once we find your project, we'll move to budget selection.`
        }
      });
    } else {
      messages.push({
        role: 'assistant',
        content: {
          type: 'text',
          text: `**STEP 1: 🏢 Project Selection**
First, let's find the project you worked on:

\`\`\`
I'll use: list_projects to show available projects
\`\`\`

Please tell me which project you worked on, or I can list all active projects for you to choose from.`
        }
      });
    }

    messages.push({
      role: 'assistant',
      content: {
        type: 'text',
        text: `**NEXT STEPS PREVIEW:**

**Step 2:** Once we have your project_id, I'll run:
\`list_project_deals project_id="[PROJECT_ID]"\` to show budgets/deals for that project

**Step 3:** After you select a budget, I'll run:
\`list_deal_services deal_id="[DEAL_ID]"\` to show available services

**Step 4:** With the project_id, I'll run:
\`get_project_tasks project_id="[PROJECT_ID]"\` to show tasks you can link to (recommended)

**Step 5:** Finally, I'll create the time entry:
\`create_time_entry\` with all the selected details plus your detailed work description

**READY TO START?** 
Tell me the project name or say "list projects" to see all available projects.`
      }
    });

    return {
      description: `Guided timesheet entry workflow${projectHint}${dateHint}${timeHint}`,
      messages
    };

  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid prompt arguments: ${error.errors.map(e => e.message).join(', ')}`
      );
    }
    
    throw new McpError(
      ErrorCode.InternalError,
      error instanceof Error ? error.message : 'Unknown error occurred'
    );
  }
}

// Schema for quick timesheet prompt
const quickTimesheetSchema = z.object({
  step: z.enum(['project', 'budget', 'service', 'task', 'create']).describe('Current step in workflow'),
  project_id: z.string().optional().describe('Selected project ID'),
  deal_id: z.string().optional().describe('Selected deal/budget ID'),  
  service_id: z.string().optional().describe('Selected service ID'),
  task_id: z.string().optional().describe('Selected task ID'),
});

/**
 * Generate step-by-step guidance for timesheet workflow
 */
export async function generateQuickTimesheetPrompt(args: unknown): Promise<{
  description: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: {
      type: 'text';
      text: string;
    };
  }>;
}> {
  try {
    const params = quickTimesheetSchema.parse(args);
    
    let stepGuidance = '';
    let nextAction = '';
    
    switch (params.step) {
      case 'project':
        stepGuidance = '**STEP 1: 🏢 PROJECT SELECTION**\nI need to find the project you worked on.';
        nextAction = 'Use: `list_projects` to see available projects, then tell me the project name or ID.';
        break;
        
      case 'budget':
        stepGuidance = '**STEP 2: 💰 BUDGET/DEAL SELECTION**\nNow I need to find the correct budget or deal for this project.';
        nextAction = `Use: \`list_project_deals project_id="${params.project_id}"\` to see available budgets/deals.`;
        break;
        
      case 'service':
        stepGuidance = '**STEP 3: ⚙️ SERVICE SELECTION**\nTime to pick the specific service type for your work.';
        nextAction = `Use: \`list_deal_services deal_id="${params.deal_id}"\` to see services for this budget.`;
        break;
        
      case 'task':
        stepGuidance = '**STEP 4: 📋 TASK SELECTION (Recommended)**\nLet\'s link your time to a specific task.';
        nextAction = `Use: \`get_project_tasks project_id="${params.project_id}"\` to see available tasks.`;
        break;
        
      case 'create':
        stepGuidance = '**STEP 5: 📝 CREATE TIME ENTRY**\nReady to log your time with detailed work notes.';
        nextAction = `Use: \`create_time_entry\` with service_id="${params.service_id}"${params.task_id ? `, task_id="${params.task_id}"` : ''}, detailed notes, date, and time.`;
        break;
    }

    return {
      description: `Timesheet workflow step: ${params.step}`,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Help me with timesheet entry step: ${params.step}`
          }
        },
        {
          role: 'assistant',
          content: {
            type: 'text',
            text: `${stepGuidance}

**NEXT ACTION:**
${nextAction}

**PROGRESS:** ${getProgressIndicator(params.step)}

**REMEMBER:** Each timesheet entry requires:
- ✅ Valid service_id from the project → budget → service hierarchy
- ✅ Detailed work description (minimum 10 characters)
- ✅ Specific date and time duration
- 📝 Optional but recommended: task_id for better tracking`
          }
        }
      ]
    };

  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid prompt arguments: ${error.errors.map(e => e.message).join(', ')}`
      );
    }
    
    throw new McpError(
      ErrorCode.InternalError,
      error instanceof Error ? error.message : 'Unknown error occurred'
    );
  }
}

function getProgressIndicator(currentStep: string): string {
  const steps = ['project', 'budget', 'service', 'task', 'create'];
  const currentIndex = steps.indexOf(currentStep);
  
  return steps.map((_, index) => {
    if (index < currentIndex) return '✅';
    if (index === currentIndex) return '🔄';
    return '⏳';
  }).join(' ') + ` (Step ${currentIndex + 1}/5)`;
}

export const timesheetPromptDefinition = {
  name: 'timesheet_entry',
  description: 'Guided workflow for creating timesheet entries in Productive.io. Walks you through project → budget → service → task → time entry selection with proper validation.',
  arguments: [
    {
      name: 'project_name',
      description: 'Optional: Project name or ID to start with',
      required: false,
    },
    {
      name: 'date',
      description: 'Optional: Date for time entry (today, yesterday, or YYYY-MM-DD format)',
      required: false,
    },
    {
      name: 'time',
      description: 'Optional: Time duration (e.g., "2h", "120m", "1.5h")',
      required: false,
    },
    {
      name: 'work_description',
      description: 'Optional: Brief description of work performed',
      required: false,
    },
  ],
};

export const quickTimesheetPromptDefinition = {
  name: 'timesheet_step',
  description: 'Step-by-step guidance for timesheet workflow. Use this to get specific help for each step: project, budget, service, task, or create.',
  arguments: [
    {
      name: 'step',
      description: 'Current workflow step: project, budget, service, task, or create',
      required: true,
    },
    {
      name: 'project_id',
      description: 'Project ID if already selected',
      required: false,
    },
    {
      name: 'deal_id',
      description: 'Deal/Budget ID if already selected',
      required: false,
    },
    {
      name: 'service_id',
      description: 'Service ID if already selected',
      required: false,
    },
    {
      name: 'task_id',
      description: 'Task ID if already selected',
      required: false,
    },
  ],
};