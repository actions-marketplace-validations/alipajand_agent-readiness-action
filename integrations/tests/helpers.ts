import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import path from 'node:path';

export const repoRoot = path.resolve(import.meta.dirname, '../..');
export const skillDir = path.join(repoRoot, 'plugins/agent-readiness/skills/agent-readiness-audit');
export const skillScript = path.join(skillDir, 'scripts/agent-readiness.mjs');

export function runNode(
  script: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: options.cwd ?? repoRoot,
    env: options.env ?? process.env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

export function runSkill(args: string[], cwd?: string): SpawnSyncReturns<string> {
  return runNode(skillScript, args, { cwd });
}

export function parseJson<T = unknown>(text: string): T {
  return JSON.parse(text) as T;
}
