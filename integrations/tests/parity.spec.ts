import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, inject, it } from 'vitest';
import type { CombinedReport } from '../src/runtime/types';
import { cleanup, FIXTURES, materialize } from './fixtures';
import { parseJson, runNode, runSkill, skillScript } from './helpers';

// The runtime must report exactly what the engines' own CLIs report for the
// same pinned commits. `ark` is run with --no-history so it writes nothing.
const NAMES = ['empty', 'node', 'python', 'go', 'rust', 'mixed', 'acdrcRules'] as const;
const created: string[] = [];

afterAll(async () => {
  await Promise.all(created.map(cleanup));
});

describe.each(NAMES)('parity with direct engine CLIs: %s', (name) => {
  it('matches `ark audit --json` and `acd audit --json`', async () => {
    expect(FIXTURES[name]).toBeDefined();
    const repo = await materialize(name);
    created.push(repo);

    const ark = runNode(inject('arkCli'), ['audit', repo, '--json', '--no-history']);
    expect(ark.status).toBe(0);
    const acd = runNode(inject('acdCli'), ['audit', repo, '--json']);
    expect([0, 1]).toContain(acd.status);

    const combined = runSkill(['audit', repo, '--format', 'json']);
    expect(combined.status).toBe(0);
    const report = parseJson<CombinedReport>(combined.stdout);

    if (report.readiness.status !== 'ok' || report.context.status !== 'ok') {
      throw new Error('expected both engines to succeed');
    }
    expect(report.readiness.result).toEqual(parseJson(ark.stdout));
    expect(report.context.result.report).toEqual(parseJson(acd.stdout));
  });
});

it('detects each ecosystem the kit supports', async () => {
  const repo = await materialize('mixed');
  created.push(repo);
  const report = parseJson<CombinedReport>(runSkill(['audit', repo, '--format', 'json']).stdout);
  if (report.readiness.status !== 'ok') throw new Error('readiness failed');
  expect(report.readiness.result.ecosystems).toEqual(
    expect.arrayContaining(['node', 'python', 'go', 'rust']),
  );
});

// The MCP worker runs the same bundle under Node's permission model with read
// access to the target only. That must not change any result, including for a
// subdirectory of a larger repository.
it.each(['node', 'mixed', 'hostile'] as const)(
  'gives identical output under the read-only sandbox: %s',
  async (name) => {
    const repo = await materialize(name);
    created.push(repo);
    const nested = path.join(repo, 'packages/inner');
    await mkdir(nested, { recursive: true });
    await writeFile(path.join(nested, 'AGENTS.md'), '# Inner\n\nRun `npm test`.\n');
    for (const target of [repo, nested]) {
      const plain = runSkill(['audit', target, '--format', 'json']).stdout;
      const sandboxed = spawnSync(
        process.execPath,
        [
          '--permission',
          `--allow-fs-read=${skillScript}`,
          `--allow-fs-read=${target}`,
          skillScript,
          'audit',
          target,
          '--format',
          'json',
        ],
        { encoding: 'utf8' },
      ).stdout;
      expect(sandboxed).toBe(plain);
    }
  },
);
