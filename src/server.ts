import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ListPromptsRequestSchema, GetPromptRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { getConfig } from './config/index.js';
import { ProductiveAPIClient } from './api/client.js';
import { listProjectsTool, listProjectsDefinition } from './tools/projects.js';
import { listTasksTool, getProjectTasksTool, getTaskTool, createTaskTool, updateTaskAssignmentTool, listTasksDefinition, getProjectTasksDefinition, getTaskDefinition, createTaskDefinition, updateTaskAssignmentDefinition } from './tools/tasks.js';
import { listCompaniesTool, listCompaniesDefinition } from './tools/companies.js';
import { myTasksTool, myTasksDefinition } from './tools/my-tasks.js';
import { listBoards, createBoard, listBoardsTool, createBoardTool } from './tools/boards.js';
import { listTaskLists, createTaskList, listTaskListsTool, createTaskListTool } from './tools/task-lists.js';
import { listPeople, getProjectPeople, listPeopleTool, getProjectPeopleTool } from './tools/people.js';
import { whoAmI, whoAmITool } from './tools/whoami.js';
import { listActivities, listActivitiesTool } from './tools/activities.js';
import { getRecentUpdates, getRecentUpdatesTool } from './tools/recent-updates.js';
import { addTaskCommentTool, addTaskCommentDefinition } from './tools/comments.js';
import { updateTaskStatusTool, updateTaskStatusDefinition } from './tools/task-status.js';
import { listWorkflowStatusesTool, listWorkflowStatusesDefinition } from './tools/workflow-statuses.js';
import { listTimeEntresTool, createTimeEntryTool, listServicesTool, getProjectServicesTool, listProjectDealsTool, listDealServicesTool, listTimeEntriesDefinition, createTimeEntryDefinition, listServicesDefinition, getProjectServicesDefinition, listProjectDealsDefinition, listDealServicesDefinition } from './tools/time-entries.js';
import { updateTaskSprint, updateTaskSprintTool } from './tools/task-sprint.js';
import { moveTaskToList, moveTaskToListTool } from './tools/task-list-move.js';
import { addToBacklog, addToBacklogTool } from './tools/task-backlog.js';
import { generateTimesheetPrompt, timesheetPromptDefinition, generateQuickTimesheetPrompt, quickTimesheetPromptDefinition } from './prompts/timesheet.js';

export async function createServer() {
  // Initialize API client and config early to check user context
  const config = getConfig();
  const hasConfiguredUser = !!config.PRODUCTIVE_USER_ID;
  
  const server = new Server(
    {
      name: 'productive-mcp',
      version: '1.0.0',
      description: `MCP server for Productive.io API integration. Productive has a hierarchical structure: Customers → Projects → Boards → Task Lists → Tasks.${hasConfiguredUser ? ` IMPORTANT: When users say "me" or "assign to me", use "me" as the assignee_id value - it automatically resolves to the configured user ID ${config.PRODUCTIVE_USER_ID}.` : ' No user configured - set PRODUCTIVE_USER_ID to enable "me" context.'} Use the 'whoami' tool to check current user context.`,
    },
    {
      capabilities: {
        tools: {},
        prompts: {},
      },
    }
  );
  const apiClient = new ProductiveAPIClient(config);
  
  // Register handlers
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      whoAmITool,
      listCompaniesDefinition,
      listProjectsDefinition,
      listBoardsTool,
      createBoardTool,
      listTaskListsTool,
      createTaskListTool,
      listTasksDefinition,
      getProjectTasksDefinition,
      getTaskDefinition,
      createTaskDefinition,
      updateTaskAssignmentDefinition,
      addTaskCommentDefinition,
      updateTaskStatusDefinition,
      listWorkflowStatusesDefinition,
      myTasksDefinition,
      listPeopleTool,
      getProjectPeopleTool,
      listActivitiesTool,
      getRecentUpdatesTool,
      listTimeEntriesDefinition,
      createTimeEntryDefinition,
      listProjectDealsDefinition,
      listDealServicesDefinition,
      listServicesDefinition,
      getProjectServicesDefinition,
      updateTaskSprintTool,
      moveTaskToListTool,
      addToBacklogTool,
    ],
  }));
  
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    switch (name) {
      case 'whoami':
        return await whoAmI(apiClient, args, config);
        
      case 'list_companies':
        return await listCompaniesTool(apiClient, args);
        
      case 'list_projects':
        return await listProjectsTool(apiClient, args);
        
      case 'list_tasks':
        return await listTasksTool(apiClient, args);
        
      case 'get_project_tasks':
        return await getProjectTasksTool(apiClient, args);
        
      case 'get_task':
        return await getTaskTool(apiClient, args);
        
      case 'my_tasks':
        return await myTasksTool(apiClient, config, args);
        
      case 'list_boards':
        return await listBoards(apiClient, args);
        
      case 'create_board':
        return await createBoard(apiClient, args);
        
      case 'create_task':
        return await createTaskTool(apiClient, args, config);
        
      case 'update_task_assignment':
        return await updateTaskAssignmentTool(apiClient, args, config);
        
      case 'add_task_comment':
        return await addTaskCommentTool(apiClient, args);
        
      case 'update_task_status':
        return await updateTaskStatusTool(apiClient, args);
        
      case 'list_workflow_statuses':
        return await listWorkflowStatusesTool(apiClient, args);
        
      case 'list_task_lists':
        return await listTaskLists(apiClient, args);
        
      case 'create_task_list':
        return await createTaskList(apiClient, args);
        
      case 'list_people':
        return await listPeople(apiClient, args);
        
      case 'get_project_people':
        return await getProjectPeople(apiClient, args);
        
      case 'list_activities':
        return await listActivities(apiClient, args);
        
      case 'get_recent_updates':
        return await getRecentUpdates(apiClient, args);
        
      case 'list_time_entries':
        return await listTimeEntresTool(apiClient, args, config);
        
      case 'create_time_entry':
        return await createTimeEntryTool(apiClient, args, config);
        
      case 'list_project_deals':
        return await listProjectDealsTool(apiClient, args);
        
      case 'list_deal_services':
        return await listDealServicesTool(apiClient, args);
        
      case 'list_services':
        return await listServicesTool(apiClient, args);
        
      case 'get_project_services':
        return await getProjectServicesTool(apiClient, args);
        
      case 'update_task_sprint':
        return await updateTaskSprint(apiClient, args);
        
      case 'move_task_to_list':
        return await moveTaskToList(apiClient, args);
        
      case 'add_to_backlog':
        return await addToBacklog(apiClient, args);
        
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });

  // Register prompt handlers
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: [
      timesheetPromptDefinition,
      quickTimesheetPromptDefinition,
    ],
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    switch (name) {
      case 'timesheet_entry':
        return await generateTimesheetPrompt(args);
        
      case 'timesheet_step':
        return await generateQuickTimesheetPrompt(args);
        
      default:
        throw new Error(`Unknown prompt: ${name}`);
    }
  });
  
  // Connect to stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  // Don't output anything to stdout/stderr after connecting
  // as it can interfere with the MCP protocol
  
  return server;
}