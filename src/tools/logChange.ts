import { z } from 'zod';
import { GitManager } from '../git/operations.js';
import { appendChangelogEntry } from '../docs/generator.js';

export const logTaskChangeSchema = {
  taskId: z
    .union([z.number(), z.string()])
    .describe('Numeric ID or reference of the Odoo task (project.task)'),
  description: z
    .string()
    .describe('Description of the change, refactoring, or feature implemented'),
  files: z
    .array(z.string())
    .optional()
    .describe('List of modified or affected files. If omitted, will attempt to detect uncommitted or changed files via git status'),
  commit: z
    .string()
    .optional()
    .describe('Git commit hash (SHA) or message. If omitted and git has commits, the latest commit hash is auto-detected'),
  targetDir: z
    .string()
    .optional()
    .describe('Target project working directory (defaults to current working directory)'),
};

export async function handleLogTaskChange(args: {
  taskId: number | string;
  description: string;
  files?: string[];
  commit?: string;
  targetDir?: string;
}) {
  const numericId = typeof args.taskId === 'string'
    ? parseInt(args.taskId.replace(/\D/g, ''), 10)
    : args.taskId;

  const targetDir = args.targetDir || process.cwd();
  let files = args.files;
  let commit = args.commit;

  // Attempt auto-detection via Git if not provided
  try {
    const gitManager = new GitManager(targetDir);
    const isRepo = await gitManager.isGitRepo();

    if (isRepo) {
      const repoStatus = await gitManager.getRepoStatus();

      if (!commit && repoStatus.latestCommit) {
        commit = repoStatus.latestCommit;
      }

      if (!files || files.length === 0) {
        if (repoStatus.modifiedFiles.length > 0) {
          files = repoStatus.modifiedFiles;
        }
      }
    }
  } catch {
    // If git detection fails, proceed gracefully
  }

  const result = appendChangelogEntry(
    numericId,
    {
      description: args.description,
      files,
      commit,
    },
    targetDir
  );

  return {
    success: true,
    taskId: numericId,
    filePath: result.filePath,
    changelogRow: result.formattedRow,
    message: `Entry added to changelog in "${result.filePath}".`,
  };
}
