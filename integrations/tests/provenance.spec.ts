import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENGINE_PROVENANCE } from '../src/runtime/provenance.generated';
import { repoRoot, skillScript } from './helpers';

function submoduleCommit(dir: string): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: path.join(repoRoot, dir),
    encoding: 'utf8',
  }).trim();
}

describe('engine provenance', () => {
  it('matches the checked-out submodules', () => {
    expect(ENGINE_PROVENANCE.readiness.commit).toBe(submoduleCommit('vendor/agent-readiness-kit'));
    expect(ENGINE_PROVENANCE.context.commit).toBe(submoduleCommit('vendor/agent-context-doctor'));
  });

  it('is stamped on the committed skill bundle', () => {
    const header = readFileSync(skillScript, 'utf8').split('\n')[1];
    expect(header).toContain(ENGINE_PROVENANCE.readiness.commit);
    expect(header).toContain(ENGINE_PROVENANCE.context.commit);
  });
});
