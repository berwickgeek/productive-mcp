export interface ProductiveCompany {
  id: string;
  type: 'companies';
  attributes: {
    name: string;
    billing_name?: string;
    vat?: string;
    default_currency?: string;
    company_code?: string;
    domain?: string;
    description?: string;
    tag_list?: string[];
    created_at: string;
    updated_at: string;
    [key: string]: any;
  };
  relationships?: {
    [key: string]: any;
  };
}

export interface ProductiveProject {
  id: string;
  type: 'projects';
  attributes: {
    name: string;
    description?: string;
    status: 'active' | 'archived';
    created_at: string;
    updated_at: string;
    [key: string]: any;
  };
  relationships?: {
    company?: {
      data: {
        id: string;
        type: 'companies';
      };
    };
    [key: string]: any;
  };
}

export interface ProductiveTask {
  id: string;
  type: 'tasks';
  attributes: {
    title: string;
    description?: string;
    status?: number; // 1 = open, 2 = closed (for API requests)
    closed?: boolean; // false = open, true = closed (from API responses)
    due_date?: string;
    created_at: string;
    updated_at: string;
    [key: string]: any;
  };
  relationships?: {
    project?: {
      data: {
        id: string;
        type: 'projects';
      };
    };
    assignee?: {
      data: {
        id: string;
        type: 'people';
      };
    };
    [key: string]: any;
  };
}

export interface ProductiveResponse<T> {
  data: T[];
  links?: {
    first?: string;
    last?: string;
    prev?: string;
    next?: string;
  };
  meta?: {
    current_page?: number;
    total_pages?: number;
    total_count?: number;
  };
}

export interface ProductiveBoard {
  id: string;
  type: 'boards';
  attributes: {
    name: string;
    description?: string;
    position?: number;
    created_at: string;
    updated_at: string;
    [key: string]: any;
  };
  relationships?: {
    project?: {
      data: {
        id: string;
        type: 'projects';
      };
    };
    [key: string]: any;
  };
}

export interface ProductiveTaskCreate {
  data: {
    type: 'tasks';
    attributes: {
      title: string;
      description?: string;
      due_date?: string;
      status?: number;
    };
    relationships?: {
      project?: {
        data: {
          id: string;
          type: 'projects';
        };
      };
      board?: {
        data: {
          id: string;
          type: 'boards';
        };
      };
      task_list?: {
        data: {
          id: string;
          type: 'task_lists';
        };
      };
      assignee?: {
        data: {
          id: string;
          type: 'people';
        };
      };
    };
  };
}

export interface ProductiveTaskList {
  id: string;
  type: 'task_lists';
  attributes: {
    name: string;
    description?: string;
    position?: number;
    created_at: string;
    updated_at: string;
    [key: string]: any;
  };
  relationships?: {
    board?: {
      data: {
        id: string;
        type: 'boards';
      };
    };
    [key: string]: any;
  };
}

export interface ProductiveBoardCreate {
  data: {
    type: 'boards';
    attributes: {
      name: string;
      description?: string;
    };
    relationships: {
      project: {
        data: {
          id: string;
          type: 'projects';
        };
      };
    };
  };
}

export interface ProductiveTaskListCreate {
  data: {
    type: 'task_lists';
    attributes: {
      name: string;
      description?: string;
      position?: number;
      project_id: string;
    };
    relationships: {
      board: {
        data: {
          id: string;
          type: 'boards';
        };
      };
    };
  };
}

export interface ProductiveTaskUpdate {
  data: {
    type: 'tasks';
    id: string;
    attributes?: {
      title?: string;
      description?: string;
      due_date?: string;
      status?: number;
      custom_fields?: Record<string, any>;
    };
    relationships?: {
      assignee?: {
        data: {
          id: string;
          type: 'people';
        } | null;
      };
      workflow_status?: {
        data: {
          id: string;
          type: 'workflow_statuses';
        };
      };
      task_list?: {
        data: {
          id: string;
          type: 'task_lists';
        };
      };
    };
  };
}

export interface ProductiveSingleResponse<T> {
  data: T;
}

export interface ProductivePerson {
  id: string;
  type: 'people';
  attributes: {
    email: string;
    first_name: string;
    last_name: string;
    title?: string;
    role?: string;
    is_active?: boolean;
    avatar_url?: string;
    created_at: string;
    updated_at: string;
    [key: string]: any;
  };
  relationships?: {
    company?: {
      data: {
        id: string;
        type: 'companies';
      };
    };
    [key: string]: any;
  };
}

