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
  ProductiveResponse, 
  ProductiveSingleResponse,
  ProductiveTaskCreate,
  ProductiveTaskUpdate,
  ProductiveBoardCreate,
  ProductiveTaskListCreate,
  ProductiveCommentCreate,
  ProductiveTimeEntryCreate,
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
        // Debug: Log full error response
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
}