import fs from 'fs';
import path from 'path';
import { ChangelogEntry, TaskDocData, TaskDocScaffoldResult } from './types.js';

export function formatCurrentTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const mins = pad(d.getMinutes());
  return `${year}-${month}-${day} ${hours}:${mins}`;
}

/**
 * Extracts acceptance criteria checklist items from text description, or generates sensible defaults
 */
export function extractAcceptanceCriteria(description: string, taskTitle: string, subtasks: Array<{ name: string }>): string[] {
  const criteria: string[] = [];

  if (description) {
    const lines = description.split('\n');
    let insideCriteriaSection = false;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      if (
        /^(criterios de aceptaci[oó]n|acceptance criteria|ac|criterios|requisitos):/i.test(line)
      ) {
        insideCriteriaSection = true;
        continue;
      }

      if (insideCriteriaSection) {
        if (/^#+/i.test(line) || /^[A-Z][a-zA-Z\s]+:$/i.test(line)) {
          // Exited section
          insideCriteriaSection = false;
          continue;
        }
      }

      if (line.startsWith('- [ ]') || line.startsWith('- [x]')) {
        criteria.push(line.replace(/^- \[[ x]\]\s*/, ''));
      } else if (insideCriteriaSection && (line.startsWith('-') || line.startsWith('*') || /^\d+\./.test(line))) {
        criteria.push(line.replace(/^[-*]|\d+\.\s*/, '').trim());
      }
    }
  }

  // If no criteria found in description, fallback to subtasks or default
  if (criteria.length === 0) {
    if (subtasks && subtasks.length > 0) {
      for (const sub of subtasks) {
        criteria.push(`Completar e integrar subtarea: ${sub.name}`);
      }
    } else {
      criteria.push(`Implementar funcionalidad según requerimiento de "${taskTitle}"`);
      criteria.push('Validar pruebas unitarias y de integración');
      criteria.push('Revisar documentación y changelog actualizado');
    }
  }

  return criteria;
}

/**
 * Generates the full markdown template for a task
 */
export function generateTaskMarkdown(data: TaskDocData): string {
  const { task, plan, selectedBranch } = data;
  const branchName = selectedBranch || plan.primaryBranchName;
  const timestamp = formatCurrentTimestamp();
  const criteria = extractAcceptanceCriteria(task.description, task.name, task.subtasks || []);

  const criteriaSection = criteria.map((c) => `- [ ] ${c}`).join('\n');

  let subtaskSection = '';
  if (task.subtasks && task.subtasks.length > 0) {
    subtaskSection = `
## Subtareas (Odoo)

${task.subtasks.map((s, i) => `${i + 1}. **#${s.id}** - ${s.name} ${s.stageName ? `*(${s.stageName})*` : ''}`).join('\n')}
`;
  }

  let stackedSection = '';
  if (plan.strategy === 'stacked-branches' && plan.stackedBranches && plan.stackedBranches.length > 0) {
    stackedSection = `
## Plan de Ramas Apiladas (Stacked Branches)

${plan.stackedBranches
  .map(
    (b) =>
      `- **Paso ${b.step}**: \`${b.branchName}\` (${b.description})`
  )
  .join('\n')}
`;
  }

  return `# TASK-${task.id}: ${task.name}

> **Generado automáticamente por MCP Odoo Git Workflow**  
> Fecha de inicio: \`${timestamp}\`

## Metadatos

| Campo | Valor |
|---|---|
| **ID Tarea** | \`TASK-${task.id}\` |
| **Tipo** | \`${plan.type}\` |
| **Estrategia Git** | \`${plan.strategy}\` |
| **Rama Activa** | \`${branchName}\` |
| **Estado Odoo** | \`${task.stage_name || 'En Progreso'}\` |
| **Tags** | ${task.tag_names.length > 0 ? task.tag_names.map((t) => `\`${t}\``).join(', ') : '*Sin etiquetas*'} |
| **Horas Estimadas** | \`${task.planned_hours || 0}h\` |
| **Horas Reales** | \`${task.effective_hours || 0}h\` |

## Descripción / Requerimiento

${task.description || '*Sin descripción provista en Odoo.*'}
${subtaskSection}${stackedSection}
## Criterios de Aceptación

${criteriaSection}

## Changelog

| Fecha | Descripción | Archivos | Commit |
|---|---|---|---|
| ${timestamp} | Scaffold inicial de la tarea y creación de rama | \`.tasks/TASK-${task.id}.md\` | - |
`;
}

/**
 * Initializes or updates the .tasks/TASK-<id>.md document
 */
export function scaffoldTaskDoc(
  data: TaskDocData,
  options: { targetDir?: string; overwrite?: boolean } = {}
): TaskDocScaffoldResult {
  const rootDir = options.targetDir || process.cwd();
  const tasksDir = path.join(rootDir, '.tasks');

  if (!fs.existsSync(tasksDir)) {
    fs.mkdirSync(tasksDir, { recursive: true });
  }

  const fileName = `TASK-${data.task.id}.md`;
  const filePath = path.join(tasksDir, fileName);
  const relativeFilePath = path.join('.tasks', fileName).replace(/\\/g, '/');

  if (fs.existsSync(filePath) && !options.overwrite) {
    const existingContent = fs.readFileSync(filePath, 'utf-8');
    return {
      filePath,
      relativeFilePath,
      created: false,
      content: existingContent,
    };
  }

  const content = generateTaskMarkdown(data);
  fs.writeFileSync(filePath, content, 'utf-8');

  return {
    filePath,
    relativeFilePath,
    created: true,
    content,
  };
}

/**
 * Appends a changelog entry to the table in .tasks/TASK-<id>.md
 */
export function appendChangelogEntry(
  taskId: number | string,
  entry: ChangelogEntry,
  targetDir: string = process.cwd()
): { success: boolean; filePath: string; formattedRow: string } {
  const numericId = typeof taskId === 'string' ? parseInt(taskId.replace(/\D/g, ''), 10) : taskId;
  const filePath = path.join(targetDir, '.tasks', `TASK-${numericId}.md`);

  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Task document "${filePath}" does not exist. Call "scaffold_task" first to initialize it.`
    );
  }

  let content = fs.readFileSync(filePath, 'utf-8');

  const timestamp = entry.date || formatCurrentTimestamp();
  const safeDesc = entry.description.replace(/\|/g, '\\|').trim();
  const filesList =
    entry.files && entry.files.length > 0
      ? entry.files.map((f) => `\`${f}\``).join(', ')
      : '-';
  const commitStr = entry.commit ? `\`${entry.commit.substring(0, 7)}\`` : '-';

  const newRow = `| ${timestamp} | ${safeDesc} | ${filesList} | ${commitStr} |`;

  // Search for the Changelog table in the document
  const changelogHeaderRegex = /(##\s+Changelog[\s\S]*?\|[\s-]+\|[\s-]+\|[\s-]+\|[\s-]+\|)/i;

  if (changelogHeaderRegex.test(content)) {
    // Append at the end of the changelog section
    content = content.trimEnd() + '\n' + newRow + '\n';
  } else {
    // If table not found, append a new Changelog section
    content += `\n\n## Changelog\n\n| Fecha | Descripción | Archivos | Commit |\n|---|---|---|---|\n${newRow}\n`;
  }

  fs.writeFileSync(filePath, content, 'utf-8');

  return {
    success: true,
    filePath,
    formattedRow: newRow,
  };
}
