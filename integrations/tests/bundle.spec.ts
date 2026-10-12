import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { repoRoot, skillScript } from './helpers';

// Node built-ins that could reach the network.
const NETWORK = ['http', 'https', 'http2', 'net', 'tls', 'dgram', 'dns', 'inspector'];
// ...or start another program.
const PROCESS = ['child_process', 'cluster', 'worker_threads'];
const FORBIDDEN = [...NETWORK, ...PROCESS];

export function importedBuiltins(code: string): Set<string> {
  const found = new Set<string>();
  for (const m of code.matchAll(
    /(?:from\s*|import\(\s*|require\(\s*)["'](node:)?([a-z_/0-9]+)["']/g,
  )) {
    found.add(m[2]);
  }
  for (const m of code.matchAll(/["']node:([a-z_/0-9]+)["']/g)) found.add(m[1]);
  return found;
}

describe('skill bundle', () => {
  const code = readFileSync(skillScript, 'utf8');

  it('imports no networking or process modules', () => {
    const builtins = importedBuiltins(code);
    expect(builtins.size).toBeGreaterThan(0);
    for (const name of FORBIDDEN) expect(builtins.has(name)).toBe(false);
  });

  it('does not call fetch or open sockets', () => {
    expect(code).not.toMatch(/\bfetch\s*\(/);
    expect(code).not.toMatch(/\bWebSocket\b/);
  });

  it('names the engine commits it was built from', () => {
    expect(code.split('\n')[1]).toMatch(
      /^\/\/ Engines: agent-readiness-kit@\S+ \([0-9a-f]{40}\), agent-context-doctor@\S+ \([0-9a-f]{40}\)$/,
    );
  });
});

describe('MCP server bundle', () => {
  const dist = path.join(repoRoot, 'integrations/mcp-package/dist');
  const server = readFileSync(path.join(dist, 'server.js'), 'utf8');

  it('imports no networking modules; its only process API is the audit worker spawn', () => {
    const builtins = importedBuiltins(server);
    for (const name of NETWORK) expect(builtins.has(name)).toBe(false);
    expect(builtins.has('child_process')).toBe(true);
    expect(builtins.has('worker_threads')).toBe(false);
  });

  it('starts with a shebang and runs the same worker code the skill ships', () => {
    expect(server.startsWith('#!/usr/bin/env node\n')).toBe(true);
    expect(readFileSync(path.join(dist, 'audit-worker.mjs'), 'utf8')).toBe(
      readFileSync(skillScript, 'utf8'),
    );
  });
});
