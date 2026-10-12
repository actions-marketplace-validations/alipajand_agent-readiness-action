import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Limiter, readGrants, runWorker, supportsPermissionModel } from '../src/mcp/worker';
import { makeTempDir } from './fixtures';
import { rm } from 'node:fs/promises';

let dir: string;

beforeAll(async () => {
  dir = await makeTempDir('ar-worker-');
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function fakeWorker(name: string, code: string): Promise<string> {
  const file = path.join(dir, name);
  await writeFile(file, code);
  return file;
}

async function failure(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (err) {
    return (err as { code?: string }).code;
  }
}

describe('runWorker limits', () => {
  it('kills a worker that runs past the time limit', async () => {
    const worker = await fakeWorker('slow.mjs', 'setInterval(() => {}, 1000);\n');
    const started = Date.now();
    expect(
      await failure(
        runWorker(dir, 'readiness', { workerPath: worker, timeoutMs: 300, maxOutputBytes: 1e6 }),
      ),
    ).toBe('TIMEOUT');
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('kills a worker that prints too much', async () => {
    const worker = await fakeWorker(
      'loud.mjs',
      "const s = 'x'.repeat(65536); const w = () => process.stdout.write(s, w); w();\n",
    );
    expect(
      await failure(
        runWorker(dir, 'readiness', {
          workerPath: worker,
          timeoutMs: 10_000,
          maxOutputBytes: 200_000,
        }),
      ),
    ).toBe('OUTPUT_TOO_LARGE');
  });

  it('reports a worker that prints no JSON', async () => {
    const worker = await fakeWorker(
      'broken.mjs',
      "process.stderr.write('boom'); process.exit(3);\n",
    );
    expect(
      await failure(
        runWorker(dir, 'readiness', { workerPath: worker, timeoutMs: 10_000, maxOutputBytes: 1e6 }),
      ),
    ).toBe('ENGINE_FAILED');
  });

  it('passes the worker no secrets from the environment and sandboxes it', async () => {
    process.env.AGENT_READINESS_TEST_TOKEN = 'ghp_should_not_leak';
    const worker = await fakeWorker(
      'env.mjs',
      'const target = require("node:path").join(process.argv[3], "written.txt");\n' +
        'let write; try { require("node:fs").writeFileSync(target, "x"); write = "allowed"; } catch (e) { write = e.code; }\n' +
        'process.stdout.write(JSON.stringify({ env: Object.keys(process.env), argv: process.argv.slice(2), permission: !!process.permission, write }));\n',
    );
    // The fake worker is CommonJS-style; give it a .cjs twin so `require` exists.
    const cjs = worker.replace(/\.mjs$/, '.cjs');
    await writeFile(cjs, (await import('node:fs')).readFileSync(worker, 'utf8'));
    const out = (await runWorker(dir, 'context', {
      workerPath: cjs,
      timeoutMs: 10_000,
      maxOutputBytes: 1e6,
    })) as unknown as { env: string[]; argv: string[]; permission: boolean; write: string };
    delete process.env.AGENT_READINESS_TEST_TOKEN;
    expect(out.env).not.toContain('AGENT_READINESS_TEST_TOKEN');
    expect(out.env).not.toContain('GITHUB_TOKEN');
    expect(out.argv).toEqual([
      'audit',
      dir,
      '--format',
      'json',
      '--only',
      'context',
      '--timeout',
      '10',
      '--canonical',
    ]);
    expect(out.permission).toBe(supportsPermissionModel());
    if (supportsPermissionModel()) expect(out.write).toBe('ERR_ACCESS_DENIED');
  });
});

describe('readGrants', () => {
  it('drops paths covered by another grant', () => {
    expect(readGrants(['/a/b/worker.mjs', '/a/b'])).toEqual(['/a/b']);
    expect(readGrants(['/a/b', '/a/b/c', '/x'])).toEqual(['/a/b', '/x']);
    expect(readGrants(['/a/bc/w.mjs', '/a/b'])).toEqual(['/a/bc/w.mjs', '/a/b']);
    expect(readGrants(['/a', '/a'])).toEqual(['/a']);
  });

  it('lets a worker that lives inside the audited directory read that directory', async () => {
    const worker = await fakeWorker(
      'stat.cjs',
      'require("node:fs").statSync(process.argv[3]); require("node:fs").readdirSync(process.argv[3]);\n' +
        'process.stdout.write(JSON.stringify({ ok: true }));\n',
    );
    const out = (await runWorker(dir, 'readiness', {
      workerPath: worker,
      timeoutMs: 10_000,
      maxOutputBytes: 1e6,
    })) as unknown as {
      ok: boolean;
    };
    expect(out.ok).toBe(true);
  });
});

describe('supportsPermissionModel', () => {
  it('matches the Node.js releases where --permission is stable', () => {
    expect(supportsPermissionModel('22.12.0')).toBe(false);
    expect(supportsPermissionModel('22.13.0')).toBe(true);
    expect(supportsPermissionModel('23.4.0')).toBe(false);
    expect(supportsPermissionModel('23.5.0')).toBe(true);
    expect(supportsPermissionModel('24.0.0')).toBe(true);
  });
});

describe('Limiter', () => {
  it('runs at most `limit` tasks at once and rejects past the queue', async () => {
    const limiter = new Limiter(2, 1);
    let active = 0;
    let peak = 0;
    const task = () =>
      limiter.run(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 30));
        active--;
        return 'done';
      });
    const results = await Promise.allSettled([task(), task(), task(), task()]);
    expect(peak).toBe(2);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason.code).toBe('BUSY');
  });
});
