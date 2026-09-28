import { z } from 'zod';
import { createGitHubPullRequest } from '../git/github.js';

export const createPullRequestSchema = {
  taskId: z
    .union([z.number(), z.string()])
    .describe('Numeric ID of the Odoo task (project.task) for which the Pull Request is being created'),
  confirmedByUser: z
    .boolean()
    .describe('Explicit confirmation flag. MUST be true to execute the PR creation on GitHub. If false, returns a complete preview for user validation'),
  baseBranch: z
    .string()
    .optional()
    .default('main')
    .describe('Base branch the Pull Request should target (e.g. "main", "develop", or previous layer branch in stacked branches)'),
  headBranch: z
    .string()
    .optional()
    .describe('Head branch containing the changes. If omitted, uses the current active Git branch'),
  title: z
    .string()
    .optional()
    .describe('Custom Pull Request title. If omitted, generated from .tasks/TASK-<id>.md'),
  body: z
    .string()
    .optional()
    .describe('Custom Pull Request body markdown. If omitted, compiled from acceptance criteria and changelog in .tasks/TASK-<id>.md'),
  targetDir: z
    .string()
    .optional()
    .describe('Working directory (defaults to current working directory)'),
  mockMode: z
    .boolean()
    .optional()
    .describe('Mock execution flag for automated tests without calling live GitHub'),
};

export async function handleCreatePullRequest(args: {
  taskId: number | string;
  confirmedByUser: boolean;
  baseBranch?: string;
  headBranch?: string;
  title?: string;
  body?: string;
  targetDir?: string;
  mockMode?: boolean;
}) {
  return await createGitHubPullRequest({
    taskId: args.taskId,
    confirmedByUser: args.confirmedByUser,
    baseBranch: args.baseBranch,
    headBranch: args.headBranch,
    title: args.title,
    body: args.body,
    targetDir: args.targetDir,
    mockMode: args.mockMode,
  });
}
