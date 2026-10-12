import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOOL_VERSION } from '../src/runtime/version';
import { repoRoot } from './helpers';

const pluginDir = path.join(repoRoot, 'plugins/agent-readiness');

function json<T = Record<string, unknown>>(rel: string): T {
  return JSON.parse(readFileSync(path.join(repoRoot, rel), 'utf8')) as T;
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? [full, ...walk(full)] : [full];
  });
}

const claude = json('plugins/agent-readiness/.claude-plugin/plugin.json');
const cursor = json('plugins/agent-readiness/.cursor-plugin/plugin.json');
const claudeMarket = json<{
  name: string;
  owner: { name: string };
  plugins: Array<{ name: string; source: string }>;
}>('.claude-plugin/marketplace.json');
const cursorMarket = json<{
  name: string;
  owner: { name: string };
  plugins: Array<{ name: string; source: string }>;
}>('.cursor-plugin/marketplace.json');

describe('plugin manifests', () => {
  it('share one kebab-case name and the runtime version', () => {
    for (const m of [claude, cursor]) {
      expect(m.name).toBe('agent-readiness');
      expect(m.version).toBe(TOOL_VERSION);
      expect(m.name).not.toMatch(/^(claude|anthropic)/);
    }
  });

  it('point every component path at a relative location inside the plugin', () => {
    for (const key of ['skills', 'commands', 'logo'] as const) {
      const value = cursor[key] as string;
      expect(value.startsWith('./')).toBe(true);
      expect(value).not.toContain('..');
      expect(existsSync(path.join(pluginDir, value))).toBe(true);
    }
  });

  it('list the plugin in both marketplaces with a relative source', () => {
    for (const market of [claudeMarket, cursorMarket]) {
      expect(market.owner.name).toBeTruthy();
      expect(market.plugins).toHaveLength(1);
      expect(market.plugins[0].name).toBe('agent-readiness');
      expect(market.plugins[0].source).toBe('./plugins/agent-readiness');
    }
  });
});

describe('plugin contents', () => {
  const files = walk(pluginDir);

  it('contain no symlinks, so a cache copy is complete', () => {
    for (const f of files) expect(lstatSync(f).isSymbolicLink()).toBe(false);
  });

  it('start nothing on their own: no hooks, MCP servers, or executables on PATH', () => {
    for (const name of ['hooks', '.mcp.json', 'mcp.json', 'bin', 'monitors', '.lsp.json']) {
      expect(existsSync(path.join(pluginDir, name))).toBe(false);
    }
  });

  it('pre-approve only the bundled audit script', () => {
    const command = readFileSync(path.join(pluginDir, 'commands/audit.md'), 'utf8');
    const allowed = /^allowed-tools: (.*)$/m.exec(command)?.[1];
    expect(allowed).toBe(
      'Bash(node ${CLAUDE_PLUGIN_ROOT}/skills/agent-readiness-audit/scripts/agent-readiness.mjs *)',
    );
    const skill = readFileSync(
      path.join(pluginDir, 'skills/agent-readiness-audit/SKILL.md'),
      'utf8',
    );
    expect(/^allowed-tools: (.*)$/m.exec(skill)?.[1]).toBe(
      'Bash(node ${CLAUDE_SKILL_DIR}/scripts/agent-readiness.mjs *)',
    );
  });

  it('ship the license with the plugin', () => {
    expect(readFileSync(path.join(pluginDir, 'LICENSE'), 'utf8')).toBe(
      readFileSync(path.join(repoRoot, 'LICENSE'), 'utf8'),
    );
  });
});
