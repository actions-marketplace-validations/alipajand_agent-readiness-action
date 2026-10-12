// Builds the committed, self-contained bundles: the skill's audit script and
// the MCP server. Each is one JavaScript file with the pinned engines compiled
// in, so installing the skill or the server downloads nothing at run time.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeProvenanceModule } from './provenance.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, '..');
const repoRoot = path.resolve(pkgRoot, '..');
const require = createRequire(import.meta.url);
const ncc = require.resolve('@vercel/ncc/dist/ncc/cli.js', { paths: [repoRoot] });

const SKILL_SCRIPT =
  'plugins/agent-readiness/skills/agent-readiness-audit/scripts/agent-readiness.mjs';
const MCP_DIST = 'integrations/mcp-package/dist';

const TARGETS = [
  {
    entry: 'src/cli.ts',
    out: SKILL_SCRIPT,
    licenses:
      'plugins/agent-readiness/skills/agent-readiness-audit/scripts/THIRD-PARTY-LICENSES.txt',
  },
  {
    entry: 'src/mcp/main.ts',
    out: `${MCP_DIST}/server.js`,
    licenses: `${MCP_DIST}/THIRD-PARTY-LICENSES.txt`,
    shebang: true,
  },
];

const engines = writeProvenanceModule(path.join(pkgRoot, 'src/runtime/provenance.generated.ts'));

for (const target of TARGETS) {
  const outDir = mkdtempSync(path.join(tmpdir(), 'ar-build-'));
  try {
    execFileSync(
      process.execPath,
      [
        ncc,
        'build',
        path.join(pkgRoot, target.entry),
        '-o',
        outDir,
        '--license',
        'licenses.txt',
        '-q',
      ],
      { cwd: repoRoot, stdio: 'inherit' },
    );
    const header =
      `// Generated from integrations/${target.entry} by integrations/scripts/build.mjs. Do not edit.\n` +
      `// Engines: ${Object.values(engines)
        .map((e) => `${e.name}@${e.version} (${e.commit})`)
        .join(', ')}\n`;
    const code = readFileSync(path.join(outDir, 'index.js'), 'utf8');
    const outFile = path.join(repoRoot, target.out);
    mkdirSync(path.dirname(outFile), { recursive: true });
    const body = code.replace(/^#!.*\n/, '');
    writeFileSync(outFile, (target.shebang ? '#!/usr/bin/env node\n' : '') + header + body);
    if (target.licenses)
      copyFileSync(path.join(outDir, 'licenses.txt'), path.join(repoRoot, target.licenses));
    console.log(`built ${target.out}`);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

// The MCP server runs each audit in a child process using the same CLI bundle
// the skill ships, so both adapters execute identical engine code.
copyFileSync(path.join(repoRoot, SKILL_SCRIPT), path.join(repoRoot, MCP_DIST, 'audit-worker.mjs'));
copyFileSync(
  path.join(
    repoRoot,
    'plugins/agent-readiness/skills/agent-readiness-audit/scripts/THIRD-PARTY-LICENSES.txt',
  ),
  path.join(repoRoot, MCP_DIST, 'audit-worker.THIRD-PARTY-LICENSES.txt'),
);
console.log(`copied ${MCP_DIST}/audit-worker.mjs`);
