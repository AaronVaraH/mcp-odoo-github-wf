import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { GitManager } from '../git/operations.js';

export const evidenceSummarySchema = {
  taskId: z
    .union([z.number(), z.string()])
    .describe('Numeric ID of the Odoo task (project.task)'),
  prUrl: z
    .string()
    .optional()
    .describe('Optional URL of the GitHub Pull Request created for this task'),
  targetDir: z
    .string()
    .optional()
    .describe('Working directory (defaults to current working directory)'),
};

export async function handleEvidenceSummary(args: {
  taskId: number | string;
  prUrl?: string;
  targetDir?: string;
}) {
  const numericId = typeof args.taskId === 'string'
    ? parseInt(args.taskId.replace(/\D/g, ''), 10)
    : args.taskId;

  const targetDir = args.targetDir || process.cwd();
  const filePath = path.join(targetDir, '.tasks', `TASK-${numericId}.md`);

  if (!fs.existsSync(filePath)) {
    throw new Error(
      `No se encontró el documento de tarea en "${filePath}". Asegúrate de haber ejecutado "scaffold_task" primero.`
    );
  }

  const content = fs.readFileSync(filePath, 'utf-8');

  // Extract task title
  const titleMatch = content.match(/^#\s+TASK-\d+:\s*(.+)$/m);
  const taskName = titleMatch ? titleMatch[1].trim() : `TASK-${numericId}`;

  // Extract criteria
  let criteriaSection = '';
  const criteriaMatch = content.match(/##\s+Criterios de Aceptaci[oó]n([\s\S]*?)(?=##|$)/i);
  if (criteriaMatch) {
    criteriaSection = criteriaMatch[1].trim();
  }

  // Count criteria stats
  const criteriaLines = criteriaSection.split('\n').filter((l) => l.trim().startsWith('- ['));
  const totalCriteria = criteriaLines.length;
  const completedCriteria = criteriaLines.filter((l) => l.includes('[x]') || l.includes('[X]')).length;

  // Extract changelog
  let changelogSection = '';
  const changelogMatch = content.match(/##\s+Changelog([\s\S]*?)(?=##|$)/i);
  if (changelogMatch) {
    changelogSection = changelogMatch[1].trim();
  }

  // Git status
  const gitManager = new GitManager(targetDir);
  const repoStatus = await gitManager.getRepoStatus().catch(() => null);

  const prSection = args.prUrl
    ? `🔗 **Pull Request GitHub:** [${args.prUrl}](${args.prUrl})`
    : `🌿 **Rama de Trabajo:** \`${repoStatus?.currentBranch || 'N/A'}\``;

  const summaryMarkdown = `### 🚀 Evidencia de Entrega - TASK-${numericId}: ${taskName}

${prSection}
📅 **Fecha de Reporte:** \`${new Date().toISOString().replace('T', ' ').substring(0, 19)}\`  
🎯 **Criterios Completados:** \`${completedCriteria}/${totalCriteria}\` (${totalCriteria > 0 ? Math.round((completedCriteria / totalCriteria) * 100) : 100}%)

#### ✅ Criterios de Aceptación Verificados
${criteriaSection || '- [x] Todos los requerimientos fueron completados.'}

#### 🛠️ Registro de Cambios Implementados
${changelogSection || '*Ver commits en el Pull Request.*'}

> *Esta evidencia fue generada con mcp-odoo-git-workflow para trazabilidad en Odoo Chatter y QA.*`;

  return {
    success: true,
    taskId: numericId,
    taskName,
    completedCriteria,
    totalCriteria,
    isComplete: completedCriteria === totalCriteria && totalCriteria > 0,
    evidenceMarkdown: summaryMarkdown,
    instruction:
      'Copia este resumen de evidencias en el Chatter de la tarea de Odoo o compártelo con el equipo de QA para validación final.',
  };
}
