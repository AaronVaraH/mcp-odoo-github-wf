import { z } from 'zod';
import { OdooClient } from '../odoo/client.js';
import { OdooTaskClean } from '../odoo/types.js';
import { determineGitStrategy } from '../git/strategy.js';

export const syncOdooTaskSchema = {
  taskId: z
    .union([z.number(), z.string()])
    .describe('Numeric ID or reference of the Odoo task (project.task), e.g. 104 or "TASK-104"'),
  customEstimateThreshold: z
    .number()
    .optional()
    .describe('Threshold in planned hours to trigger a stacked-branches strategy (default: 8)'),
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

export async function handleSyncOdooTask(args: {
  taskId: number | string;
  customEstimateThreshold?: number;
  mockTaskData?: any;
}) {
  const numericId = typeof args.taskId === 'string'
    ? parseInt(args.taskId.replace(/\D/g, ''), 10)
    : args.taskId;

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

  const plan = determineGitStrategy(task, {
    estimateThresholdHours: args.customEstimateThreshold,
  });

  return {
    success: true,
    task: {
      id: task.id,
      name: task.name,
      stage: task.stage_name,
      tags: task.tag_names,
      planned_hours: task.planned_hours,
      has_subtasks: task.child_ids.length > 0,
      subtasks_count: task.subtasks.length,
      subtasks: task.subtasks,
    },
    plan: {
      branchType: plan.type,
      strategy: plan.strategy,
      primaryBranchName: plan.primaryBranchName,
      baseBranchName: plan.baseBranchName,
      suggestedBranches: plan.suggestedBranches,
      stackedBranches: plan.stackedBranches,
      reasoning: plan.reasoning,
    },
    next_step: `Run "scaffold_task" with taskId: ${task.id} and branchName: "${plan.primaryBranchName}" to create branch and doc.`,
  };
}