export interface ProductiveActivity {
  id: string;
  type: 'activities';
  attributes: {
    event: string; // 'create', 'update', 'delete', etc.
    item_type: string; // 'Task', 'Project', 'Workspace', etc.
    item_id: string;
    changes?: Record<string, any>;
    created_at: string;
    [key: string]: any;
  };
  relationships?: {
    organization?: {
      data: {
        id: string;
        type: 'organizations';
      };
    };
    creator?: {
      data: {
        id: string;
        type: 'people';
      };
    };
    [key: string]: any;
  };
}

export interface ProductiveComment {
  id: string;
  type: 'comments';
  attributes: {
    body: string;
    commentable_type: string;
    created_at: string;
    updated_at: string;
    deleted_at?: string;
    draft?: boolean;
    edited_at?: string;
    hidden?: boolean;
    pinned_at?: string;
    reactions?: Record<string, any>;
    version_number?: number;
    [key: string]: any;
  };
  relationships?: {
    creator?: {
      data: {
        id: string;
        type: 'people';
      };
    };
    task?: {
      data: {
        id: string;
        type: 'tasks';
      };
    };
    [key: string]: any;
  };
}

export interface ProductiveCommentCreate {
  data: {
    type: 'comments';
    attributes: {
      body: string;
    };
    relationships: {
      task: {
        data: {
          id: string;
          type: 'tasks';
        };
      };
    };
  };
}

export interface ProductiveWorkflowStatus {
  id: string;
  type: 'workflow_statuses';
  attributes: {
    name: string;
    color_id: number;
    position: number;
    category_id: number; // 1=not started, 2=started, 3=closed
    created_at: string;
    updated_at: string;
    [key: string]: any;
  };
  relationships?: {
    workflow?: {
      data: {
        id: string;
        type: 'workflows';
      };
    };
    [key: string]: any;
  };
}

/**
 * Service entity interface for Productive API
 * Services represent billable activities/work types in Productive
 */
export interface ProductiveService {
  id: string;
  type: 'services';
  attributes: {
    name: string;
    description?: string;
    is_active?: boolean;
    created_at: string;
    updated_at: string;
    [key: string]: any;
  };
  relationships?: {
    company?: {
      data: {
        id: string;
        type: 'companies';
      };
    };
    [key: string]: any;
  };
}

/**
 * Time entry entity interface for Productive API
 * Represents logged time against tasks or projects
 */
export interface ProductiveTimeEntry {
  id: string;
  type: 'time_entries';
  attributes: {
    date: string; // ISO date format (YYYY-MM-DD)
    time: number; // Time in minutes
    billable_time?: number; // Billable time in minutes, defaults to time value
    note?: string; // Description of work performed
    created_at: string;
    updated_at: string;
    [key: string]: any;
  };
  relationships?: {
    person?: {
      data: {
        id: string;
        type: 'people';
      };
    };
    service?: {
      data: {
        id: string;
        type: 'services';
      };
    };
    task?: {
      data: {
        id: string;
        type: 'tasks';
      };
    };
    project?: {
      data: {
        id: string;
        type: 'projects';
      };
    };
    [key: string]: any;
  };
}

/**
 * Deal/Budget entity representing project budgets or deals
 */
export interface ProductiveDeal {
  id: string;
  type: 'deals';
  attributes: {
    name: string;
    budget_type?: number; // 1: deal, 2: budget
    value?: number;
    created_at?: string;
    updated_at?: string;
    [key: string]: any;
  };
  relationships?: {
    project?: {
      data?: {
        id: string;
        type: 'projects';
      };
    };
    services?: {
      data?: Array<{
        id: string;
        type: 'services';
      }>;
    };
    [key: string]: any;
  };
}

/**
 * Time entry creation interface for Productive API
 * Used when creating new time entries via POST requests
 */
export interface ProductiveTimeEntryCreate {
  data: {
    type: 'time_entries';
    attributes: {
      date: string; // ISO date format (YYYY-MM-DD)
      time: number; // Time in minutes (required)
      billable_time?: number; // Billable time in minutes, defaults to time value
      note?: string; // Description of work performed
    };
    relationships: {
      person: {
        data: {
          id: string;
          type: 'people';
        };
      };
      service: {
        data: {
          id: string;
          type: 'services';
        };
      };
      task?: {
        data: {
          id: string;
          type: 'tasks';
        };
      };
    };
  };
}

export interface ProductiveError {
  errors: Array<{
    status?: string;
    title?: string;
    detail?: string;
    source?: {
      pointer?: string;
      parameter?: string;
    };
  }>;
}