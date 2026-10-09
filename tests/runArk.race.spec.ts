import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type * as FsPromises from 'node:fs/promises';

const lstatOverride = vi.fn<(filePath: string) => Promise<unknown> | undefined>(() => undefined);

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  return {
    ...actual,
    lstat: (filePath: string) => lstatOverride(filePath) ?? actual.lstat(filePath),
  };
});

const { mkdtemp, mkdir, readFile, realpath, rm, writeFile, lstat } =
  await import('node:fs/promises');
const { tmpdir } = await import('node:os');
const path = await import('node:path');
const { runArk } = await import('../src/runArk');

let workspace: string;
let repo: string;

beforeEach(async () => {
  workspace = await realpath(await mkdtemp(path.join(tmpdir(), 'ara-runark-race-')));
  repo = path.join(workspace, 'repo');
  await mkdir(repo);
  await writeFile(path.join(repo, 'AGENTS.md'), '# Agents\n');
});

afterEach(async () => {
  lstatOverride.mockReset();
  lstatOverride.mockImplementation(() => undefined);
  await rm(workspace, { recursive: true, force: true });
});

describe('runArk report write — path swapped after opening', () => {
  it('refuses to truncate when the path no longer names the opened file', async () => {
    const report = path.join(repo, 'report.md');
    await writeFile(report, 'keep');
    const real = await lstat(report);
    lstatOverride.mockImplementation((filePath) =>
      filePath === report
        ? Promise.resolve({ ...real, ino: real.ino + 1, isSymbolicLink: () => false })
        : undefined,
    );

    await expect(runArk({ repoPath: repo, output: 'report.md' })).rejects.toThrow(/symbolic link/);
    expect(await readFile(report, 'utf8')).toBe('keep');
  });
});
