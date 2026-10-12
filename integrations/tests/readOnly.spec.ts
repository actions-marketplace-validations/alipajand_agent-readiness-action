import { afterAll, describe, expect, it } from 'vitest';
import { cleanup, FIXTURES, materialize, snapshotTree } from './fixtures';
import { runSkill } from './helpers';

const created: string[] = [];
afterAll(async () => {
  await Promise.all(created.map(cleanup));
});

describe('read-only scans', () => {
  it.each(Object.keys(FIXTURES))('leaves the %s fixture unchanged', async (name) => {
    const repo = await materialize(name as keyof typeof FIXTURES);
    created.push(repo);
    const before = await snapshotTree(repo);
    runSkill(['audit', repo, '--format', 'json']);
    runSkill(['audit', repo]);
    expect(await snapshotTree(repo)).toEqual(before);
  });
});
