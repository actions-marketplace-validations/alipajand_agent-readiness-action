import { runContext, runReadiness } from './engines.js';
import { toAuditError } from './errors.js';
import { resolveTarget, type ResolveTargetOptions } from './paths.js';
import { ENGINE_PROVENANCE } from './provenance.generated.js';
import type { CombinedReport, EngineKey, EngineOutcome } from './types.js';
import { TOOL_VERSION } from './version.js';

export interface AuditOptions extends ResolveTargetOptions {
  /** Which engines to run. Defaults to both. */
  engines?: readonly EngineKey[];
}

async function settle<T>(run: boolean, fn: () => Promise<T>): Promise<EngineOutcome<T>> {
  if (!run) return { status: 'skipped' };
  try {
    return { status: 'ok', result: await fn() };
  } catch (err) {
    return { status: 'error', error: toAuditError(err) };
  }
}

/**
 * Run the selected engines on one directory. A failure in one engine is
 * reported in its own section and does not stop the other. Path problems throw
 * an `AuditRuntimeError` because neither engine could run.
 */
export async function auditDirectory(
  input: string,
  options: AuditOptions = {},
): Promise<CombinedReport> {
  const target = await resolveTarget(input, options);
  const selected = new Set(options.engines ?? ['readiness', 'context']);

  // Sequential on purpose: both engines walk the same tree, and running them
  // one after the other keeps peak memory and open file handles lower.
  const readiness = await settle(selected.has('readiness'), () => runReadiness(target));
  const context = await settle(selected.has('context'), () => runContext(target));

  return {
    schemaVersion: 1,
    tool: { name: 'agent-readiness', version: TOOL_VERSION },
    target,
    engines: ENGINE_PROVENANCE,
    readiness,
    context,
  };
}

/** True when every engine that was asked to run produced a result. */
export function isComplete(report: CombinedReport): boolean {
  return report.readiness.status !== 'error' && report.context.status !== 'error';
}
