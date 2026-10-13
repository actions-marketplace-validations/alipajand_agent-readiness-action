import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';
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

  it("validate against Cursor's published plugin and marketplace schemas", () => {
    // Snapshots of schemas/plugin.schema.json and schemas/marketplace.schema.json from
    // github.com/cursor/plugins at fe53d9e. Cursor's schema allows only `name` and `email` in
    // `author`; an extra `url` made the 0.1.1 manifest invalid there.
    const ajv = new Ajv({ strict: false, validateFormats: false });
    for (const [schema, manifest] of [
      ['cursor-plugin.schema.json', cursor],
      ['cursor-marketplace.schema.json', cursorMarket],
    ] as const) {
      const validate = ajv.compile(
        JSON.parse(readFileSync(path.join(import.meta.dirname, 'schemas', schema), 'utf8')),
      );
      expect(validate(manifest), JSON.stringify(validate.errors)).toBe(true);
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
    // Only the script is pre-approved: a command that sent the model to the skill made it call the
    // Skill tool, which Claude Code denied in a headless session and would prompt for otherwise.
    expect(command).not.toMatch(/`agent-readiness-audit` skill|\bSkill\b/);
    const skill = readFileSync(
      path.join(pluginDir, 'skills/agent-readiness-audit/SKILL.md'),
      'utf8',
    );
    expect(/^allowed-tools: (.*)$/m.exec(skill)?.[1]).toBe(
      'Bash(node ${CLAUDE_SKILL_DIR}/scripts/agent-readiness.mjs *)',
    );
    // Claude Code substitutes the variable before the model reads the skill, so this command has
    // exactly the pre-approved form. With only a `<skill-dir>` placeholder, the model quoted the
    // script path or chained it after `node --version`, and Claude Code asked for approval.
    expect(skill).toContain(
      "node ${CLAUDE_SKILL_DIR}/scripts/agent-readiness.mjs audit --format json -- '<repository-path>'",
    );
  });

  it('stop instead of improvising when the audit script cannot run', () => {
    // A denied or failed script call must not turn into scores or a manual review of the files.
    const command = readFileSync(path.join(pluginDir, 'commands/audit.md'), 'utf8');
    expect(command).toContain('tell me the audit did not run and why');
    expect(command).toContain('do not inspect the files yourself instead');
    const skill = readFileSync(
      path.join(pluginDir, 'skills/agent-readiness-audit/SKILL.md'),
      'utf8',
    );
    expect(skill).toContain('tell the user the audit did not run and why');
    expect(skill).toContain('do not replace the audit with your own reading of the files');
  });

  it('give the Cursor command a name, a description, and a fail-closed rule', () => {
    const text = readFileSync(
      path.join(pluginDir, 'cursor-commands/agent-readiness-audit.md'),
      'utf8',
    );
    const front = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? '';
    expect(front).toMatch(/^name: agent-readiness-audit$/m);
    expect(front).toMatch(/^description: \S.+$/m);
    // Without this rule, a denied or failed run could turn into scores or a manual review.
    const prose = text.replace(/\s+/g, ' ');
    expect(prose).toContain('tell me the audit did not run and why');
    expect(prose).toContain('do not say the audit succeeded');
    expect(prose).toContain("do not read or inspect the repository's files instead");
  });

  it('ship a README that discloses requirements, data handling, and provenance', () => {
    // Anthropic's directory blocks a plugin folder without a README of at least 40 words outside
    // code blocks, and shows it as the listing description.
    const readme = readFileSync(path.join(pluginDir, 'README.md'), 'utf8');
    const prose = readme.replace(/```[\s\S]*?```/g, '');
    expect(prose.split(/\s+/).filter(Boolean).length).toBeGreaterThanOrEqual(40);
    for (const needle of [
      'Node.js 22.12 or later',
      'makes no network requests',
      'to its model provider',
      'pattern-based',
      '`f15924b`',
      '`034a74c`',
    ]) {
      expect(readme).toContain(needle);
    }
  });

  it('ship the license with the plugin', () => {
    expect(readFileSync(path.join(pluginDir, 'LICENSE'), 'utf8')).toBe(
      readFileSync(path.join(repoRoot, 'LICENSE'), 'utf8'),
    );
  });
});
