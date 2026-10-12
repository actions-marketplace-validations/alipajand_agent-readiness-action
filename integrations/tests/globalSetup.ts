import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    arkCli: string;
    acdCli: string;
  }
}

const repoRoot = path.resolve(import.meta.dirname, '../..');

// Builds each engine's own CLI from the same submodule commit the runtime
// bundles, so parity tests compare against `ark audit --json` and
// `acd audit --json` exactly as the engines ship them.
export default function setup(project: TestProject): () => void {
  const require = createRequire(import.meta.url);
  const ncc = require.resolve('@vercel/ncc/dist/ncc/cli.js', { paths: [repoRoot] });
  const out = mkdtempSync(path.join(tmpdir(), 'ar-engine-cli-'));
  const build = (name: string) => {
    const dir = path.join(out, name);
    execFileSync(
      process.execPath,
      [ncc, 'build', path.join(repoRoot, 'vendor', name, 'src/cli.ts'), '-o', dir, '-q'],
      { cwd: repoRoot, stdio: 'pipe' },
    );
    return path.join(dir, 'index.js');
  };
  project.provide('arkCli', build('agent-readiness-kit'));
  project.provide('acdCli', build('agent-context-doctor'));
  return () => rmSync(out, { recursive: true, force: true });
}
