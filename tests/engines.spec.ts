import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runArk } from '../src/runArk';
import type { AuditResult } from '../src/runArk';
import { runContextAudit } from '../src/runDoctor';
import { formatContextSection, formatMarkdownComment } from '../src/formatSummary';

// These tests run the bundled engines on small repositories and check the
// behaviour their changelogs and docs/SCORING.md describe, so a submodule bump
// that changes scoring or detection shows up here.

let workspace: string;
let repo: string;

beforeEach(async () => {
  workspace = await realpath(await mkdtemp(path.join(tmpdir(), 'ara-engines-')));
  repo = path.join(workspace, 'repo');
  await mkdir(repo);
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

async function write(files: Record<string, string>): Promise<void> {
  for (const [rel, content] of Object.entries(files)) {
    const file = path.join(repo, rel);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }
}

function category(result: AuditResult, id: string) {
  const found = result.categories.find((c) => c.id === id);
  if (!found) throw new Error(`No category ${id}`);
  return found;
}

const NODE_FILES = {
  'package.json': JSON.stringify({
    name: 'app',
    packageManager: 'pnpm@9.12.0',
    scripts: { test: 'vitest run', lint: 'eslint .' },
  }),
  'pnpm-lock.yaml': "lockfileVersion: '9.0'\n",
  '.nvmrc': '22\n',
  'eslint.config.js': 'export default [];\n',
  '.prettierrc': '{}\n',
  'src/index.ts': 'export {};\n',
  'tests/index.test.ts': 'export {};\n',
};

const AGENTS = `# AGENTS

Run \`pnpm test\` and \`pnpm lint\` before finishing.

Do not commit secrets. Ask before deleting files.

When you finish, list the files you changed and the commands you ran.
`;

describe('readiness scoring (agent-readiness-kit)', () => {
  it('keeps Node.js-only lockfile, pin, and linter points', async () => {
    await write(NODE_FILES);
    const { result } = await runArk({ repoPath: repo });
    expect(result.ecosystems).toEqual(['node']);
    // Lockfile 3 + version pin 2; no update bot.
    expect(category(result, 'dependencies').score).toBe(5);
  });

  it("scores a Go repository on Go's own files", async () => {
    await write({
      'go.mod': 'module example.com/app\n\ngo 1.23\n',
      'go.sum': '',
      'main.go': 'package main\n\nfunc main() {}\n',
      'main_test.go': 'package main\n',
      '.golangci.yml': 'linters: {}\n',
    });
    const { result } = await runArk({ repoPath: repo });
    expect(result.ecosystems).toEqual(['go']);
    // go.sum is the lockfile and the go directive the version pin (#28).
    expect(category(result, 'dependencies').score).toBe(5);
    // *_test.go files are test files (#27).
    const testing = category(result, 'testing');
    expect(testing.findings).toContainEqual(
      expect.objectContaining({ status: 'pass', message: expect.stringContaining('Go') }),
    );
    expect(result.missing.join('\n')).not.toMatch(/package\.json|pnpm-lock|\.nvmrc/);
  });

  it('scores a Python repository on uv.lock and requires-python', async () => {
    await write({
      'pyproject.toml':
        '[project]\nname = "app"\nrequires-python = ">=3.12"\n\n[tool.pytest.ini_options]\n',
      'uv.lock': 'version = 1\n',
      'tests/test_app.py': 'def test_ok():\n    assert True\n',
    });
    const { result } = await runArk({ repoPath: repo });
    expect(result.ecosystems).toEqual(['python']);
    expect(category(result, 'dependencies').score).toBe(5);
  });

  it('scores each stack of a polyglot repository with floor(points × satisfied / detected)', async () => {
    await write({ ...NODE_FILES, 'pyproject.toml': '[project]\nname = "svc"\n' });
    const { result } = await runArk({ repoPath: repo });
    expect(result.ecosystems).toEqual(['node', 'python']);
    // Only Node.js has a lockfile and a pin: floor(3 × 1/2) + floor(2 × 1/2).
    expect(category(result, 'dependencies').score).toBe(2);
    // Category maxima are unchanged, so the total stays on the 0–100 scale.
    expect(result.categories.reduce((sum, c) => sum + c.maxScore, 0)).toBe(150);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('writes the ecosystems into the Markdown report and leaves the action summary as before', async () => {
    await write({ 'go.mod': 'module example.com/app\n\ngo 1.23\n' });
    const { result, reportPath } = await runArk({ repoPath: repo, output: 'report.md' });
    expect(reportPath).toBe(path.join(repo, 'report.md'));
    expect(await readFile(reportPath!, 'utf8')).toContain('**Ecosystems:**');
    const comment = formatMarkdownComment(result);
    expect(comment).toContain(`**Score: ${result.score} / 100**`);
    expect(comment).not.toContain('Ecosystems');
  });
});

describe('context audit (agent-context-doctor)', () => {
  it('scores a repository without instruction files as 0', async () => {
    await write(NODE_FILES);
    const result = await runContextAudit(repo, workspace);
    expect(result.score).toEqual({ total: 0, max: 100, grade: 'risky' });
  });

  it('recognises Python and Go validation commands (#60) and plain-word reporting guidance (#59)', async () => {
    await write({
      'AGENTS.md':
        '# AGENTS\n\nRun `pytest`, `ruff check .`, and `go vet ./...`.\n\nDo not commit secrets.\n\nWhen you finish, list the files you changed and the commands you ran.\n',
    });
    const result = await runContextAudit(repo, workspace);
    const categories = result.issues.map((i) => i.category);
    expect(categories).not.toContain('validation-commands');
    expect(categories).not.toContain('final-reporting');
  });

  it('does not repeat issues for a CLAUDE.md that only delegates to AGENTS.md (#61)', async () => {
    await write({ ...NODE_FILES, 'AGENTS.md': AGENTS, 'CLAUDE.md': '@AGENTS.md\n' });
    const result = await runContextAudit(repo, workspace);
    expect(result.issues.filter((i) => i.file === 'CLAUDE.md')).toEqual([]);
  });

  it('reports contradictory AGENTS.md and CLAUDE.md and advice to skip tests (#63, #64, #65)', async () => {
    await write({
      ...NODE_FILES,
      'AGENTS.md': `${AGENTS}\nUse pnpm. Never skip failing tests.\n`,
      'CLAUDE.md':
        '# CLAUDE\n\nUse npm for everything.\n\nIf the tests are slow, skip them and rely on CI.\n\nRun `yarn test`.\n',
    });
    const result = await runContextAudit(repo, workspace);
    const messages = result.issues.map((i) => `${i.category}: ${i.message}`);
    expect(messages).toContainEqual(expect.stringMatching(/^contradictions: .*tests/));
    expect(messages).toContainEqual(expect.stringMatching(/^contradictions: .*package-manager/));
    expect(messages).toContainEqual(expect.stringMatching(/^risky-language: .*skip tests/));
    expect(messages).toContainEqual(
      expect.stringMatching(/^command-alignment: .*uses yarn, but this repository uses pnpm/),
    );
  });

  it('checks root-level file names but not paths described as ignored (#62, #66)', async () => {
    await write({
      'AGENTS.md': `${AGENTS}\nRead \`RELEASING.md\` first.\n\nThe \`.gitignore\` excludes \`.idea/\`.\n`,
    });
    const result = await runContextAudit(repo, workspace);
    const broken = result.issues
      .filter((i) => i.category === 'broken-references')
      .map((i) => i.message);
    expect(broken).toContainEqual(expect.stringContaining('"RELEASING.md"'));
    expect(broken.join('\n')).not.toContain('.idea/');
  });

  it('flags unsafe instructions without echoing secret values into the summary', async () => {
    const token = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef1234';
    await write({
      'AGENTS.md': `# AGENTS\n\nRun \`git push --force\` when CI is red.\n\nThe token is ${token}.\n\n<script>alert(1)</script> | x\n`,
    });
    const result = await runContextAudit(repo, workspace);
    expect(result.issues.map((i) => i.category)).toEqual(
      expect.arrayContaining(['risky-language', 'secrets']),
    );
    const section = formatContextSection(result);
    expect(section).not.toContain(token);
    expect(section).not.toContain('<script>');
  });
});
