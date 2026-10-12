import { mkdir, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveTarget } from '../src/runtime/paths';
import { makeTempDir } from './fixtures';
import { rm } from 'node:fs/promises';

let base: string;
let root: string;
let outside: string;

beforeEach(async () => {
  base = await makeTempDir();
  root = path.join(base, 'root');
  outside = path.join(base, 'outside');
  await mkdir(path.join(root, 'repo'), { recursive: true });
  await mkdir(outside);
  await writeFile(path.join(root, 'file.txt'), 'x');
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

async function code(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (err) {
    return (err as { code?: string }).code;
  }
}

describe('resolveTarget', () => {
  it('resolves a directory inside an authorized root', async () => {
    expect(await resolveTarget('repo', { cwd: root, roots: [root] })).toBe(path.join(root, 'repo'));
    expect(await resolveTarget(root, { roots: [root] })).toBe(root);
  });

  it('allows any existing directory when no roots are configured', async () => {
    expect(await resolveTarget(outside)).toBe(outside);
  });

  it('rejects traversal out of the root', async () => {
    expect(await code(resolveTarget('../outside', { cwd: root, roots: [root] }))).toBe(
      'OUTSIDE_ROOT',
    );
    expect(await code(resolveTarget(`${root}/repo/../../outside`, { roots: [root] }))).toBe(
      'OUTSIDE_ROOT',
    );
  });

  it('rejects a symlink inside the root that points outside it', async () => {
    await symlink(outside, path.join(root, 'escape'));
    expect(await code(resolveTarget('escape', { cwd: root, roots: [root] }))).toBe('OUTSIDE_ROOT');
  });

  it('does not treat a sibling with a shared prefix as inside the root', async () => {
    await mkdir(path.join(base, 'root-sibling'));
    expect(await code(resolveTarget(path.join(base, 'root-sibling'), { roots: [root] }))).toBe(
      'OUTSIDE_ROOT',
    );
  });

  it('accepts a directory whose name starts with two dots', async () => {
    await mkdir(path.join(root, '..hidden'));
    expect(await resolveTarget('..hidden', { cwd: root, roots: [root] })).toBe(
      path.join(root, '..hidden'),
    );
  });

  it('reports missing paths, files, and malformed input', async () => {
    expect(await code(resolveTarget('nope', { cwd: root }))).toBe('PATH_NOT_FOUND');
    expect(await code(resolveTarget('file.txt', { cwd: root }))).toBe('NOT_A_DIRECTORY');
    expect(await code(resolveTarget('', { cwd: root }))).toBe('INVALID_PATH');
    expect(await code(resolveTarget('repo\u0000x', { cwd: root }))).toBe('INVALID_PATH');
    expect(await code(resolveTarget('repo\nx', { cwd: root }))).toBe('INVALID_PATH');
    expect(await code(resolveTarget('a'.repeat(5000), { cwd: root }))).toBe('INVALID_PATH');
  });

  it('answers OUTSIDE_ROOT for any path outside the roots, existing or not, without naming it', async () => {
    for (const p of [outside, path.join(outside, 'nope'), '/etc']) {
      let message = '';
      try {
        await resolveTarget(p, { roots: [root] });
      } catch (err) {
        expect((err as { code: string }).code).toBe('OUTSIDE_ROOT');
        message = (err as Error).message;
      }
      expect(message).not.toContain(p);
    }
  });

  it('in canonical mode, fails when the path goes through a symlink', async () => {
    await symlink(path.join(root, 'repo'), path.join(root, 'alias'));
    expect(await code(resolveTarget(path.join(root, 'alias'), { requireCanonical: true }))).toBe(
      'OUTSIDE_ROOT',
    );
    expect(await resolveTarget(path.join(root, 'repo'), { requireCanonical: true })).toBe(
      path.join(root, 'repo'),
    );
  });

  it('rejects a dangling symlink', async () => {
    await symlink(path.join(base, 'gone'), path.join(root, 'dangling'));
    expect(await code(resolveTarget('dangling', { cwd: root, roots: [root] }))).toBe(
      'PATH_NOT_FOUND',
    );
  });
});
