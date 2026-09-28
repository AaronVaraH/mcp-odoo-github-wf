import { z } from 'zod';
import { OdooClient, normalizeOdooUrl } from '../odoo/client.js';
import { GitManager } from '../git/operations.js';

export const validateEnvironmentSchema = {
  customOdooUrl: z
    .string()
    .optional()
    .describe('Optional Odoo URL to test (e.g. "https://erp.thenoro.com/odoo")'),
  customDb: z
    .string()
    .optional()
    .describe('Optional Odoo Database name to test'),
  customUser: z
    .string()
    .optional()
    .describe('Optional Odoo login user/email to test'),
  customApiKey: z
    .string()
    .optional()
    .describe('Optional Odoo API Key to test'),
  targetDir: z
    .string()
    .optional()
    .describe('Project working directory for Git repository check (defaults to current working directory)'),
};

export async function handleValidateEnvironment(args: {
  customOdooUrl?: string;
  customDb?: string;
  customUser?: string;
  customApiKey?: string;
  targetDir?: string;
}) {
  const targetDir = args.targetDir || process.cwd();

  // 1. Test Odoo Connection
  const odooClient = new OdooClient({
    url: args.customOdooUrl,
    db: args.customDb,
    user: args.customUser,
    apiKey: args.customApiKey,
  });

  const odooTest = await odooClient.testConnection();

  // 2. Test Local Git Environment
  const gitManager = new GitManager(targetDir);
  const gitEnv = await gitManager.getEnvironmentDetails();

  // 3. Synthesize Status & Recommendations
  const issues: string[] = [];
  const recommendations: string[] = [];

  if (!odooTest.connected) {
    issues.push(`Odoo: No se pudo conectar al servidor "${odooTest.url || 'No definida'}". Error: ${odooTest.error}`);
    recommendations.push(
      'Revisa que ODOO_URL apunte a tu servidor (ej. https://erp.thenoro.com) y que el servidor esté accesible.'
    );
  } else if (odooTest.error) {
    issues.push(`Odoo: ${odooTest.error}`);
    recommendations.push(
      'Genera una clave de API en Odoo: entra a tu Perfil -> Seguridad de la cuenta -> "Nueva clave de API" y configúrala en ODOO_API_KEY.'
    );
  }

  if (!gitEnv.isRepo) {
    issues.push(`Git: El directorio "${targetDir}" no es un repositorio Git.`);
    recommendations.push('Ejecuta "git init" para inicializar el repositorio antes de crear ramas.');
  }

  const isReady = issues.length === 0;

  return {
    status: isReady ? 'ready' : 'needs_attention',
    summary: isReady
      ? '¡Entorno 100% verificado y listo para trabajar!'
      : 'Se detectaron requerimientos de configuración pendientes.',
    odoo: {
      connected: odooTest.connected,
      url: odooTest.url,
      database: odooTest.db || 'No configurada',
      serverVersion: odooTest.serverVersion || 'N/A',
      authenticatedUser: odooTest.user
        ? {
            id: odooTest.user.id,
            name: odooTest.user.name,
            login: odooTest.user.login,
          }
        : null,
    },
    git: {
      isRepository: gitEnv.isRepo,
      currentBranch: gitEnv.currentBranch || 'N/A',
      gitUser: gitEnv.gitUserName ? `${gitEnv.gitUserName} <${gitEnv.gitUserEmail || ''}>` : 'No configurado',
      remoteOrigin: gitEnv.remoteOriginUrl || 'Sin remoto configurado',
      workingTreeClean: gitEnv.isClean ?? false,
    },
    issues: issues.length > 0 ? issues : undefined,
    recommendations: recommendations.length > 0 ? recommendations : undefined,
    helpTutorial: 'Consulta TUTORIAL.md para la guía completa paso a paso de configuración de Odoo.',
  };
}
