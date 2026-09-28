import { z } from 'zod';
import { OdooClient } from '../odoo/client.js';

export const listOdooTasksSchema = {
  query: z
    .string()
    .optional()
    .describe('Text to search within the Odoo task title (case-insensitive substring)'),
  assignedToMe: z
    .boolean()
    .optional()
    .default(true)
    .describe('Whether to only list tasks assigned to the currently authenticated Odoo user (default: true)'),
  stageName: z
    .string()
    .optional()
    .describe('Optional filter by stage name, e.g. "To Do", "In Progress", "Nuevo"'),
  projectId: z
    .number()
    .optional()
    .describe('Optional filter by numeric Odoo Project ID'),
  limit: z
    .number()
    .optional()
    .default(15)
    .describe('Maximum number of tasks to return (default: 15, max: 50)'),
  mockTasks: z
    .array(
      z.object({
        id: z.number(),
        name: z.string(),
        stage_name: z.string().optional(),
        planned_hours: z.number().optional(),
        tag_names: z.array(z.string()).optional(),
      })
    )
    .optional()
    .describe('Optional mock task list for offline testing'),
};

export async function handleListOdooTasks(args: {
  query?: string;
  assignedToMe?: boolean;
  stageName?: string;
  projectId?: number;
  limit?: number;
  mockTasks?: any[];
}) {
  if (args.mockTasks) {
    let filtered = [...args.mockTasks];
    if (args.query) {
      const q = args.query.toLowerCase();
      filtered = filtered.filter((t) => t.name.toLowerCase().includes(q));
    }
    return {
      success: true,
      count: filtered.length,
      tasks: filtered,
      next_step: filtered.length > 0
        ? `Use "sync_odoo_task" with taskId: ${filtered[0].id} to start working on a task.`
        : 'No tasks found matching criteria.',
    };
  }

  const odooClient = new OdooClient();
  const tasks = await odooClient.listTasks({
    query: args.query,
    assignedToMe: args.assignedToMe,
    stageName: args.stageName,
    projectId: args.projectId,
    limit: args.limit,
  });

  return {
    success: true,
    count: tasks.length,
    tasks: tasks.map((t) => ({
      id: t.id,
      name: t.name,
      stage: t.stage_name,
      planned_hours: t.planned_hours,
      tags: t.tag_names,
      priority: t.priority,
    })),
    next_step:
      tasks.length > 0
        ? `Select a task ID and execute "sync_odoo_task" (e.g. taskId: ${tasks[0].id}) to initiate workflow.`
        : 'No tasks found. Try broadening the search query or setting assignedToMe: false.',
  };
}
