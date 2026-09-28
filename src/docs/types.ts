import { OdooTaskClean } from '../odoo/types.js';
import { GitStrategyPlan } from '../git/types.js';

export interface ChangelogEntry {
  date?: string;
  description: string;
  files?: string[];
  commit?: string;
}

export interface TaskDocScaffoldResult {
  filePath: string;
  relativeFilePath: string;
  created: boolean;
  content: string;
}

export interface TaskDocData {
  task: OdooTaskClean;
  plan: GitStrategyPlan;
  selectedBranch?: string;
}
