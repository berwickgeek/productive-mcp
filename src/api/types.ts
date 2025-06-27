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
    status: number; // 1 = open, 2 = closed
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
    };
    relationships?: {
      assignee?: {
        data: {
          id: string;
          type: 'people';
        } | null;
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