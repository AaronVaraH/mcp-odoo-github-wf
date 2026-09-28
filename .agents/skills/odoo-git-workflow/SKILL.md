---
name: odoo-git-workflow
description: Orquesta el ciclo de vida de desarrollo de software guiado por tareas de Odoo, ramas Git (feat/fix/stacked), documentación estructurada (.tasks/TASK-<id>.md) y Pull Requests en GitHub con autorización del usuario.
---

# Odoo Git Workflow Skill

Esta skill guía al agente de IA a seguir un flujo de desarrollo riguroso, trazable y automatizado conectando las tareas de Odoo (`project.task`) en modo **Read-Only** con el repositorio Git local y GitHub (requiriendo autorización explícita para operaciones CRUD).

## Herramientas MCP Disponibles

1. `validate_environment`:
   - Verifica la conexión a Odoo (autenticación XML-RPC, versión del servidor y usuario activo) y el estado del repositorio Git local y GitHub origin.
2. `list_odoo_tasks`:
   - Busca y lista tareas en Odoo (Read-Only) asignadas al usuario activo o filtradas por término, etapa (`stageName`) o proyecto (`projectId`).
3. `sync_odoo_task`:
   - Lee la tarea en Odoo vía XML-RPC (Read-Only).
   - Devuelve metadatos, tags, subtareas y calcula la estrategia de ramificación Git (`feat/` o `fix/`, `feature-branch` o `stacked-branches`).
4. `scaffold_task`:
   - Crea y hace checkout del branch Git local.
   - Genera la plantilla de documentación en `.tasks/TASK-<id>.md` con criterios de aceptación y tabla de changelog.
5. `log_task_change`:
   - Agrega automáticamente una fila con timestamp al Changelog de `.tasks/TASK-<id>.md` tras cada commit o refactor importante.
6. `create_github_pr`:
   - Prepara o abre un Pull Request en GitHub con la documentación de `.tasks/TASK-<id>.md`.
   - **SEGURIDAD**: Requiere `confirmedByUser: true` para ejecutar la creación; si es `false`, devuelve una vista previa completa para que el usuario la apruebe.
7. `get_task_evidence_summary`:
   - Genera un resumen de evidencia de entrega en formato Markdown, listo para pegar en el Chatter de Odoo o enviar a QA.

---

## Procedimiento Paso a Paso para el Agente

### Paso 1: Identificar o Buscar la Tarea en Odoo
Antes de escribir cualquier línea de código:
- Si el usuario no conoce el ID numérico, consulta sus tareas activas con:
  ```json
  {
    "tool": "list_odoo_tasks",
    "args": { "assignedToMe": true }
  }
  ```
- O busca por palabra clave:
  ```json
  {
    "tool": "list_odoo_tasks",
    "args": { "query": "facturacion", "assignedToMe": false }
  }
  ```
- Una vez seleccionado el ID, sincroniza la tarea:
  ```json
  {
    "tool": "sync_odoo_task",
    "args": { "taskId": 123 }
  }
  ```
- Revisa el plan devuelto:
  - Tipo: `feat` (característica) o `fix` (corrección de bug).
  - Estrategia: `feature-branch` (rama única) o `stacked-branches` (ramas apiladas por subtareas o capas arquitectónicas).

### Paso 2: Inicializar Rama y Documentación (Scaffolding)
Invoca la herramienta `scaffold_task`:
```json
{
  "tool": "scaffold_task",
  "args": {
    "taskId": 123
  }
}
```
- Esto garantiza que:
  1. La rama de trabajo esté creada y activa en Git.
  2. Exista `.tasks/TASK-123.md` con los criterios de aceptación y metadatos.
- Abre o revisa `.tasks/TASK-123.md` para familiarizarte con los criterios de aceptación específicos.

### Paso 3: Ciclo de Desarrollo y Registro de Cambios
A medida que implementes el código:
- Realiza cambios modulares y commits limpios.
- Tras cada commit o modificación de archivos relevante, registra el progreso en la tarea:
  ```json
  {
    "tool": "log_task_change",
    "args": {
      "taskId": 123,
      "description": "Implementar validación de esquema en endpoint de pagos",
      "files": ["src/api/payments.ts"]
    }
  }
  ```

### Paso 4: Finalización y Creación de Pull Request (Con Autorización)
1. Marca como cumplidos los criterios de aceptación en `.tasks/TASK-123.md` (`- [x]`).
2. Sube tus cambios a GitHub (`git push -u origin <branch>`).
3. Solicita una **vista previa** del Pull Request:
   ```json
   {
     "tool": "create_github_pr",
     "args": {
       "taskId": 123,
       "confirmedByUser": false
     }
   }
   ```
4. **Pregunta explícitamente al usuario**:
   > *"He preparado el Pull Request para TASK-123 apuntando a `main`. ¿Deseas que lo abra en GitHub?"*
5. Una vez que el usuario confirme, ejecuta:
   ```json
   {
     "tool": "create_github_pr",
     "args": {
       "taskId": 123,
       "confirmedByUser": true
     }
   }
   ```

### Paso 5: Generación de Evidencias para Odoo
Genera el informe final para que el equipo de QA o el Project Manager valide el trabajo en Odoo:
```json
{
  "tool": "get_task_evidence_summary",
  "args": {
    "taskId": 123,
    "prUrl": "https://github.com/org/repo/pull/12"
  }
}
```
Presenta el resumen Markdown al usuario para que lo copie en el Chatter de la tarea de Odoo.
