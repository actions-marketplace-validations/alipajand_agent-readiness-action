import { spawn } from 'node:child_process';
import path from 'node:path';
import { toDisplayText } from '../../../vendor/agent-context-doctor/src/text/displayText.js';
import { AuditRuntimeError } from '../runtime/errors.js';
import type { ErrorCode } from '../runtime/types.js';
import type { CombinedReport, EngineKey } from '../runtime/types.js';

export interface WorkerOptions {
  /** The bundled audit CLI (`audit-worker.mjs`). */
  workerPath: string;
  timeoutMs: number;
  maxOutputBytes: number;
}

// Node's permission model is stable from 22.13 and 23.5, and the server does
// not start on older releases. The worker is granted reads of the audited
// directory and its own script only, and cannot write files, start processes,
// or load native add-ons. Node does
// not stop a granted read from following a symlink out of the directory, so
// containment of reads still rests on the engines' own symlink checks; the
// sandbox is a second layer.
export function supportsPermissionModel(version: string = process.versions.node): boolean {
  const [major, minor] = version.split('.').map(Number);
  return major >= 24 || (major === 23 && minor >= 5) || (major === 22 && minor >= 13);
}

/**
 * The paths to grant, without any path that another one already covers. Node
 * (seen on 24.11) denies reads under both paths when one grant is nested in
 * another, for example when the worker script lives inside the audited tree.
 */
export function readGrants(paths: readonly string[]): string[] {
  const unique = [...new Set(paths.map((p) => path.resolve(p)))];
  return unique.filter(
    (p) =>
      !unique.some(
        (other) => other !== p && p.startsWith(other.endsWith(path.sep) ? other : other + path.sep),
      ),
  );
}

/**
 * Audit `target` (already resolved and authorized) in a separate Node.js
 * process. The path goes to the worker as one argument with no shell, the
 * worker's output never reaches the MCP stdout stream, and the process is
 * killed when it runs too long or prints too much.
 */
export function runWorker(
  target: string,
  engine: EngineKey,
  options: WorkerOptions,
): Promise<CombinedReport> {
  // `*` at the end of a grant is a wildcard in --allow-fs-read.
  if (target.includes('*')) {
    return Promise.reject(
      new AuditRuntimeError(
        'INVALID_PATH',
        'Paths containing "*" cannot be audited by the MCP server.',
      ),
    );
  }
  const args = [
    '--permission',
    ...readGrants([options.workerPath, target]).map((p) => `--allow-fs-read=${p}`),
    options.workerPath,
    'audit',
    target,
    '--format',
    'json',
    '--only',
    engine,
    '--timeout',
    String(Math.ceil(options.timeoutMs / 1000)),
    // Fail if the authorized path now resolves somewhere else.
    '--canonical',
  ];
  // Only what Node needs on each platform; no tokens or other secrets from the
  // server's environment reach the worker.
  const env: NodeJS.ProcessEnv = {};
  for (const key of ['SystemRoot', 'TEMP', 'TMP']) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
      windowsHide: true,
    });
    const chunks: Buffer[] = [];
    let size = 0;
    let stderr = '';
    let failure: AuditRuntimeError | undefined;

    const stop = (error: AuditRuntimeError) => {
      failure ??= error;
      child.kill('SIGKILL');
    };
    const timer = setTimeout(
      () =>
        stop(
          new AuditRuntimeError(
            'TIMEOUT',
            `The audit did not finish within ${Math.round(options.timeoutMs / 1000)} seconds.`,
          ),
        ),
      options.timeoutMs,
    );

    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > options.maxOutputBytes) {
        stop(
          new AuditRuntimeError(
            'OUTPUT_TOO_LARGE',
            `The audit report exceeded ${options.maxOutputBytes} bytes.`,
          ),
        );
        return;
      }
      chunks.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < 4096) stderr += chunk.toString('utf8');
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new AuditRuntimeError('ENGINE_FAILED', `Could not start the audit: ${err.message}`));
    });
    child.on('close', () => {
      clearTimeout(timer);
      if (failure) return reject(failure);
      const text = Buffer.concat(chunks).toString('utf8');
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return reject(
          new AuditRuntimeError(
            'ENGINE_FAILED',
            `The audit produced no report.${stderr ? ` ${toDisplayText(stderr.trim().slice(0, 500))}` : ''}`,
          ),
        );
      }
      const record = parsed as { error?: { code?: string; message?: string } };
      if (record.error) {
        const code = WORKER_CODES.has(record.error.code as ErrorCode)
          ? (record.error.code as ErrorCode)
          : 'ENGINE_FAILED';
        return reject(new AuditRuntimeError(code, toDisplayText(String(record.error.message))));
      }
      resolve(parsed as CombinedReport);
    });
  });
}

// Codes the worker CLI can report; anything else becomes ENGINE_FAILED.
const WORKER_CODES = new Set<ErrorCode>([
  'INVALID_PATH',
  'PATH_NOT_FOUND',
  'NOT_A_DIRECTORY',
  'OUTSIDE_ROOT',
  'CONFIG_INVALID',
  'ENGINE_FAILED',
  'TIMEOUT',
]);

/** Runs at most `limit` tasks at once and rejects new work when `maxQueued` are waiting. */
export class Limiter {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(
    private readonly limit: number,
    private readonly maxQueued: number,
  ) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      if (this.waiting.length >= this.maxQueued) {
        throw new AuditRuntimeError('BUSY', 'Too many audits are already queued; retry later.');
      }
      // The finishing task hands its slot over without releasing it, so a
      // caller arriving in between cannot take it as well.
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else {
      this.active++;
    }
    try {
      return await task();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    }
  }
}
