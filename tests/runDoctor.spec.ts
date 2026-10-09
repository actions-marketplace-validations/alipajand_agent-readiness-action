import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { hasIssueAtOrAbove, issuesBySeverity, runContextAudit } from '../src/runDoctor';
import { formatContextLog, formatContextSection } from '../src/formatSummary';

let workspace: string;
let repo: string;

beforeEach(async () => {
  workspace = await realpath(await mkdtemp(path.join(tmpdir(), 'ara-doctor-')));
  repo = path.join(workspace, 'repo');
  await mkdir(repo);
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe('runContextAudit', () => {
  it('audits instruction files with the bundled agent-context-doctor', async () => {
    await writeFile(path.join(repo, 'AGENTS.md'), '# Agents\nSkip tests if they are slow.\n');
    const result = await runContextAudit('repo', workspace);
    expect(result.files.map((f) => f.path)).toEqual(['AGENTS.md']);
    expect(hasIssueAtOrAbove(result, 'high')).toBe(true);
    expect(issuesBySeverity(result)[0].severity).toBe('high');
  });

  it("honors the audited repository's .acdrc", async () => {
    await writeFile(path.join(repo, 'AGENTS.md'), '# Agents\nSkip tests if they are slow.\n');
    await writeFile(
      path.join(repo, '.acdrc'),
      JSON.stringify({ rules: { disabledChecks: ['risky-language'] } }),
    );
    const result = await runContextAudit(repo, workspace);
    expect(result.issues.some((i) => i.category === 'risky-language')).toBe(false);
  });

  it('resolves a relative repo path against GITHUB_WORKSPACE by default', async () => {
    await writeFile(path.join(repo, 'AGENTS.md'), '# Agents\n');
    const original = process.env.GITHUB_WORKSPACE;
    process.env.GITHUB_WORKSPACE = workspace;
    try {
      const result = await runContextAudit('repo');
      expect(result.repoPath).toBe(repo);
    } finally {
      if (original === undefined) delete process.env.GITHUB_WORKSPACE;
      else process.env.GITHUB_WORKSPACE = original;
    }
  });

  it('falls back to the working directory without GITHUB_WORKSPACE', async () => {
    const original = process.env.GITHUB_WORKSPACE;
    delete process.env.GITHUB_WORKSPACE;
    try {
      const result = await runContextAudit(repo);
      expect(result.repoPath).toBe(repo);
    } finally {
      if (original !== undefined) process.env.GITHUB_WORKSPACE = original;
    }
  });

  it('reports a repository without instruction files', async () => {
    const result = await runContextAudit(repo, workspace);
    expect(result.issues.map((i) => i.category)).toEqual(['presence']);
  });
});

describe('formatContextSection', () => {
  it('lists issues with escaped text and marks repository-wide ones', async () => {
    await writeFile(path.join(repo, 'AGENTS.md'), '# Agents\n<!-- TODO: fill in -->\n');
    const md = formatContextSection(await runContextAudit(repo, workspace));
    expect(md).toContain('### Agent context quality:');
    expect(md).toContain('`AGENTS.md:2`');
    expect(md).not.toContain('<!--');

    const empty = formatContextSection(
      await runContextAudit(path.join(workspace, 'none'), workspace),
    );
    expect(empty).toContain('(repository)');
  });
});

describe('formatContextLog', () => {
  it('shows line numbers and hides the audited path for repository-wide issues', async () => {
    await writeFile(path.join(repo, 'AGENTS.md'), '# Agents\n<!-- TODO: fill in -->\n');
    expect(formatContextLog(await runContextAudit(repo, workspace))).toContain('AGENTS.md:2');

    const empty = formatContextLog(await runContextAudit(repo + '-none', workspace));
    expect(empty).toContain('[high] (repository) — No agent context files found');
    expect(empty).not.toContain(workspace);
  });
});
