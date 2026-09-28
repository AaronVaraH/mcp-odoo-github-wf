import { z } from 'zod';
import { OdooClient } from '../odoo/client.js';
import { OdooTaskClean } from '../odoo/types.js';
import { determineGitStrategy } from '../git/strategy.js';
import { GitManager } from '../git/operations.js';
import { scaffoldTaskDoc } from '../docs/generator.js';

export const scaffoldTaskSchema = {
  taskId: z
    .union([z.number(), z.string()])
    .describe('Numeric ID or reference of the Odoo task (project.task)'),
  branchName: z
    .string()
    .optional()
    .describe('Explicit branch name to create/checkout. If omitted, the calculated primary branch name is used'),
  baseBranch: z
    .string()
    .optional()
    .describe('Base branch to branch off from (e.g. "main", "master", or "develop")'),
  createGitBranch: z
    .boolean()
    .optional()
    .default(true)
    .describe('Whether to create and checkout the git branch locally (default: true)'),
  targetDir: z
    .string()
    .optional()
    .describe('Target project working directory (defaults to current working directory)'),
  overwriteDoc: z
    .boolean()
    .optional()
    .default(false)
    .describe('Whether to overwrite the .tasks/TASK-<id>.md file if it already exists (default: false)'),
  mockTaskData: z
    .object({
      id: z.number().optional(),
      name: z.string(),
      description: z.string().optional(),
      tag_names: z.array(z.string()).optional(),
      child_ids: z.array(z.number()).optional(),
      subtasks: z.array(z.object({ id: z.number(), name: z.string() })).optional(),
      planned_hours: z.number().optional(),
    })
    .optional()
    .describe('Optional mock task payload for offline testing without connecting to live Odoo instance'),
};

export async function handleScaffoldTask(args: {
  taskId: number | string;
  branchName?: string;
  baseBranch?: string;
  createGitBranch?: boolean;
  targetDir?: string;
  overwriteDoc?: boolean;
  mockTaskData?: any;
}) {
  const numericId = typeof args.taskId === 'string'
    ? parseInt(args.taskId.replace(/\D/g, ''), 10)
    : args.taskId;

  const targetDir = args.targetDir || process.cwd();
  let task: OdooTaskClean;

  if (args.mockTaskData) {
    task = {
      id: args.mockTaskData.id || numericId || 999,
      name: args.mockTaskData.name,
      description: args.mockTaskData.description || '',
      tag_ids: [],
      tag_names: args.mockTaskData.tag_names || [],
      child_ids: args.mockTaskData.child_ids || (args.mockTaskData.subtasks?.map((s: any) => s.id) || []),
      subtasks: args.mockTaskData.subtasks || [],
      planned_hours: args.mockTaskData.planned_hours || 0,
      stage_name: 'En Progreso',
    };
  } else {
    const odooClient = new OdooClient();
    task = await odooClient.getTask(numericId);
  }

  const plan = determineGitStrategy(task);
  const selectedBranch = args.branchName || plan.primaryBranchName;

  // 1. Create/checkout Git branch if requested
  let gitResult: any = { skipped: true };
  if (args.createGitBranch !== false) {
    const gitManager = new GitManager(targetDir);
    const isRepo = await gitManager.isGitRepo();
    if (isRepo) {
      gitResult = await gitManager.checkoutOrCreateBranch(selectedBranch, args.baseBranch);
    } else {
      gitResult = {
        skipped: true,
        warning: `Directory "${targetDir}" is not a Git repository. Branch creation was skipped.`,
      };
    }
  }

  // 2. Generate task markdown doc in .tasks/
  const docResult = scaffoldTaskDoc(
    {
      task,
      plan,
      selectedBranch,
    },
    {
      targetDir,
      overwrite: args.overwriteDoc ?? false,
    }
  );

  return {
    success: true,
    task: {
      id: task.id,
      name: task.name,
    },
    git: {
      activeBranch: selectedBranch,
      branchResult: gitResult,
    },
    documentation: {
      filePath: docResult.filePath,
      relativeFilePath: docResult.relativeFilePath,
      created: docResult.created,
    },
    plan: {
      type: plan.type,
      strategy: plan.strategy,
      suggestedBranches: plan.suggestedBranches,
    },
    instruction: `Tarea iniciada. Revisa los criterios de aceptación en "${docResult.relativeFilePath}". Recuerda invocar "log_task_change" tras cada commit o cambio importante.`,
  };
}
