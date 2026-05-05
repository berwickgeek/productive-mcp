import { Config } from '../config/index.js';
import {
  ProductiveCompany,
  ProductiveProject,
  ProductiveTask,
  ProductiveBoard,
  ProductiveTaskList,
  ProductivePerson,
  ProductiveActivity,
  ProductiveComment,
  ProductiveWorkflowStatus,
  ProductiveService,
  ProductiveTimeEntry,
  ProductiveDeal,
  ProductiveFolder,
  ProductiveTodo,
  ProductivePage,
  ProductiveResponse,
  ProductiveSingleResponse,
  ProductiveTaskCreate,
  ProductiveTaskUpdate,
  ProductiveBoardCreate,
  ProductiveTaskListCreate,
  ProductiveTaskListUpdate,
  ProductiveCommentCreate,
  ProductiveCommentUpdate,
  ProductiveTimeEntryCreate,
  ProductiveFolderCreate,
  ProductiveFolderUpdate,
  ProductiveTodoCreate,
  ProductiveTodoUpdate,
  ProductivePageCreate,
  ProductivePageUpdate,
  ProductiveTaskDependency,
  ProductiveTaskDependencyCreate,
  ProductiveError
} from './types.js';

export class ProductiveAPIClient {
  private config: Config;
  
  constructor(config: Config) {
    this.config = config;
  }
  
  private getHeaders(): HeadersInit {
    return {
      'X-Auth-Token': this.config.PRODUCTIVE_API_TOKEN,
      'X-Organization-Id': this.config.PRODUCTIVE_ORG_ID,
      'Content-Type': 'application/vnd.api+json',
    };
  }
  
