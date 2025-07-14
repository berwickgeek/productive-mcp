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
  ProductiveResponse, 
  ProductiveSingleResponse,
  ProductiveTaskCreate,
  ProductiveTaskUpdate,
  ProductiveBoardCreate,
  ProductiveTaskListCreate,
  ProductiveCommentCreate,
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
      queryParams.append('filter[status]', params.status);
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
}