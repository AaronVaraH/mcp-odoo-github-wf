export interface OdooSubtask {
  id: number;
  name: string;
  stageName?: string;
}

export interface OdooParentTask {
  id: number;
  name: string;
}

export interface OdooTaskClean {
  id: number;
  name: string;
  description: string;
  descriptionHtml?: string;
  tag_ids: number[];
  tag_names: string[];
  child_ids: number[];
  subtasks: OdooSubtask[];
  parent_id?: OdooParentTask | null;
  planned_hours?: number;
  effective_hours?: number;
  stage_id?: [number, string] | null;
  stage_name?: string;
  user_names?: string[];
  priority?: string;
}

export interface OdooTaskSummary {
  id: number;
  name: string;
  stage_id?: [number, string] | null;
  stage_name?: string;
  planned_hours?: number;
  effective_hours?: number;
  priority?: string;
  tag_names?: string[];
  user_names?: string[];
  parent_id?: [number, string] | null;
}

export interface OdooListTasksOptions {
  query?: string;
  assignedToMe?: boolean;
  projectId?: number;
  stageName?: string;
  limit?: number;
}

export interface OdooClientConfig {
  url?: string;
  db?: string;
  uid?: number;
  user?: string;
  apiKey?: string;
}
