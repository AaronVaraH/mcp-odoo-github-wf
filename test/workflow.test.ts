import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { determineGitStrategy, slugify } from '../src/git/strategy.js';
import { scaffoldTaskDoc, appendChangelogEntry } from '../src/docs/generator.js';
import { handleSyncOdooTask } from '../src/tools/syncTask.js';
import { handleScaffoldTask } from '../src/tools/scaffoldTask.js';
import { handleLogTaskChange } from '../src/tools/logChange.js';
import { handleListOdooTasks } from '../src/tools/listTasks.js';
import { handleCreatePullRequest } from '../src/tools/createPullRequest.js';
import { handleEvidenceSummary } from '../src/tools/evidenceSummary.js';

async function runTests() {
  console.log('--- Running Tests for mcp-odoo-git-workflow ---');

  // Test 1: Slugify
  console.log('Test 1: Slugify helper');
  assert.strictEqual(slugify('¡Arreglar Error en Login!'), 'arreglar-error-en-login');
  assert.strictEqual(slugify('Crear módulo de facturación electrónica'), 'crear-modulo-de-facturacion-electronica');

  // Test 2: Git Strategy - Single Bug Fix
  console.log('Test 2: Git Strategy - Bug fix detection');
  const bugTask: any = {
    id: 101,
    name: 'Fix timeout in checkout payment',
    description: 'Payment gateway throws timeout error',
    tag_names: ['bug', 'urgent'],
    child_ids: [],
    subtasks: [],
    planned_hours: 3,
  };
  const bugPlan = determineGitStrategy(bugTask);
  assert.strictEqual(bugPlan.type, 'fix');
  assert.strictEqual(bugPlan.strategy, 'feature-branch');
  assert.strictEqual(bugPlan.primaryBranchName, 'fix/TASK-101-fix-timeout-in-checkout-payment');

  // Test 3: Git Strategy - Stacked branches via subtasks
  console.log('Test 3: Git Strategy - Stacked branches with subtasks');
  const featureWithSubtasks: any = {
    id: 202,
    name: 'Implement User Subscription Tier',
    description: 'Add gold and platinum tiers',
    tag_names: ['feature'],
    child_ids: [203, 204],
    subtasks: [
      { id: 203, name: 'Database schema migration' },
      { id: 204, name: 'Stripe API integration' },
    ],
    planned_hours: 6,
  };
  const stackedPlan = determineGitStrategy(featureWithSubtasks);
  assert.strictEqual(stackedPlan.type, 'feat');
  assert.strictEqual(stackedPlan.strategy, 'stacked-branches');
  assert.strictEqual(stackedPlan.suggestedBranches.length, 2);
  assert.strictEqual(
    stackedPlan.suggestedBranches[0],
    'feat/TASK-202-implement-user-subscription-tier/01-database-schema-migration'
  );
  assert.strictEqual(
    stackedPlan.suggestedBranches[1],
    'feat/TASK-202-implement-user-subscription-tier/02-stripe-api-integration'
  );

  // Test 4: Git Strategy - Stacked branches via high estimation
  console.log('Test 4: Git Strategy - Stacked branches via hours estimation');
  const highEstimateTask: any = {
    id: 303,
    name: 'Overhaul Reporting Engine',
    description: 'Complex rewrite of reports',
    tag_names: ['core'],
    child_ids: [],
    subtasks: [],
    planned_hours: 16,
  };
  const highPlan = determineGitStrategy(highEstimateTask);
  assert.strictEqual(highPlan.strategy, 'stacked-branches');
  assert.strictEqual(highPlan.suggestedBranches.length, 3);
  assert(highPlan.suggestedBranches[0].endsWith('/01-db'));

  // Test 5: Tool sync_odoo_task handler
  console.log('Test 5: handleSyncOdooTask with mock data');
  const syncResult = await handleSyncOdooTask({
    taskId: 404,
    mockTaskData: {
      id: 404,
      name: 'Refactor Auth middleware',
      description: 'Criterios de Aceptación:\n- [ ] JWT tokens validados\n- [ ] Expiración en 15m',
      tag_names: ['refactor'],
      child_ids: [],
      planned_hours: 4,
    },
  });
  assert.strictEqual(syncResult.success, true);
  assert.strictEqual(syncResult.plan.branchType, 'feat');
  assert.strictEqual(syncResult.plan.strategy, 'feature-branch');

  // Test 6: Tool scaffold_task & log_task_change in a test directory
  console.log('Test 6: handleScaffoldTask & handleLogTaskChange');
  const tempTestDir = path.join(process.cwd(), '.test-scaffold-tmp');
  if (fs.existsSync(tempTestDir)) {
    fs.rmSync(tempTestDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tempTestDir, { recursive: true });

  try {
    const scaffoldRes = await handleScaffoldTask({
      taskId: 505,
      createGitBranch: false, // Don't switch git branches during automated unit test
      targetDir: tempTestDir,
      mockTaskData: {
        id: 505,
        name: 'Add Multi-currency support',
        description: 'Criterios de Aceptación:\n- Soporte para USD y EUR\n- Tasa de cambio diaria',
        tag_names: ['finance'],
        child_ids: [],
        planned_hours: 5,
      },
    });

    assert.strictEqual(scaffoldRes.success, true);
    assert(fs.existsSync(path.join(tempTestDir, '.tasks', 'TASK-505.md')));
    const initialContent = fs.readFileSync(path.join(tempTestDir, '.tasks', 'TASK-505.md'), 'utf-8');
    assert(initialContent.includes('TASK-505: Add Multi-currency support'));
    assert(initialContent.includes('Criterios de Aceptación'));

    // Test 7: Log change
    const logRes = await handleLogTaskChange({
      taskId: 505,
      description: 'Implement currency conversion helper',
      files: ['src/currency.ts', 'src/types.ts'],
      commit: 'abc1234',
      targetDir: tempTestDir,
    });

    assert.strictEqual(logRes.success, true);
    const updatedContent = fs.readFileSync(path.join(tempTestDir, '.tasks', 'TASK-505.md'), 'utf-8');
    assert(updatedContent.includes('Implement currency conversion helper'));
    assert(updatedContent.includes('`abc1234`'));
    assert(updatedContent.includes('`src/currency.ts`'));
    // Test 8: URL normalization
    console.log('Test 8: normalizeOdooUrl helper');
    const { normalizeOdooUrl } = await import('../src/odoo/client.js');
    assert.strictEqual(normalizeOdooUrl('https://erp.thenoro.com/odoo'), 'https://erp.thenoro.com');
    assert.strictEqual(normalizeOdooUrl('https://erp.thenoro.com/web#action=123'), 'https://erp.thenoro.com');
    assert.strictEqual(normalizeOdooUrl('erp.thenoro.com/odoo/'), 'https://erp.thenoro.com');

    // Test 9: Tool validate_environment
    console.log('Test 9: handleValidateEnvironment');
    const { handleValidateEnvironment } = await import('../src/tools/validateEnv.js');
    const envCheck = await handleValidateEnvironment({ targetDir: process.cwd() });
    assert.strictEqual(typeof envCheck.status, 'string');
    assert.strictEqual(envCheck.git.isRepository, true);
    assert(envCheck.git.currentBranch.length > 0);

    // Test 10: Tool list_odoo_tasks
    console.log('Test 10: handleListOdooTasks with search query');
    const listRes = await handleListOdooTasks({
      query: 'invoice',
      mockTasks: [
        { id: 601, name: 'Fix invoice rounding bug', planned_hours: 2 },
        { id: 602, name: 'Setup payroll gateway', planned_hours: 8 },
        { id: 603, name: 'Customer invoice PDF template', planned_hours: 4 },
      ],
    });
    assert.strictEqual(listRes.success, true);
    assert.strictEqual(listRes.count, 2);
    assert.strictEqual(listRes.tasks[0].id, 601);

    // Test 11: Tool create_github_pr - Authorization Guard (confirmedByUser: false)
    console.log('Test 11: create_github_pr authorization guard');
    const prGuardRes = await handleCreatePullRequest({
      taskId: 505,
      confirmedByUser: false,
      targetDir: tempTestDir,
      baseBranch: 'main',
      headBranch: 'feat/TASK-505-multi-currency',
    });
    assert.strictEqual(prGuardRes.success, false);
    assert.strictEqual(prGuardRes.status, 'CONFIRMATION_REQUIRED');
    assert(prGuardRes.message.includes('AUTORIZACIÓN REQUERIDA'));
    assert(prGuardRes.preview !== undefined);
    assert(prGuardRes.preview?.title.includes('feat(TASK-505)'));
    assert(prGuardRes.preview?.body.includes('Criterios de Aceptación'));

    // Test 12: Tool create_github_pr - Execution with confirmation (confirmedByUser: true)
    console.log('Test 12: create_github_pr execution with confirmation');
    const prExecRes = await handleCreatePullRequest({
      taskId: 505,
      confirmedByUser: true,
      targetDir: tempTestDir,
      baseBranch: 'main',
      headBranch: 'feat/TASK-505-multi-currency',
      mockMode: true,
    });
    assert.strictEqual(prExecRes.success, true);
    assert.strictEqual(prExecRes.status, 'CREATED');
    assert(prExecRes.prUrl?.includes('pull/505'));

    // Test 13: Tool get_task_evidence_summary
    console.log('Test 13: handleEvidenceSummary generation');
    const evidenceRes = await handleEvidenceSummary({
      taskId: 505,
      prUrl: 'https://github.com/my-org/my-repo/pull/505',
      targetDir: tempTestDir,
    });
    assert.strictEqual(evidenceRes.success, true);
    assert.strictEqual(evidenceRes.taskId, 505);
    assert(evidenceRes.evidenceMarkdown.includes('Evidencia de Entrega - TASK-505'));
    assert(evidenceRes.evidenceMarkdown.includes('https://github.com/my-org/my-repo/pull/505'));
    assert(evidenceRes.evidenceMarkdown.includes('Criterios Completados'));
  } finally {
    // Cleanup
    fs.rmSync(tempTestDir, { recursive: true, force: true });
  }

  console.log('All tests passed successfully! ✅');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