  private async makeRequest<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.config.PRODUCTIVE_API_BASE_URL}${path}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...this.getHeaders(),
          ...options?.headers,
        },
      });

      if (!response.ok) {
        const errorData = await response.json() as ProductiveError;
        console.error('API Error Response:', JSON.stringify(errorData, null, 2));
        console.error('Request was to:', url);
        const errorMessage = errorData.errors?.[0]?.detail || `API request failed with status ${response.status}`;
        throw new Error(errorMessage);
      }

      return await response.json() as T;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Unknown error occurred while making API request');
    }
  }

  private async makeVoidRequest(path: string, options?: RequestInit): Promise<void> {
    const url = `${this.config.PRODUCTIVE_API_BASE_URL}${path}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.getHeaders(),
        ...options?.headers,
      },
    });

    if (!response.ok) {
      let errorMessage = `API request failed with status ${response.status}`;
      try {
        const errorData = await response.json() as ProductiveError;
        errorMessage = errorData.errors?.[0]?.detail || errorMessage;
      } catch { /* no JSON body */ }
      throw new Error(errorMessage);
    }
  }
  
  async listCompanies(params?: {
    status?: 'active' | 'archived';
    limit?: number;
    page?: number;
  }): Promise<ProductiveResponse<ProductiveCompany>> {
    const queryParams = new URLSearchParams();
    
    if (params?.status) {
      queryParams.append('filter[status]', params.status);
    }
    
    if (params?.limit) {
      queryParams.append('page[size]', params.limit.toString());
    }
    
    if (params?.page) {
      queryParams.append('page[number]', params.page.toString());
    }
    
    const queryString = queryParams.toString();
    const path = `companies${queryString ? `?${queryString}` : ''}`;
    
    return this.makeRequest<ProductiveResponse<ProductiveCompany>>(path);
  }
  
  async listProjects(params?: {
    status?: 'active' | 'archived';
    company_id?: string;
    limit?: number;
    page?: number;
  }): Promise<ProductiveResponse<ProductiveProject>> {
    const queryParams = new URLSearchParams();
    
    if (params?.status) {
      // Convert status string to integer: active = 1, archived = 2
      const statusValue = params.status === 'active' ? '1' : '2';
      queryParams.append('filter[status]', statusValue);
    }
    
    if (params?.company_id) {
      queryParams.append('filter[company_id]', params.company_id);
    }
    
    if (params?.limit) {
      queryParams.append('page[size]', params.limit.toString());
    }
    
    if (params?.page) {
      queryParams.append('page[number]', params.page.toString());
    }
    
    const queryString = queryParams.toString();
    const path = `projects${queryString ? `?${queryString}` : ''}`;
    
    return this.makeRequest<ProductiveResponse<ProductiveProject>>(path);
  }
  
  async listTasks(params?: {
    project_id?: string;
    assignee_id?: string;
    status?: 'open' | 'closed';
    limit?: number;
    page?: number;
  }): Promise<ProductiveResponse<ProductiveTask>> {
    const queryParams = new URLSearchParams();

    // Include assignee and workflow status so we can resolve names
    queryParams.append('include', 'assignee,workflow_status');

    if (params?.project_id) {
      queryParams.append('filter[project_id]', params.project_id);
    }

    if (params?.assignee_id) {
      queryParams.append('filter[assignee_id]', params.assignee_id);
    }

    if (params?.status) {
      // Convert status names to integers: open = 1, closed = 2
      const statusValue = params.status === 'open' ? '1' : '2';
      queryParams.append('filter[status]', statusValue);
    }

    if (params?.limit) {
      queryParams.append('page[size]', params.limit.toString());
    }

    if (params?.page) {
      queryParams.append('page[number]', params.page.toString());
    }

    const queryString = queryParams.toString();
    const path = `tasks${queryString ? `?${queryString}` : ''}`;

    return this.makeRequest<ProductiveResponse<ProductiveTask>>(path);
  }
  
  async listBoards(params?: {
    project_id?: string;
    limit?: number;
    page?: number;
  }): Promise<ProductiveResponse<ProductiveBoard>> {
    const queryParams = new URLSearchParams();
    
    if (params?.project_id) {
      queryParams.append('filter[project_id]', params.project_id);
    }
    
    if (params?.limit) {
      queryParams.append('page[size]', params.limit.toString());
    }
    
    if (params?.page) {
      queryParams.append('page[number]', params.page.toString());
    }
    
    const queryString = queryParams.toString();
    const path = `boards${queryString ? `?${queryString}` : ''}`;
    
    return this.makeRequest<ProductiveResponse<ProductiveBoard>>(path);
  }
  
  async createBoard(boardData: ProductiveBoardCreate): Promise<ProductiveSingleResponse<ProductiveBoard>> {
    return this.makeRequest<ProductiveSingleResponse<ProductiveBoard>>('boards', {
      method: 'POST',
      body: JSON.stringify(boardData),
    });
  }
  
  async createTask(taskData: ProductiveTaskCreate): Promise<ProductiveSingleResponse<ProductiveTask>> {
    return this.makeRequest<ProductiveSingleResponse<ProductiveTask>>('tasks', {
      method: 'POST',
      body: JSON.stringify(taskData),
    });
  }
  
  async listTaskLists(params?: {
    board_id?: string;
    limit?: number;
    page?: number;
  }): Promise<ProductiveResponse<ProductiveTaskList>> {
    const queryParams = new URLSearchParams();
    
    if (params?.board_id) {
      queryParams.append('filter[board_id]', params.board_id);
    }
    
    if (params?.limit) {
      queryParams.append('page[size]', params.limit.toString());
    }
    
    if (params?.page) {
      queryParams.append('page[number]', params.page.toString());
    }
    
    const queryString = queryParams.toString();
    const path = `task_lists${queryString ? `?${queryString}` : ''}`;
    
    return this.makeRequest<ProductiveResponse<ProductiveTaskList>>(path);
  }
  
  async createTaskList(taskListData: ProductiveTaskListCreate): Promise<ProductiveSingleResponse<ProductiveTaskList>> {
    return this.makeRequest<ProductiveSingleResponse<ProductiveTaskList>>('task_lists', {
      method: 'POST',
      body: JSON.stringify(taskListData),
    });
  }
  
  async listPeople(params?: {
    company_id?: string;
    project_id?: string;
    is_active?: boolean;
    email?: string;
    limit?: number;
    page?: number;
  }): Promise<ProductiveResponse<ProductivePerson>> {
    const queryParams = new URLSearchParams();
    
    if (params?.company_id) {
      queryParams.append('filter[company_id]', params.company_id);
    }
    
    if (params?.project_id) {
      queryParams.append('filter[project_id]', params.project_id);
    }
    
    if (params?.is_active !== undefined) {
      queryParams.append('filter[is_active]', params.is_active.toString());
    }
    
    if (params?.email) {
      queryParams.append('filter[email]', params.email);
    }
    
    if (params?.limit) {
      queryParams.append('page[size]', params.limit.toString());
    }
    
    if (params?.page) {
      queryParams.append('page[number]', params.page.toString());
    }
    
    const queryString = queryParams.toString();
    const path = `people${queryString ? `?${queryString}` : ''}`;
    
    return this.makeRequest<ProductiveResponse<ProductivePerson>>(path);
  }
  
  async getTask(taskId: string): Promise<ProductiveSingleResponse<ProductiveTask>> {
    return this.makeRequest<ProductiveSingleResponse<ProductiveTask>>(`tasks/${taskId}`);
  }

  async updateTask(taskId: string, taskData: ProductiveTaskUpdate): Promise<ProductiveSingleResponse<ProductiveTask>> {
    return this.makeRequest<ProductiveSingleResponse<ProductiveTask>>(`tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(taskData),
    });
  }

  async listActivities(params?: {
    task_id?: string;
    project_id?: string;
    person_id?: string;
    item_type?: string;
    event?: string;
    after?: string; // ISO 8601 date string
    before?: string; // ISO 8601 date string
    limit?: number;
    page?: number;
  }): Promise<ProductiveResponse<ProductiveActivity>> {
    const queryParams = new URLSearchParams();
    
    if (params?.task_id) {
      queryParams.append('filter[task_id]', params.task_id);
    }
    
    if (params?.project_id) {
      queryParams.append('filter[project_id]', params.project_id);
    }
    
    if (params?.person_id) {
      queryParams.append('filter[person_id]', params.person_id);
    }
    
    if (params?.item_type) {
      queryParams.append('filter[item_type]', params.item_type);
    }
    
    if (params?.event) {
      queryParams.append('filter[event]', params.event);
    }
    
    if (params?.after) {
      queryParams.append('filter[after]', params.after);
    }
    
    if (params?.before) {
      queryParams.append('filter[before]', params.before);
    }
    
    if (params?.limit) {
      queryParams.append('page[size]', params.limit.toString());
    }
    
    if (params?.page) {
      queryParams.append('page[number]', params.page.toString());
    }
    
    const queryString = queryParams.toString();
    const path = `activities${queryString ? `?${queryString}` : ''}`;
    
    return this.makeRequest<ProductiveResponse<ProductiveActivity>>(path);
  }

  async createComment(commentData: ProductiveCommentCreate): Promise<ProductiveSingleResponse<ProductiveComment>> {
    return this.makeRequest<ProductiveSingleResponse<ProductiveComment>>('comments', {
      method: 'POST',
      body: JSON.stringify(commentData),
    });
  }

  async listWorkflowStatuses(params?: {
    workflow_id?: string;
    category_id?: number;
    limit?: number;
    page?: number;
  }): Promise<ProductiveResponse<ProductiveWorkflowStatus>> {
    const queryParams = new URLSearchParams();
    
    if (params?.workflow_id) {
      queryParams.append('filter[workflow_id]', params.workflow_id);
    }
    
    if (params?.category_id) {
      queryParams.append('filter[category_id]', params.category_id.toString());
    }
    
    if (params?.limit) {
      queryParams.append('page[size]', params.limit.toString());
    }
    
    if (params?.page) {
      queryParams.append('page[number]', params.page.toString());
    }
    
    const queryString = queryParams.toString();
    const path = `workflow_statuses${queryString ? `?${queryString}` : ''}`;
    
    return this.makeRequest<ProductiveResponse<ProductiveWorkflowStatus>>(path);
  }

  /**
   * List time entries with optional filters
   * 
   * @param params - Filter parameters for time entries
   * @param params.date - Filter by specific date (ISO format: YYYY-MM-DD)
   * @param params.after - Filter entries after this date (ISO format: YYYY-MM-DD)
   * @param params.before - Filter entries before this date (ISO format: YYYY-MM-DD)
   * @param params.person_id - Filter by person ID
   * @param params.project_id - Filter by project ID
   * @param params.task_id - Filter by task ID
   * @param params.service_id - Filter by service ID
   * @param params.limit - Number of results per page
   * @param params.page - Page number for pagination
   * @returns Promise resolving to paginated time entries response
   * 
   * @example
   * // Get time entries for a specific person and date range
   * const entries = await client.listTimeEntries({
   *   person_id: "123",
   *   after: "2023-01-01",
   *   before: "2023-01-31"
   * });
   */
  async listTimeEntries(params?: {
    date?: string;
    after?: string;
    before?: string;
    person_id?: string;
    project_id?: string;
    task_id?: string;
    service_id?: string;
    limit?: number;
    page?: number;
  }): Promise<ProductiveResponse<ProductiveTimeEntry>> {
    const queryParams = new URLSearchParams();
    
    // Include relationships by default
    queryParams.append('include', 'person,service,task');
    
    if (params?.date) {
      queryParams.append('filter[date]', params.date);
    }
    
    if (params?.after) {
      queryParams.append('filter[after]', params.after);
    }
    
    if (params?.before) {
      queryParams.append('filter[before]', params.before);
    }
    
    if (params?.person_id) {
      queryParams.append('filter[person_id]', params.person_id);
    }
    
    if (params?.project_id) {
      queryParams.append('filter[project_id]', params.project_id);
    }
    
    if (params?.task_id) {
      queryParams.append('filter[task_id]', params.task_id);
    }
    
    if (params?.service_id) {
      queryParams.append('filter[service_id]', params.service_id);
    }
    
    if (params?.limit) {
      queryParams.append('page[size]', params.limit.toString());
    }
    
    if (params?.page) {
      queryParams.append('page[number]', params.page.toString());
    }
    
    const queryString = queryParams.toString();
    const path = `time_entries${queryString ? `?${queryString}` : ''}`;
    
    return this.makeRequest<ProductiveResponse<ProductiveTimeEntry>>(path);
  }

  /**
   * Create a new time entry
   * 
   * @param timeEntryData - Time entry creation data
   * @returns Promise resolving to the created time entry
   * 
   * @example
   * // Create a time entry for a task
   * const timeEntry = await client.createTimeEntry({
   *   data: {
   *     type: 'time_entries',
   *     attributes: {
   *       date: '2023-01-15',
   *       time: 120, // 2 hours in minutes
   *       note: 'Working on feature implementation'
   *     },
   *     relationships: {
   *       person: { data: { id: '123', type: 'people' } },
   *       service: { data: { id: '456', type: 'services' } },
   *       task: { data: { id: '789', type: 'tasks' } }
   *     }
   *   }
   * });
   */
  async createTimeEntry(timeEntryData: ProductiveTimeEntryCreate): Promise<ProductiveSingleResponse<ProductiveTimeEntry>> {
    // Debug: Log the request body
    console.error('Creating time entry with data:', JSON.stringify(timeEntryData, null, 2));
    return this.makeRequest<ProductiveSingleResponse<ProductiveTimeEntry>>('time_entries', {
      method: 'POST',
      body: JSON.stringify(timeEntryData),
    });
  }

  /**
   * List deals/budgets for a specific project
   * 
   * @param params - Filter parameters for deals
   * @param params.project_id - Filter by project ID (required)
   * @param params.budget_type - Filter by budget type (1: deal, 2: budget)
   * @param params.limit - Number of results per page
   * @param params.page - Page number for pagination
   * @returns Promise resolving to paginated deals response
   * 
   * @example
   * // Get all deals/budgets for a project
   * const deals = await client.listProjectDeals({
   *   project_id: '123',
   *   budget_type: 2 // Only budgets
   * });
   */
  async listProjectDeals(params: {
    project_id: string;
    budget_type?: number; // 1: deal, 2: budget
    limit?: number;
    page?: number;
  }): Promise<ProductiveResponse<ProductiveDeal>> {
    const queryParams = new URLSearchParams();
    
    // Include project relationship
    queryParams.append('include', 'project');
    
    // Filter by project - deals endpoint expects array format
    queryParams.append('filter[project_id]', params.project_id);
    
    if (params.budget_type) {
      queryParams.append('filter[budget_type]', params.budget_type.toString());
    }
    
    if (params.limit) {
      queryParams.append('page[size]', params.limit.toString());
    }
    
    if (params.page) {
      queryParams.append('page[number]', params.page.toString());
    }
    
    const queryString = queryParams.toString();
    const path = `deals${queryString ? `?${queryString}` : ''}`;
    
    return this.makeRequest<ProductiveResponse<ProductiveDeal>>(path);
  }

  /**
   * List services available for a specific deal/budget
   * 
   * @param params - Filter parameters for services
   * @param params.deal_id - Filter by deal/budget ID
   * @param params.limit - Number of results per page
   * @param params.page - Page number for pagination
   * @returns Promise resolving to paginated services response
   * 
   * @example
   * // Get services for a specific deal/budget
   * const services = await client.listDealServices({
   *   deal_id: '456'
   * });
   */
  async listDealServices(params: {
    deal_id: string;
    limit?: number;
    page?: number;
  }): Promise<ProductiveResponse<ProductiveService>> {
    const queryParams = new URLSearchParams();
    
    // Filter by deal/budget
    queryParams.append('filter[deal_id]', params.deal_id);
    
    if (params.limit) {
      queryParams.append('page[size]', params.limit.toString());
    }
    
    if (params.page) {
      queryParams.append('page[number]', params.page.toString());
    }
    
    const queryString = queryParams.toString();
    const path = `services${queryString ? `?${queryString}` : ''}`;
    
    return this.makeRequest<ProductiveResponse<ProductiveService>>(path);
  }

  /**
   * List services available for time tracking
   * 
   * @param params - Filter parameters for services
   * @param params.company_id - Filter by company ID
   * @param params.limit - Number of results per page
   * @param params.page - Page number for pagination
   * @returns Promise resolving to paginated services response
   * 
   * @example
   * // Get all services
   * const services = await client.listServices({
   *   company_id: '123'
   * });
   */
  async listServices(params?: {
    company_id?: string;
    limit?: number;
    page?: number;
  }): Promise<ProductiveResponse<ProductiveService>> {
    const queryParams = new URLSearchParams();
    
    if (params?.company_id) {
      queryParams.append('filter[company_id]', params.company_id);
    }
    
    if (params?.limit) {
      queryParams.append('page[size]', params.limit.toString());
    }
    
    if (params?.page) {
      queryParams.append('page[number]', params.page.toString());
    }
    
    const queryString = queryParams.toString();
    const path = `services${queryString ? `?${queryString}` : ''}`;
    
    return this.makeRequest<ProductiveResponse<ProductiveService>>(path);
  }

  /**
   * Get a specific time entry by ID
   * 
   * @param timeEntryId - The ID of the time entry to retrieve
   * @returns Promise resolving to the time entry
   * 
   * @example
   * const timeEntry = await client.getTimeEntry('123');
   */
  async getTimeEntry(timeEntryId: string): Promise<ProductiveSingleResponse<ProductiveTimeEntry>> {
    return this.makeRequest<ProductiveSingleResponse<ProductiveTimeEntry>>(`time_entries/${timeEntryId}`);
  }

  /**
   * Helper method to get time entries for a specific date range
   * Convenience wrapper around listTimeEntries with date filtering
   * 
   * @param startDate - Start date in ISO format (YYYY-MM-DD)
   * @param endDate - End date in ISO format (YYYY-MM-DD)
   * @param additionalParams - Additional filter parameters
   * @returns Promise resolving to paginated time entries response
   * 
   * @example
   * // Get all time entries for last week
   * const entries = await client.getTimeEntriesInDateRange(
   *   '2023-01-01', 
   *   '2023-01-07',
   *   { person_id: '123' }
   * );
   */
  async getTimeEntriesInDateRange(
    startDate: string,
    endDate: string,
    additionalParams?: {
      person_id?: string;
      project_id?: string;
      task_id?: string;
      service_id?: string;
      limit?: number;
      page?: number;
    }
  ): Promise<ProductiveResponse<ProductiveTimeEntry>> {
    return this.listTimeEntries({
      after: startDate,
      before: endDate,
      ...additionalParams
    });
  }

  /**
   * Helper method to get time entries for today
   * Convenience wrapper for getting current day's time entries
   * 
   * @param additionalParams - Additional filter parameters
   * @returns Promise resolving to paginated time entries response
   * 
   * @example
   * // Get today's time entries for a specific person
   * const todayEntries = await client.getTodayTimeEntries({
   *   person_id: '123'
   * });
   */
  async getTodayTimeEntries(additionalParams?: {
    person_id?: string;
    project_id?: string;
    task_id?: string;
    service_id?: string;
    limit?: number;
    page?: number;
  }): Promise<ProductiveResponse<ProductiveTimeEntry>> {
    const today = new Date().toISOString().split('T')[0]; // Get YYYY-MM-DD format
    return this.listTimeEntries({
      date: today,
      ...additionalParams
    });
  }

  /**
   * Reposition a task in a task list
   * 
   * @param taskId - ID of the task to reposition
   * @param attributes - Positioning attributes (move_before_id and/or move_after_id)
   * @returns Promise resolving to the task response
   * 
   * @example
   * // Position task 1 after task 2
   * await client.repositionTask('1', { move_after_id: '2' });
   * 
   * // Position task 3 between tasks 1 and 2
   * await client.repositionTask('3', { move_after_id: '1', move_before_id: '2' });
   */
  async repositionTask(
    taskId: string, 
    attributes: { 
      move_before_id?: string; 
      move_after_id?: string;
      placement?: number;
    }
  ): Promise<any> {
    const requestBody = {
      data: {
        type: 'tasks',
        attributes: { ...attributes }
      }
    };

    // The reposition endpoint returns 204 No Content on success
    const url = `${this.config.PRODUCTIVE_API_BASE_URL}tasks/${taskId}/reposition`;
    
    try {
      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          'X-Auth-Token': this.config.PRODUCTIVE_API_TOKEN,
          'X-Organization-Id': this.config.PRODUCTIVE_ORG_ID,
          'Content-Type': 'application/vnd.api+json',
        },
        body: JSON.stringify(requestBody),
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Task ${taskId} not found or cannot be repositioned.`);
        }
        throw new Error(`Reposition failed with status ${response.status}: ${response.statusText}`);
      }
      
      // If 204 No Content (success), return a minimal success response
      if (response.status === 204) {
        return {
          success: true,
          taskId: taskId,
          message: `Task ${taskId} repositioned successfully`
        };
      }
      
      // For any other success response with content, try to parse JSON
      try {
        return await response.json();
      } catch (e) {
        // If parsing fails but status was success, return a minimal success object
        return {
          success: true,
          taskId: taskId,
          message: `Task ${taskId} repositioned successfully`
        };
      }
    } catch (error) {
      console.error('Error repositioning task:', error);
      throw error;
    }
  }

  // ---- Folder methods ----

  async listFolders(params?: {
    project_id?: string;
    status?: number;
    limit?: number;
    page?: number;
  }): Promise<ProductiveResponse<ProductiveFolder>> {
    const q = new URLSearchParams();
    if (params?.project_id) q.append('filter[project_id]', params.project_id);
    if (params?.status) q.append('filter[status]', params.status.toString());
    if (params?.limit) q.append('page[size]', params.limit.toString());
    if (params?.page) q.append('page[number]', params.page.toString());
    const qs = q.toString();
    return this.makeRequest<ProductiveResponse<ProductiveFolder>>(`folders${qs ? `?${qs}` : ''}`);
  }

  async getFolder(folderId: string): Promise<ProductiveSingleResponse<ProductiveFolder>> {
    return this.makeRequest<ProductiveSingleResponse<ProductiveFolder>>(`folders/${folderId}`);
  }

  async createFolder(data: ProductiveFolderCreate): Promise<ProductiveSingleResponse<ProductiveFolder>> {
    return this.makeRequest<ProductiveSingleResponse<ProductiveFolder>>('folders', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateFolder(folderId: string, data: ProductiveFolderUpdate): Promise<ProductiveSingleResponse<ProductiveFolder>> {
    return this.makeRequest<ProductiveSingleResponse<ProductiveFolder>>(`folders/${folderId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async archiveFolder(folderId: string): Promise<void> {
    return this.makeVoidRequest(`folders/${folderId}/archive`, {
      method: 'PATCH',
      body: JSON.stringify({ data: { type: 'folders' } }),
    });
  }

  async restoreFolder(folderId: string): Promise<void> {
    return this.makeVoidRequest(`folders/${folderId}/restore`, {
      method: 'PATCH',
      body: JSON.stringify({ data: { type: 'folders' } }),
    });
  }

  // ---- Task List extended methods ----

  async getTaskList(taskListId: string): Promise<ProductiveSingleResponse<ProductiveTaskList>> {
    return this.makeRequest<ProductiveSingleResponse<ProductiveTaskList>>(`task_lists/${taskListId}`);
  }

  async updateTaskList(taskListId: string, data: ProductiveTaskListUpdate): Promise<ProductiveSingleResponse<ProductiveTaskList>> {
    return this.makeRequest<ProductiveSingleResponse<ProductiveTaskList>>(`task_lists/${taskListId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async archiveTaskList(taskListId: string): Promise<void> {
    return this.makeVoidRequest(`task_lists/${taskListId}/archive`, { method: 'PATCH' });
  }

  async restoreTaskList(taskListId: string): Promise<void> {
    return this.makeVoidRequest(`task_lists/${taskListId}/restore`, { method: 'PATCH' });
  }

  async copyTaskList(params: {
    name: string;
    template_id: string;
    project_id: string;
    board_id: string;
    copy_open_tasks?: boolean;
    copy_assignees?: boolean;
  }): Promise<ProductiveSingleResponse<ProductiveTaskList>> {
    return this.makeRequest<ProductiveSingleResponse<ProductiveTaskList>>('task_lists/copy', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'task_lists',
          attributes: {
            name: params.name,
            template_id: params.template_id,
            project_id: params.project_id,
            board_id: params.board_id,
            copy_open_tasks: params.copy_open_tasks,
            copy_assignees: params.copy_assignees,
          },
        },
      }),
    });
  }

  async moveTaskList(taskListId: string, boardId: string): Promise<void> {
    return this.makeVoidRequest(`task_lists/${taskListId}/move`, {
      method: 'PATCH',
      body: JSON.stringify({
        data: { type: 'task_lists', attributes: { board_id: boardId } },
      }),
    });
  }

  async repositionTaskList(taskListId: string, moveBeforeId: string): Promise<void> {
    return this.makeVoidRequest(`task_lists/${taskListId}/reposition`, {
      method: 'PATCH',
      body: JSON.stringify({
        data: { type: 'task_lists', attributes: { move_before_id: moveBeforeId } },
      }),
    });
  }

  // ---- Task extended methods ----

  async deleteTask(taskId: string): Promise<void> {
    return this.makeVoidRequest(`tasks/${taskId}`, { method: 'DELETE' });
  }

  // ---- Comment extended methods ----

  async listComments(params?: {
    task_id?: string;
    project_id?: string;
    discussion_id?: string;
    page_id?: string;
    limit?: number;
    page?: number;
  }): Promise<ProductiveResponse<ProductiveComment>> {
    const q = new URLSearchParams();
    q.append('include', 'creator');
    if (params?.task_id) q.append('filter[task_id]', params.task_id);
    if (params?.project_id) q.append('filter[project_id]', params.project_id);
    if (params?.discussion_id) q.append('filter[discussion_id]', params.discussion_id);
    if (params?.page_id) q.append('filter[page_id]', params.page_id);
    if (params?.limit) q.append('page[size]', params.limit.toString());
    if (params?.page) q.append('page[number]', params.page.toString());
    const qs = q.toString();
    return this.makeRequest<ProductiveResponse<ProductiveComment>>(`comments${qs ? `?${qs}` : ''}`);
  }

  async getComment(commentId: string): Promise<ProductiveSingleResponse<ProductiveComment>> {
    return this.makeRequest<ProductiveSingleResponse<ProductiveComment>>(`comments/${commentId}?include=creator`);
  }

  async updateComment(commentId: string, data: ProductiveCommentUpdate): Promise<ProductiveSingleResponse<ProductiveComment>> {
    return this.makeRequest<ProductiveSingleResponse<ProductiveComment>>(`comments/${commentId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteComment(commentId: string): Promise<void> {
    return this.makeVoidRequest(`comments/${commentId}`, { method: 'DELETE' });
  }

  async pinComment(commentId: string): Promise<void> {
    return this.makeVoidRequest(`comments/${commentId}/pin`, { method: 'PATCH' });
  }

  async unpinComment(commentId: string): Promise<void> {
    return this.makeVoidRequest(`comments/${commentId}/unpin`, { method: 'PATCH' });
  }

  async addCommentReaction(commentId: string, reaction: string): Promise<void> {
    return this.makeVoidRequest(`comments/${commentId}/add_reaction`, {
      method: 'PATCH',
      body: JSON.stringify({
        data: { type: 'comments', attributes: { reaction } },
      }),
    });
  }

  // ---- Todo methods ----

  async listTodos(params?: {
    task_id?: string;
    deal_id?: string;
    assignee_id?: string;
    status?: number;
    limit?: number;
    page?: number;
  }): Promise<ProductiveResponse<ProductiveTodo>> {
    const q = new URLSearchParams();
    if (params?.task_id) q.append('filter[task_id]', params.task_id);
    if (params?.deal_id) q.append('filter[deal_id]', params.deal_id);
    if (params?.assignee_id) q.append('filter[assignee_id]', params.assignee_id);
    if (params?.status) q.append('filter[status]', params.status.toString());
    if (params?.limit) q.append('page[size]', params.limit.toString());
    if (params?.page) q.append('page[number]', params.page.toString());
    const qs = q.toString();
    return this.makeRequest<ProductiveResponse<ProductiveTodo>>(`todos${qs ? `?${qs}` : ''}`);
  }

  async getTodo(todoId: string): Promise<ProductiveSingleResponse<ProductiveTodo>> {
    return this.makeRequest<ProductiveSingleResponse<ProductiveTodo>>(`todos/${todoId}`);
  }

  async createTodo(data: ProductiveTodoCreate): Promise<ProductiveSingleResponse<ProductiveTodo>> {
    return this.makeRequest<ProductiveSingleResponse<ProductiveTodo>>('todos', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTodo(todoId: string, data: ProductiveTodoUpdate): Promise<ProductiveSingleResponse<ProductiveTodo>> {
    return this.makeRequest<ProductiveSingleResponse<ProductiveTodo>>(`todos/${todoId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteTodo(todoId: string): Promise<void> {
    return this.makeVoidRequest(`todos/${todoId}`, { method: 'DELETE' });
  }

  // ---- Page methods ----

  async listPages(params?: {
    project_id?: string;
    creator_id?: string;
    sort?: string;
    limit?: number;
    page?: number;
  }): Promise<ProductiveResponse<ProductivePage>> {
    const q = new URLSearchParams();
    if (params?.project_id) q.append('filter[project_id]', params.project_id);
    if (params?.creator_id) q.append('filter[creator_id]', params.creator_id);
    if (params?.sort) q.append('sort', params.sort);
    if (params?.limit) q.append('page[size]', params.limit.toString());
    if (params?.page) q.append('page[number]', params.page.toString());
    const qs = q.toString();
    return this.makeRequest<ProductiveResponse<ProductivePage>>(`pages${qs ? `?${qs}` : ''}`);
  }

  async getPage(pageId: string): Promise<ProductiveSingleResponse<ProductivePage>> {
    return this.makeRequest<ProductiveSingleResponse<ProductivePage>>(`pages/${pageId}?include=creator,project`);
  }

  async createPage(data: ProductivePageCreate): Promise<ProductiveSingleResponse<ProductivePage>> {
    return this.makeRequest<ProductiveSingleResponse<ProductivePage>>('pages', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updatePage(pageId: string, data: ProductivePageUpdate): Promise<ProductiveSingleResponse<ProductivePage>> {
    return this.makeRequest<ProductiveSingleResponse<ProductivePage>>(`pages/${pageId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deletePage(pageId: string): Promise<void> {
    return this.makeVoidRequest(`pages/${pageId}`, { method: 'DELETE' });
  }

  async movePage(pageId: string, targetDocId: string): Promise<void> {
    return this.makeVoidRequest(`pages/${pageId}/move`, {
      method: 'PATCH',
      body: JSON.stringify({
        data: { type: 'pages', attributes: { target_doc_id: targetDocId } },
      }),
    });
  }

  async copyPage(templateId: string, projectId?: string): Promise<ProductiveSingleResponse<ProductivePage>> {
    const attributes: Record<string, string> = { template_id: templateId };
    if (projectId) attributes.project_id = projectId;
    return this.makeRequest<ProductiveSingleResponse<ProductivePage>>('pages/copy', {
      method: 'POST',
      body: JSON.stringify({
        data: { type: 'pages', attributes },
      }),
    });
  }

  // ---- Task Dependency methods ----

  async listTaskDependencies(params?: {
    task_id?: string;
    dependent_task_id?: string;
    type_id?: number;
    limit?: number;
    page?: number;
  }): Promise<ProductiveResponse<ProductiveTaskDependency>> {
    const q = new URLSearchParams();
    q.append('include', 'task,dependent_task');
    if (params?.task_id) q.append('filter[task_id]', params.task_id);
    if (params?.dependent_task_id) q.append('filter[dependent_task_id]', params.dependent_task_id);
    if (params?.type_id) q.append('filter[type_id]', params.type_id.toString());
    if (params?.limit) q.append('page[size]', params.limit.toString());
    if (params?.page) q.append('page[number]', params.page.toString());
    const qs = q.toString();
    return this.makeRequest<ProductiveResponse<ProductiveTaskDependency>>(`task_dependencies${qs ? `?${qs}` : ''}`);
  }

  async getTaskDependency(dependencyId: string): Promise<ProductiveSingleResponse<ProductiveTaskDependency>> {
    return this.makeRequest<ProductiveSingleResponse<ProductiveTaskDependency>>(
      `task_dependencies/${dependencyId}?include=task,dependent_task`
    );
  }

  async createTaskDependency(data: ProductiveTaskDependencyCreate): Promise<ProductiveSingleResponse<ProductiveTaskDependency>> {
    return this.makeRequest<ProductiveSingleResponse<ProductiveTaskDependency>>('task_dependencies', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteTaskDependency(dependencyId: string): Promise<void> {
    return this.makeVoidRequest(`task_dependencies/${dependencyId}`, { method: 'DELETE' });
  }
}
