import { spawnSync } from 'node:child_process';
import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CombinedReport } from '../src/runtime/types';
import { cleanup, makeTempDir, materialize } from './fixtures';
import { parseJson, skillDir } from './helpers';
import { rm } from 'node:fs/promises';

// Installs the skill the way skill clients do (copy the directory), then runs
// it with an empty environment under Node's permission model: no file writes,
// no child processes, no worker threads. Any write the audit attempted would
// fail with ERR_ACCESS_DENIED.
let installRoot: string;
let installed: string;
let repo: string;

beforeAll(async () => {
  installRoot = await makeTempDir('ar-install-');
  installed = path.join(installRoot, 'skills', 'agent-readiness-audit');
  await mkdir(path.dirname(installed), { recursive: true });
  await cp(skillDir, installed, { recursive: true });
  repo = await materialize('mixed');
});

afterAll(async () => {
  await rm(installRoot, { recursive: true, force: true });
  await cleanup(repo);
});

function runInstalled(args: string[]) {
  return spawnSync(
    process.execPath,
    [
      '--permission',
      `--allow-fs-read=${installed}`,
      `--allow-fs-read=${repo}`,
      path.join(installed, 'scripts/agent-readiness.mjs'),
      ...args,
    ],
    { cwd: installRoot, env: { HOME: installRoot }, encoding: 'utf8' },
  );
}

describe('clean installation', () => {
  it('runs from a copied skill directory with no writes allowed and an empty environment', () => {
    const run = runInstalled(['audit', repo, '--format', 'json']);
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    const report = parseJson<CombinedReport>(run.stdout);
    expect(report.readiness.status).toBe('ok');
    expect(report.context.status).toBe('ok');
  });

  it('cannot read outside the directories it was granted', () => {
    const run = runInstalled(['audit', path.dirname(repo), '--format', 'json']);
    expect(run.status).toBe(1);
  });
});
