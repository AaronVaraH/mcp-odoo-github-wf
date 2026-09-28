#!/usr/bin/env node

import dotenv from 'dotenv';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerAllTools } from './tools/index.js';

// Load environment variables (.env file if present)
dotenv.config();

async function main() {
  const server = new McpServer({
    name: 'mcp-odoo-git-workflow',
    version: '1.0.0',
  });

  // Register all workflow tools
  registerAllTools(server);

  // Setup stdio transport
  const transport = new StdioServerTransport();

  process.on('SIGINT', async () => {
    await server.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await server.close();
    process.exit(0);
  });

  await server.connect(transport);
  console.error('[mcp-odoo-git-workflow] MCP Server started and listening via stdio.');
}

main().catch((error) => {
  console.error('[mcp-odoo-git-workflow] Fatal server error:', error);
  process.exit(1);
});
