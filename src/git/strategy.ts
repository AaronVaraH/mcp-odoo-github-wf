import { OdooTaskClean } from '../odoo/types.js';
import {
  GitStrategyPlan,
  GitStrategyOptions,
  TaskBranchType,
  TaskBranchStrategy,
  StackedBranchDef,
} from './types.js';

/**
 * Converts a string into a clean git branch slug
 */
export function slugify(text: string, maxLength: number = 40): string {
  if (!text) return '';
  const slug = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics / accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric chars with hyphen
    .replace(/^-+|-+$/g, '') // Trim leading/trailing hyphens
    .substring(0, maxLength)
    .replace(/-+$/, '');
  return slug || 'task';
}

/**
 * Analyzes an Odoo task and determines branch type (feat/fix) and strategy (single/stacked)
 */
export function determineGitStrategy(
  task: OdooTaskClean,
  options: GitStrategyOptions = {}
): GitStrategyPlan {
  const estimateThreshold = options.estimateThresholdHours ?? 8;
  const defaultSuffixes = options.defaultStackedSuffixes ?? ['01-db', '02-api', '03-ui'];

  // 1. Determine Type: bug/fix detection in tags or title
  const titleLower = task.name.toLowerCase();
  const tagsLower = task.tag_names.map((t) => t.toLowerCase());

  const isBugOrFix =
    tagsLower.some((t) => t.includes('bug') || t.includes('fix') || t.includes('error') || t.includes('hotfix')) ||
    /\b(bug|fix|error|hotfix|patch|issue|falla|defecto)\b/i.test(titleLower);

  const type: TaskBranchType = isBugOrFix ? 'fix' : 'feat';

  // 2. Determine Strategy: stacked-branches vs feature-branch
  const hasSubtasks = (task.child_ids && task.child_ids.length > 0) || (task.subtasks && task.subtasks.length > 0);
  const plannedHours = task.planned_hours || 0;
  const isHighEstimate = plannedHours >= estimateThreshold;

  let strategy: TaskBranchStrategy = 'feature-branch';
  let reasoning = '';

  if (hasSubtasks) {
    strategy = 'stacked-branches';
    reasoning = `Task has ${task.child_ids.length} subtask(s) in Odoo, requiring a stacked-branch workflow for modular review.`;
  } else if (isHighEstimate) {
    strategy = 'stacked-branches';
    reasoning = `Task estimation (${plannedHours}h) meets or exceeds threshold (${estimateThreshold}h), suggesting architecture/multi-tier stacked branches.`;
  } else {
    strategy = 'feature-branch';
    reasoning = `Task is straightforward without subtasks and within estimate limit (${plannedHours}h < ${estimateThreshold}h).`;
  }

  // 3. Generate primary branch name
  const taskSlug = slugify(task.name, 35);
  const baseBranchName = `${type}/TASK-${task.id}-${taskSlug}`;
  let primaryBranchName = baseBranchName;

  const suggestedBranches: string[] = [];
  let stackedBranches: StackedBranchDef[] | undefined;

  if (strategy === 'stacked-branches') {
    stackedBranches = [];

    if (task.subtasks && task.subtasks.length > 0) {
      // Create stacked branches based on actual subtasks
      task.subtasks.forEach((sub, index) => {
        const step = index + 1;
        const stepPrefix = String(step).padStart(2, '0');
        const subSlug = slugify(sub.name, 25);
        const suffix = `${stepPrefix}-${subSlug}`;
        const branchName = `${baseBranchName}/${suffix}`;

        stackedBranches!.push({
          step,
          suffix,
          branchName,
          description: sub.name,
          subtaskId: sub.id,
        });
        suggestedBranches.push(branchName);
      });
    } else {
      // Create stacked branches from defaults (e.g. 01-db, 02-api, 03-ui)
      defaultSuffixes.forEach((suf, index) => {
        const step = index + 1;
        const branchName = `${baseBranchName}/${suf}`;
        stackedBranches!.push({
          step,
          suffix: suf,
          branchName,
          description: `Layer ${suf}`,
        });
        suggestedBranches.push(branchName);
      });
    }

    // Default primary branch for scaffolding first step in stacked workflow
    primaryBranchName = suggestedBranches[0] || baseBranchName;
  } else {
    suggestedBranches.push(baseBranchName);
  }

  return {
    taskId: task.id,
    taskName: task.name,
    type,
    strategy,
    baseBranchName,
    primaryBranchName,
    suggestedBranches,
    stackedBranches,
    reasoning,
  };
}
