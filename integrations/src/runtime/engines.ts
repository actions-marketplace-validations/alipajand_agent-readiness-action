import { auditRepo as auditReadiness } from '../../../vendor/agent-readiness-kit/src/audit/auditRepo.js';
import { toAuditJson } from '../../../vendor/agent-readiness-kit/src/report/jsonReport.js';
import { auditRepo as auditContext } from '../../../vendor/agent-context-doctor/src/audit/auditRepo.js';
import { loadConfig } from '../../../vendor/agent-context-doctor/src/config/loadConfig.js';
import { checkSecrets } from '../../../vendor/agent-context-doctor/src/audit/checks/secrets.js';
import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { AuditRuntimeError } from './errors.js';
import type { ContextAuditResult, ContextResult, ReadinessAuditJson } from './types.js';

/**
 * The readiness score for `dir`, in the shape `ark audit --json` prints. Calls
 * the engine's library entry point rather than its CLI, so the audited
 * repository's `.arkrc` cannot redirect the audit or name a report file, and
 * no score history is written.
 */
export async function runReadiness(dir: string): Promise<ReadinessAuditJson> {
  return toAuditJson(await auditReadiness(dir));
}

/**
 * The doctor reads `.acdrc` without checking where a symlink points, and its
 * parse errors quote the start of the file. A hostile repository could link
 * `.acdrc` to a file elsewhere on disk and have a fragment of it reported, or
 * have it applied as configuration. Refuse that before the engine reads it.
 */
async function assertConfigInside(dir: string): Promise<void> {
  const file = path.join(dir, '.acdrc');
  const link = await lstat(file).catch(() => null);
  if (!link?.isSymbolicLink()) return;
  const target = await realpath(file).catch(() => null);
  // A dangling link is left to the engine, which treats it as no config file.
  if (target === null) return;
  const rel = path.relative(dir, target);
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new AuditRuntimeError(
      'CONFIG_INVALID',
      '.acdrc is a symbolic link that leads outside the audited directory; it was not read.',
    );
  }
}

/** `text` with any credential the doctor recognises redacted, or undefined if none. */
function redacted(text: string): string | undefined {
  const lines = text.split('\n');
  let changed = false;
  const out = lines.map((line) => {
    const [hit] = checkSecrets('evidence', line);
    if (!hit?.evidence) return line;
    changed = true;
    return hit.evidence;
  });
  return changed ? out.join('\n') : undefined;
}

/**
 * The doctor redacts credentials only in its own secret findings; another
 * finding on the same line (an unpinned `npx`, a `curl | sh`) quotes the line
 * in full, and an issue id can carry a link target from an instruction file.
 * Agents read this output, so every issue's id, message, recommendation, and
 * evidence is passed through the doctor's own secret detector and redactor.
 * `file` is left as is: it is a path in the audited tree, needed to find the
 * file. Returns the number of fields changed.
 */
export function redactIssueText(report: ContextAuditResult): number {
  let count = 0;
  for (const issue of report.issues) {
    for (const key of ['id', 'message', 'recommendation', 'evidence'] as const) {
      const value = issue[key];
      if (typeof value !== 'string') continue;
      const clean = redacted(value);
      if (clean === undefined) continue;
      issue[key] = clean;
      count++;
    }
  }
  return count;
}

/**
 * The context-file audit for `dir`, in the shape `acd audit --json` prints.
 * Rules from the audited repository's `.acdrc` (ignored files, disabled checks,
 * allowed scripts, size limit) apply, as they do for the engine's CLI. Its
 * output, baseline, and repoPath settings are not used: nothing is written and
 * the audited path is the one the caller chose.
 */
export async function runContext(dir: string): Promise<ContextResult> {
  await assertConfigInside(dir);
  let config;
  try {
    config = await loadConfig(dir);
  } catch (err) {
    throw new AuditRuntimeError('CONFIG_INVALID', err instanceof Error ? err.message : String(err));
  }
  const report = await auditContext(dir, {
    ignoreFiles: config?.rules?.ignoreFiles,
    disabledChecks: config?.rules?.disabledChecks,
    allowedMissingScripts: config?.rules?.allowedMissingScripts,
    maxFileBytes: config?.rules?.maxFileBytes,
  });
  const redactions = redactIssueText(report);
  return { configApplied: config?.rules !== undefined, redactions, report };
}
