import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOOL_VERSION } from '../src/runtime/version';
import { skillDir } from './helpers';

// The rules of https://agentskills.io/specification, checked in CI without the
// Python `skills-ref` tool. The release checklist also runs `skills-ref validate`.
const STANDARD_FIELDS = [
  'name',
  'description',
  'license',
  'compatibility',
  'metadata',
  'allowed-tools',
];

function parseFrontmatter(text: string): { fields: Record<string, unknown>; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!match) throw new Error('SKILL.md has no frontmatter');
  const fields: Record<string, unknown> = {};
  let map: Record<string, string> | undefined;
  for (const line of match[1].split('\n')) {
    const nested = /^ {2}([\w-]+):\s*(.*)$/.exec(line);
    if (nested && map) {
      map[nested[1]] = nested[2].replace(/^'(.*)'$/, '$1');
      continue;
    }
    const top = /^([\w-]+):\s*(.*)$/.exec(line);
    if (!top) throw new Error(`Unexpected frontmatter line: ${line}`);
    if (top[2] === '') {
      map = {};
      fields[top[1]] = map;
    } else {
      map = undefined;
      fields[top[1]] = top[2];
    }
  }
  return { fields, body: match[2] };
}

describe('agent-readiness-audit SKILL.md', () => {
  const text = readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
  const { fields, body } = parseFrontmatter(text);

  it('uses only the standard frontmatter fields', () => {
    for (const key of Object.keys(fields)) expect(STANDARD_FIELDS).toContain(key);
  });

  it('has a valid name that matches its directory', () => {
    const name = String(fields.name);
    expect(name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(name.length).toBeLessThanOrEqual(64);
    expect(name).toBe(path.basename(skillDir));
  });

  it('keeps description and compatibility within the limits', () => {
    const description = String(fields.description);
    expect(description.length).toBeGreaterThan(0);
    expect(description.length).toBeLessThanOrEqual(1024);
    expect(String(fields.compatibility).length).toBeLessThanOrEqual(500);
  });

  it('keeps the body small and its references inside the skill', () => {
    expect(body.split('\n').length).toBeLessThan(500);
    for (const m of body.matchAll(/\]\(([^)#]+)\)/g)) {
      if (/^https?:/.test(m[1])) continue;
      expect(m[1]).not.toContain('..');
      expect(existsSync(path.join(skillDir, m[1]))).toBe(true);
    }
  });

  it('declares the runtime version in its metadata', () => {
    expect((fields.metadata as Record<string, string>).version).toBe(TOOL_VERSION);
  });
});
