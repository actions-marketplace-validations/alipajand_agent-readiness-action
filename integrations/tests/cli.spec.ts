import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CombinedReport } from '../src/runtime/types';
import { cleanup, materialize } from './fixtures';
import { md } from '../src/runtime/report';
import { parseJson, runNode, runSkill, skillScript } from './helpers';

let repo: string;

beforeAll(async () => {
  repo = await materialize('node');
});

afterAll(async () => {
  await cleanup(repo);
});

describe('agent-readiness CLI (bundled skill script)', () => {
  it('prints a combined JSON report and exits 0', () => {
    const run = runSkill(['audit', repo, '--format', 'json']);
    expect(run.status).toBe(0);
    const report = parseJson<CombinedReport>(run.stdout);
    expect(report.schemaVersion).toBe(1);
    expect(report.target).toBe(repo);
    expect(report.readiness.status).toBe('ok');
    expect(report.context.status).toBe('ok');
    expect(report.engines.readiness.commit).toMatch(/^[0-9a-f]{40}$/);
  });

  it('audits the current directory by default and prints Markdown', () => {
    const run = runSkill(['audit'], repo);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('# Agent readiness audit');
    expect(run.stdout).toContain(`- Target: ${md(repo)}`);
  });

  it('runs one engine with --only', () => {
    const run = runSkill(['audit', repo, '--format', 'json', '--only', 'context']);
    const report = parseJson<CombinedReport>(run.stdout);
    expect(report.readiness.status).toBe('skipped');
    expect(report.context.status).toBe('ok');
  });

  it('returns a structured error for a missing path', () => {
    const run = runSkill(['audit', `${repo}/missing`, '--format', 'json']);
    expect(run.status).toBe(1);
    expect(parseJson<{ error: { code: string } }>(run.stdout).error.code).toBe('PATH_NOT_FOUND');
  });

  it('rejects bad usage with exit code 2', () => {
    expect(runSkill(['audit', '--format', 'xml']).status).toBe(2);
    expect(runSkill(['audit', '--only', 'all']).status).toBe(2);
    expect(runSkill(['audit', 'a', 'b']).status).toBe(2);
    expect(runSkill(['audit', '--max-items', '0']).status).toBe(2);
    expect(runSkill(['audit', '--bogus']).status).toBe(2);
    expect(runSkill(['frobnicate']).status).toBe(2);
    expect(runSkill([]).status).toBe(2);
    expect(runSkill(['--help']).status).toBe(0);
  });

  it('treats everything after -- as the path, even when it looks like an option', async () => {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(`${repo}/--format`);
    const run = runSkill(['audit', '--format', 'json', '--', `${repo}/--format`]);
    expect(run.status).toBe(0);
    expect(parseJson<CombinedReport>(run.stdout).target).toBe(`${repo}/--format`);
  });

  it('prints versions and engine commits', () => {
    const run = runSkill(['version']);
    const out = parseJson<{ version: string; engines: Record<string, { commit: string }> }>(
      run.stdout,
    );
    expect(out.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(out.engines.context.commit).toMatch(/^[0-9a-f]{40}$/);
  });

  it('does not depend on GitHub Actions variables', () => {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        ([k]) => !k.startsWith('GITHUB_') && !k.startsWith('INPUT_'),
      ),
    );
    const run = runNode(skillScript, ['audit', '--format', 'json'], { cwd: repo, env });
    expect(run.status).toBe(0);
    expect(parseJson<CombinedReport>(run.stdout).target).toBe(repo);
  });
});
