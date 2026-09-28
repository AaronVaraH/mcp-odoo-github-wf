import xmlrpc from 'xmlrpc';
import dotenv from 'dotenv';
import { OdooTaskClean, OdooClientConfig, OdooSubtask, OdooTaskSummary, OdooListTasksOptions } from './types.js';

dotenv.config();

/**
 * Normalizes Odoo instance URL to its root origin (e.g. "https://erp.example.com/odoo" -> "https://erp.example.com")
 */
export function normalizeOdooUrl(rawUrl?: string): string {
  if (!rawUrl) return '';
  const trimmed = rawUrl.trim();
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withProtocol);
    return parsed.origin;
  } catch {
    return trimmed.replace(/\/+$/, '');
  }
}

/**
 * Strips HTML tags and formats HTML from Odoo description into readable plain text/markdown
 */
export function htmlToPlainText(html: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export class OdooClient {
  private config: OdooClientConfig;

  constructor(customConfig?: Partial<OdooClientConfig>) {
    const rawUrl = customConfig?.url || process.env.ODOO_URL;
    const url = normalizeOdooUrl(rawUrl);
    const db = customConfig?.db || process.env.ODOO_DB;
    const apiKey = customConfig?.apiKey || process.env.ODOO_API_KEY || process.env.ODOO_PASSWORD;
    const user = customConfig?.user || process.env.ODOO_USER || process.env.ODOO_USERNAME;
    
    let uid = customConfig?.uid;
    if (uid === undefined && process.env.ODOO_UID) {
      const parsedUid = parseInt(process.env.ODOO_UID, 10);
      if (!isNaN(parsedUid)) {
        uid = parsedUid;
      }
    }

    this.config = { url, db, uid, user, apiKey };
  }

  public getConfig(): Readonly<OdooClientConfig> {
    return { ...this.config };
  }

  private getXmlRpcClient(endpointPath: string): xmlrpc.Client {
    if (!this.config.url) {
      throw new Error(
        'ODOO_URL no está configurada. Por favor establece ODOO_URL (ej. https://erp.thenoro.com o https://mi-empresa.odoo.com).'
      );
    }

    const cleanOrigin = normalizeOdooUrl(this.config.url);
    const urlObj = new URL(`${cleanOrigin}${endpointPath}`);
    const isHttps = urlObj.protocol === 'https:';

    const clientOptions = {
      host: urlObj.hostname,
      port: urlObj.port ? parseInt(urlObj.port, 10) : (isHttps ? 443 : 80),
      path: urlObj.pathname,
    };

    return isHttps
      ? xmlrpc.createSecureClient(clientOptions)
      : xmlrpc.createClient(clientOptions);
  }

  private callXmlRpc<T>(client: xmlrpc.Client, method: string, params: any[]): Promise<T> {
    return new Promise((resolve, reject) => {
      client.methodCall(method, params, (err, value) => {
        if (err) {
          return reject(err);
        }
        resolve(value as T);
      });
    });
  }

  /**
   * Fetches Odoo server version info from /xmlrpc/2/common
   */
  public async getServerVersion(): Promise<any> {
    const commonClient = this.getXmlRpcClient('/xmlrpc/2/common');
    return this.callXmlRpc<any>(commonClient, 'version', []);
  }

  /**
   * Resolves UID if not provided, using common.authenticate
   */
  public async getUid(): Promise<number> {
    if (this.config.uid !== undefined && this.config.uid !== null) {
      return this.config.uid;
    }

    if (!this.config.user || !this.config.apiKey || !this.config.db) {
      throw new Error(
        'Credenciales de Odoo incompletas. Se requiere ODOO_UID o bien (ODOO_USER y ODOO_API_KEY) junto con ODOO_DB y ODOO_URL.'
      );
    }

    const commonClient = this.getXmlRpcClient('/xmlrpc/2/common');
    const uid = await this.callXmlRpc<number | false>(commonClient, 'authenticate', [
      this.config.db,
      this.config.user,
      this.config.apiKey,
      {},
    ]);

    if (!uid || typeof uid !== 'number') {
      throw new Error(
        `Error de autenticación en Odoo para el usuario "${this.config.user}" en la base de datos "${this.config.db}". Verifica tu API Key y nombre de DB.`
      );
    }

    this.config.uid = uid;
    return uid;
  }

  /**
   * Tests the connection, retrieves server version, and user profile information
   */
  public async testConnection(): Promise<{
    connected: boolean;
    url: string;
    db?: string;
    serverVersion?: string;
    user?: { id: number; name: string; login: string; email?: string };
    error?: string;
  }> {
    try {
      const versionInfo = await this.getServerVersion();
      const serverVersion = versionInfo?.server_serie || versionInfo?.server_version || 'Desconocida';

      if (!this.config.db || (!this.config.uid && !this.config.user) || !this.config.apiKey) {
        return {
          connected: true,
          url: this.config.url || '',
          db: this.config.db,
          serverVersion,
          error: 'Servidor alcanzable, pero faltan credenciales (ODOO_DB, ODOO_USER/ODOO_UID o ODOO_API_KEY).',
        };
      }

      const uid = await this.getUid();
      const userRecords = await this.executeKw<any[]>('res.users', 'read', [[uid]], {
        fields: ['id', 'name', 'login', 'email'],
      });

      const user = userRecords && userRecords[0] ? userRecords[0] : { id: uid, name: 'Usuario', login: '' };

      return {
        connected: true,
        url: this.config.url || '',
        db: this.config.db,
        serverVersion,
        user: {
          id: user.id,
          name: user.name,
          login: user.login,
          email: user.email,
        },
      };
    } catch (err: any) {
      return {
        connected: false,
        url: this.config.url || '',
        db: this.config.db,
        error: err?.message || String(err),
      };
    }
  }

  /**
   * Calls execute_kw on the object endpoint
   */
  public async executeKw<T>(
    model: string,
    method: string,
    args: any[],
    kwargs: Record<string, any> = {}
  ): Promise<T> {
    const uid = await this.getUid();
    const objectClient = this.getXmlRpcClient('/xmlrpc/2/object');

    if (!this.config.db || !this.config.apiKey) {
      throw new Error('Las variables ODOO_DB y ODOO_API_KEY son obligatorias.');
    }

    return this.callXmlRpc<T>(objectClient, 'execute_kw', [
      this.config.db,
      uid,
      this.config.apiKey,
      model,
      method,
      args,
      kwargs,
    ]);
  }

  private taskHoursField: string | null = null;

  /**
   * Resolves whether this Odoo instance uses 'allocated_hours' (Odoo 17+) or 'planned_hours' (Odoo 14-16)
   */
  public async getTaskHoursField(): Promise<string> {
    if (this.taskHoursField) return this.taskHoursField;
    try {
      const ver = await this.getServerVersion();
      const major = Array.isArray(ver?.server_version_info) ? ver.server_version_info[0] : 14;
      this.taskHoursField = major >= 17 ? 'allocated_hours' : 'planned_hours';
    } catch {
      this.taskHoursField = 'allocated_hours';
    }
    return this.taskHoursField;
  }

  /**
   * Fetches and cleans a task from project.task by its numeric ID
   */
  public async getTask(taskId: number | string): Promise<OdooTaskClean> {
    const numericId = typeof taskId === 'string' ? parseInt(taskId.replace(/\D/g, ''), 10) : taskId;
    if (isNaN(numericId) || numericId <= 0) {
      throw new Error(`ID de tarea de Odoo inválido: "${taskId}". Debe ser un número positivo.`);
    }

    const hoursField = await this.getTaskHoursField();
    const fields = [
      'id',
      'name',
      'description',
      'tag_ids',
      'child_ids',
      'parent_id',
      hoursField,
      'effective_hours',
      'stage_id',
      'priority',
      'user_ids',
    ];

    const records = await this.executeKw<any[]>('project.task', 'read', [[numericId]], { fields });

    if (!records || records.length === 0) {
      throw new Error(`No se encontró ninguna tarea en Odoo con el ID ${numericId}.`);
    }

    const record = records[0];

    // Fetch tag names if present
    const tagIds: number[] = Array.isArray(record.tag_ids) ? record.tag_ids : [];
    let tagNames: string[] = [];

    if (tagIds.length > 0) {
      try {
        const tagRecords = await this.executeKw<any[]>('project.tags', 'read', [tagIds], {
          fields: ['id', 'name'],
        });
        tagNames = tagRecords.map((t) => t.name).filter(Boolean);
      } catch {
        tagNames = [];
      }
    }

    // Fetch subtasks (child_ids) if present
    const childIds: number[] = Array.isArray(record.child_ids) ? record.child_ids : [];
    const subtasks: OdooSubtask[] = [];

    if (childIds.length > 0) {
      try {
        const subtaskRecords = await this.executeKw<any[]>('project.task', 'read', [childIds], {
          fields: ['id', 'name', 'stage_id'],
        });
        for (const sub of subtaskRecords) {
          subtasks.push({
            id: sub.id,
            name: sub.name,
            stageName: Array.isArray(sub.stage_id) ? sub.stage_id[1] : undefined,
          });
        }
      } catch {
        // Fallback
      }
    }

    // Parse parent_id
    let parentIdInfo = null;
    if (Array.isArray(record.parent_id) && record.parent_id.length >= 2) {
      parentIdInfo = {
        id: record.parent_id[0],
        name: record.parent_id[1],
      };
    }

    const descriptionHtml = record.description || '';
    const cleanDescription = htmlToPlainText(descriptionHtml);

    return {
      id: record.id,
      name: record.name,
      description: cleanDescription,
      descriptionHtml,
      tag_ids: tagIds,
      tag_names: tagNames,
      child_ids: childIds,
      subtasks,
      parent_id: parentIdInfo,
      planned_hours: (hoursField && record[hoursField]) || record.allocated_hours || record.planned_hours || 0,
      effective_hours: record.effective_hours || 0,
      stage_id: Array.isArray(record.stage_id) ? record.stage_id : null,
      stage_name: Array.isArray(record.stage_id) ? record.stage_id[1] : undefined,
      priority: record.priority,
    };
  }

  /**
   * Searches and lists tasks in Odoo matching query/filters (Read-only)
   */
  public async listTasks(options: OdooListTasksOptions = {}): Promise<OdooTaskSummary[]> {
    const domain: any[] = [];

    if (options.assignedToMe) {
      const uid = await this.getUid();
      domain.push(['user_ids', 'in', [uid]]);
    }

    if (options.projectId) {
      domain.push(['project_id', '=', options.projectId]);
    }

    if (options.query) {
      const q = options.query.trim();
      domain.push(['name', 'ilike', q]);
    }

    if (options.stageName) {
      domain.push(['stage_id.name', 'ilike', options.stageName.trim()]);
    }

    const limit = options.limit && options.limit > 0 ? Math.min(options.limit, 50) : 15;
    const hoursField = await this.getTaskHoursField();

    const fields = [
      'id',
      'name',
      'stage_id',
      hoursField,
      'effective_hours',
      'priority',
      'tag_ids',
      'user_ids',
      'parent_id',
    ];

    const records = await this.executeKw<any[]>('project.task', 'search_read', [domain], {
      fields,
      limit,
      order: 'id desc',
    });

    if (!records || records.length === 0) {
      return [];
    }

    // Collect all tag IDs to fetch names in one bulk request
    const allTagIds = Array.from(
      new Set(
        records.flatMap((r) => (Array.isArray(r.tag_ids) ? r.tag_ids : []))
      )
    );

    const tagMap = new Map<number, string>();
    if (allTagIds.length > 0) {
      try {
        const tagRecords = await this.executeKw<any[]>('project.tags', 'read', [allTagIds], {
          fields: ['id', 'name'],
        });
        for (const t of tagRecords) {
          tagMap.set(t.id, t.name);
        }
      } catch {
        // Fallback if tags model is not accessible
      }
    }

    return records.map((r) => {
      const rawTagIds: number[] = Array.isArray(r.tag_ids) ? r.tag_ids : [];
      const tagNames = rawTagIds.map((id) => tagMap.get(id)).filter(Boolean) as string[];

      return {
        id: r.id,
        name: r.name,
        stage_id: Array.isArray(r.stage_id) ? r.stage_id : null,
        stage_name: Array.isArray(r.stage_id) ? r.stage_id[1] : undefined,
        planned_hours: (hoursField && r[hoursField]) || r.allocated_hours || r.planned_hours || 0,
        effective_hours: r.effective_hours || 0,
        priority: r.priority,
        tag_names: tagNames,
        parent_id: Array.isArray(r.parent_id) ? r.parent_id : null,
      };
    });
  }
}
