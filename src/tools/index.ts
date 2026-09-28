import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { syncOdooTaskSchema, handleSyncOdooTask } from './syncTask.js';
import { scaffoldTaskSchema, handleScaffoldTask } from './scaffoldTask.js';
import { logTaskChangeSchema, handleLogTaskChange } from './logChange.js';
import { validateEnvironmentSchema, handleValidateEnvironment } from './validateEnv.js';
import { listOdooTasksSchema, handleListOdooTasks } from './listTasks.js';
import { createPullRequestSchema, handleCreatePullRequest } from './createPullRequest.js';
import { evidenceSummarySchema, handleEvidenceSummary } from './evidenceSummary.js';

export * from './syncTask.js';
export * from './scaffoldTask.js';
export * from './logChange.js';
export * from './validateEnv.js';
export * from './listTasks.js';
export * from './createPullRequest.js';
export * from './evidenceSummary.js';

/**
 * Registers all Odoo Git Workflow tools to an McpServer instance
 */
export function registerAllTools(server: McpServer): void {
  // 1. validate_environment
  server.tool(
    'validate_environment',
    'Tests and diagnoses connection to Odoo (XML-RPC authentication, server version, user) and checks the local Git repository status and GitHub origin',
    validateEnvironmentSchema,
    async (args) => {
      try {
        const result = await handleValidateEnvironment(args);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Error en validate_environment: ${error?.message || String(error)}`,
            },
          ],
        };
      }
    }
  );

  // 2. list_odoo_tasks
  server.tool(
    'list_odoo_tasks',
    'Searches and lists tasks from Odoo (Read-Only) assigned to the authenticated user or filtered by keyword, stage, or project',
    listOdooTasksSchema,
    async (args) => {
      try {
        const result = await handleListOdooTasks(args);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Error en list_odoo_tasks: ${error?.message || String(error)}`,
            },
          ],
        };
      }
    }
  );

  // 3. sync_odoo_task
  server.tool(
    'sync_odoo_task',
    'Fetches an Odoo project.task via XML-RPC (Read-Only), extracts metadata, subtasks, tags, and computes recommended git branch strategy (feat/fix, single vs stacked)',
    syncOdooTaskSchema,
    async (args) => {
      try {
        const result = await handleSyncOdooTask(args);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Error en sync_odoo_task: ${error?.message || String(error)}`,
            },
          ],
        };
      }
    }
  );

  // 4. scaffold_task
  server.tool(
    'scaffold_task',
    'Creates and checks out the local Git branch for an Odoo task, and scaffolds the markdown tracking documentation in .tasks/TASK-<id>.md with acceptance criteria',
    scaffoldTaskSchema,
    async (args) => {
      try {
        const result = await handleScaffoldTask(args);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Error en scaffold_task: ${error?.message || String(error)}`,
            },
          ],
        };
      }
    }
  );

  // 5. log_task_change
  server.tool(
    'log_task_change',
    'Appends a changelog entry to the table in .tasks/TASK-<id>.md after making commits or significant code changes',
    logTaskChangeSchema,
    async (args) => {
      try {
        const result = await handleLogTaskChange(args);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Error en log_task_change: ${error?.message || String(error)}`,
            },
          ],
        };
      }
    }
  );

  // 6. create_github_pr
  server.tool(
    'create_github_pr',
    'Prepares and creates a GitHub Pull Request with evidences from .tasks/TASK-<id>.md. REQUIRES confirmedByUser: true to create on GitHub; otherwise returns a preview for user approval.',
    createPullRequestSchema,
    async (args) => {
      try {
        const result = await handleCreatePullRequest(args);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Error en create_github_pr: ${error?.message || String(error)}`,
            },
          ],
        };
      }
    }
  );

  // 7. get_task_evidence_summary
  server.tool(
    'get_task_evidence_summary',
    'Generates a delivery evidence markdown summary for a completed task, formatted for Odoo Chatter or QA validation',
    evidenceSummarySchema,
    async (args) => {
      try {
        const result = await handleEvidenceSummary(args);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Error en get_task_evidence_summary: ${error?.message || String(error)}`,
            },
          ],
        };
      }
    }
  );
}
