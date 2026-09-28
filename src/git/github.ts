import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { GitManager } from './operations.js';

const execFileAsync = promisify(execFile);

export interface GitHubRepoInfo {
  owner: string;
  repo: string;
  fullUrl: string;
}

export interface PRPreview {
  title: string;
  headBranch: string;
  baseBranch: string;
  body: string;
  taskId: number;
}

export interface CreatePRResult {
  success: boolean;
  status: 'CONFIRMATION_REQUIRED' | 'CREATED' | 'ERROR';
  preview?: PRPreview;
  prUrl?: string;
  prNumber?: number;
  message: string;
}

/**
 * Extracts owner and repo name from remote origin URL
 * e.g. "git@github.com:owner/repo.git" or "https://github.com/owner/repo.git"
 */
export function parseGitHubRemote(remoteUrl: string): GitHubRepoInfo | null {
  if (!remoteUrl) return null;
  const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?/i);
  if (!match) return null;
  return {
    owner: match[1],
    repo: match[2],
    fullUrl: `https://github.com/${match[1]}/${match[2]}`,
  };
}

/**
 * Parses .tasks/TASK-<id>.md to construct a rich PR description
 */
export function buildPRContentFromTaskDoc(
  taskId: number | string,
  targetDir: string = process.cwd()
): { title: string; body: string; taskName: string; taskType: string } {
  const numericId = typeof taskId === 'string' ? parseInt(taskId.replace(/\D/g, ''), 10) : taskId;
  const filePath = path.join(targetDir, '.tasks', `TASK-${numericId}.md`);

  let title = `feat(TASK-${numericId}): Implement task requirement`;
  let taskName = `TASK-${numericId}`;
  let taskType = 'feat';

  if (!fs.existsSync(filePath)) {
    return {
      title,
      body: `## Odoo Task: TASK-${numericId}\n\n*Documentación no encontrada en .tasks/TASK-${numericId}.md*`,
      taskName,
      taskType,
    };
  }

  const content = fs.readFileSync(filePath, 'utf-8');

  // Parse title: # TASK-123: Title
  const titleMatch = content.match(/^#\s+TASK-\d+:\s*(.+)$/m);
  if (titleMatch) {
    taskName = titleMatch[1].trim();
  }

  // Parse type from metadata table
  const typeMatch = content.match(/\|\s*\*\*Tipo\*\*\s*\|\s*`([^`]+)`\s*\|/i);
  if (typeMatch) {
    taskType = typeMatch[1].toLowerCase().includes('fix') ? 'fix' : 'feat';
  }

  title = `${taskType}(TASK-${numericId}): ${taskName}`;

  // Extract Criterios de Aceptación
  let criteriaSection = '';
  const criteriaMatch = content.match(/##\s+Criterios de Aceptaci[oó]n([\s\S]*?)(?=##|$)/i);
  if (criteriaMatch) {
    criteriaSection = criteriaMatch[1].trim();
  }

  // Extract Changelog table
  let changelogSection = '';
  const changelogMatch = content.match(/##\s+Changelog([\s\S]*?)(?=##|$)/i);
  if (changelogMatch) {
    changelogSection = changelogMatch[1].trim();
  }

  // Extract Description
  let descSection = '';
  const descMatch = content.match(/##\s+Descripci[oó]n\s*\/\s*Requerimiento([\s\S]*?)(?=##|$)/i);
  if (descMatch) {
    descSection = descMatch[1].trim();
  }

  const prBody = `## 📋 Resumen (Odoo TASK-${numericId})
**Tarea:** [TASK-${numericId}] ${taskName}  
**Tipo:** \`${taskType}\`

### Requerimiento
${descSection || '*Sin descripción provista.*'}

---

## ✅ Criterios de Aceptación y Verificación
${criteriaSection || '- [x] Requerimientos implementados y validados'}

---

## 📝 Registro de Cambios y Evidencias
${changelogSection || '*Ver historial de commits del PR.*'}

---
> *Generado automáticamente por el servidor MCP Odoo Git Workflow.*`;

  return {
    title,
    body: prBody,
    taskName,
    taskType,
  };
}

/**
 * Determines the target base branch for stacked branches or standard feature branches
 */
