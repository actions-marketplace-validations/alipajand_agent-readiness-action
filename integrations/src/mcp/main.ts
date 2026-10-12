import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { toAuditError } from '../runtime/errors.js';
import { unsupportedNode } from '../runtime/nodeVersion.js';
import { TOOL_VERSION } from '../runtime/version.js';
import { createServer, parseConfig, USAGE, type ServerConfig } from './server.js';
import { supportsPermissionModel } from './worker.js';

async function main(): Promise<void> {
  const runtimeProblem = unsupportedNode();
  if (runtimeProblem) {
    process.stderr.write(`${runtimeProblem}\n`);
    process.exit(1);
  }
  // Audits run in a worker confined by Node's permission model. Without it
  // the server does not start, rather than audit unconfined.
  if (!supportsPermissionModel()) {
    process.stderr.write(
      `The agent-readiness MCP server needs Node.js 22.13 or later (23.5 or later on Node.js 23) for its read-only audit sandbox; this is Node.js ${process.versions.node}.\n`,
    );
    process.exit(1);
  }
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    process.stderr.write(USAGE);
    return;
  }
  let config: ServerConfig;
  try {
    // Built at run time so the bundler does not relocate the worker as an asset;
    // the build copies it next to this file.
    const workerName = ['audit-worker', 'mjs'].join('.');
    const workerPath = path.join(path.dirname(fileURLToPath(import.meta.url)), workerName);
    if (!existsSync(workerPath)) {
      process.stderr.write(
        `The installation is incomplete: ${workerPath} is missing. Reinstall @alipajand/agent-readiness-mcp.\n`,
      );
      process.exit(1);
    }
    config = await parseConfig(process.argv.slice(2), process.cwd(), workerPath);
  } catch (err) {
    process.stderr.write(`${toAuditError(err).message}\n\n${USAGE}`);
    process.exit(2);
  }
  const server = createServer(config);
  await server.connect(new StdioServerTransport());
  // Diagnostics go to stderr; stdout carries only protocol messages.
  process.stderr.write(
    `agent-readiness MCP server ${TOOL_VERSION} ready; roots: ${config.roots.join(', ')}\n`,
  );
}

main().catch((err: unknown) => {
  process.stderr.write(`agent-readiness MCP server failed: ${toAuditError(err).message}\n`);
  process.exit(1);
});
