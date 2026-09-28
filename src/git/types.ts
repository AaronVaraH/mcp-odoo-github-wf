export type TaskBranchType = 'feat' | 'fix';

export type TaskBranchStrategy = 'feature-branch' | 'stacked-branches';

export interface StackedBranchDef {
  step: number;
  suffix: string;
  branchName: string;
  description: string;
  subtaskId?: number;
}

export interface GitStrategyPlan {
  taskId: number;
  taskName: string;
  type: TaskBranchType;
  strategy: TaskBranchStrategy;
  baseBranchName: string;
  primaryBranchName: string;
  suggestedBranches: string[];
  stackedBranches?: StackedBranchDef[];
  reasoning: string;
}

export interface GitStrategyOptions {
  estimateThresholdHours?: number;
  defaultStackedSuffixes?: string[];
  prefix?: string;
}

export interface GitRepoStatus {
  currentBranch: string;
  latestCommit?: string;
  latestCommitMessage?: string;
  modifiedFiles: string[];
  isClean: boolean;
}

export interface GitEnvironmentDetails {
  isRepo: boolean;
  basePath: string;
  currentBranch?: string;
  gitUserName?: string;
  gitUserEmail?: string;
  remoteOriginUrl?: string;
  isClean?: boolean;
}