export function determineBaseBranch(currentBranch: string, defaultBase: string = 'main'): string {
  // If current branch is a stacked branch step: e.g. "feat/TASK-123-title/02-api"
  const stackedMatch = currentBranch.match(/^(.*)\/(\d{2})-[^/]+$/);
  if (stackedMatch) {
    const basePrefix = stackedMatch[1];
    const currentStep = parseInt(stackedMatch[2], 10);
    if (currentStep > 1) {
      // Points to previous step branch if it exists, or base prefix
      const prevStepPrefix = String(currentStep - 1).padStart(2, '0');
      return `${basePrefix}/${prevStepPrefix}*`; // pattern indicating previous layer
    }
    // Step 01 targets main/default
    return defaultBase;
  }

  return defaultBase;
}

/**
 * Creates a Pull Request using gh CLI or GitHub REST API with authorization guard
 */
export async function createGitHubPullRequest(options: {
  taskId: number | string;
  headBranch?: string;
  baseBranch?: string;
  title?: string;
  body?: string;
  confirmedByUser: boolean;
  targetDir?: string;
  mockMode?: boolean;
}): Promise<CreatePRResult> {
  const numericId = typeof options.taskId === 'string'
    ? parseInt(options.taskId.replace(/\D/g, ''), 10)
    : options.taskId;

  const targetDir = options.targetDir || process.cwd();
  const gitManager = new GitManager(targetDir);
  const envDetails = await gitManager.getEnvironmentDetails();

  const currentBranch = options.headBranch || envDetails.currentBranch || 'main';
  const defaultBase = options.baseBranch || 'main';

  const docData = buildPRContentFromTaskDoc(numericId, targetDir);
  const prTitle = options.title || docData.title;
  const prBody = options.body || docData.body;

  const preview: PRPreview = {
    title: prTitle,
    headBranch: currentBranch,
    baseBranch: defaultBase,
    body: prBody,
    taskId: numericId,
  };

  // Authorization Check
  if (!options.confirmedByUser) {
    return {
      success: false,
      status: 'CONFIRMATION_REQUIRED',
      preview,
      message:
        '⚠️ AUTORIZACIÓN REQUERIDA: El Pull Request NO ha sido creado todavía. Presenta el título, la rama base y el cuerpo al usuario para su revisión. Cuando el usuario confirme la creación, vuelve a invocar esta herramienta con confirmedByUser: true.',
    };
  }

  // In Mock Mode (for unit testing)
  if (options.mockMode) {
    return {
      success: true,
      status: 'CREATED',
      preview,
      prUrl: `https://github.com/mock-owner/mock-repo/pull/${numericId}`,
      prNumber: numericId,
      message: `Pull Request de prueba creado exitosamente hacia "${defaultBase}".`,
    };
  }

  // Attempt using gh CLI first
  try {
    const { stdout } = await execFileAsync(
      'gh',
      [
        'pr',
        'create',
        '--title',
        prTitle,
        '--body',
        prBody,
        '--head',
        currentBranch,
        '--base',
        defaultBase,
      ],
      { cwd: targetDir }
    );

    const prUrl = stdout.trim();
    const prNumberMatch = prUrl.match(/\/pull\/(\d+)/);
    const prNumber = prNumberMatch ? parseInt(prNumberMatch[1], 10) : undefined;

    return {
      success: true,
      status: 'CREATED',
      preview,
      prUrl,
      prNumber,
      message: `Pull Request creado exitosamente en GitHub: ${prUrl}`,
    };
  } catch (ghErr: any) {
    // If gh CLI fails or is missing, try fallback via GitHub API with GITHUB_TOKEN
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    const remote = parseGitHubRemote(envDetails.remoteOriginUrl || '');

    if (token && remote) {
      try {
        const response = await fetch(`https://api.github.com/repos/${remote.owner}/${remote.repo}/pulls`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: prTitle,
            head: currentBranch,
            base: defaultBase,
            body: prBody,
          }),
        });

        const resData: any = await response.json();
        if (response.ok && resData.html_url) {
          return {
            success: true,
            status: 'CREATED',
            preview,
            prUrl: resData.html_url,
            prNumber: resData.number,
            message: `Pull Request creado exitosamente en GitHub: ${resData.html_url}`,
          };
        } else {
          throw new Error(resData.message || 'Error en GitHub REST API');
        }
      } catch (apiErr: any) {
        return {
          success: false,
          status: 'ERROR',
          preview,
          message: `Error al crear PR vía gh CLI y API: ${ghErr?.message || String(ghErr)}. Detalles API: ${apiErr?.message || String(apiErr)}`,
        };
      }
    }

    return {
      success: false,
      status: 'ERROR',
      preview,
      message: `Error al crear Pull Request con "gh pr create": ${ghErr?.message || String(ghErr)}. Verifica que la rama remota esté subida (git push -u origin <branch>) y que tengas sesión iniciada en GitHub CLI.`,
    };
  }
}
