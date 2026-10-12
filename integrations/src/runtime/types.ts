import type { AuditJson as ReadinessAuditJson } from '../../../vendor/agent-readiness-kit/src/types.js';
import type {
  AuditResult as ContextAuditResult,
  ContextIssue,
  Severity,
} from '../../../vendor/agent-context-doctor/src/types.js';

export type { ReadinessAuditJson, ContextAuditResult, ContextIssue, Severity };

export type EngineKey = 'readiness' | 'context';

export const ENGINE_KEYS: readonly EngineKey[] = ['readiness', 'context'];

export interface EngineInfo {
  name: string;
  version: string;
  commit: string;
  repository: string;
}

/**
 * Error codes are stable so agents and MCP clients can branch on them. The
 * message is for people and may change.
 */
export type ErrorCode =
  | 'INVALID_PATH'
  | 'PATH_NOT_FOUND'
  | 'NOT_A_DIRECTORY'
  | 'OUTSIDE_ROOT'
  | 'CONFIG_INVALID'
  | 'ENGINE_FAILED'
  | 'TIMEOUT'
  | 'OUTPUT_TOO_LARGE'
  | 'BUSY'
  | 'REPORT_NOT_FOUND'
  | 'USAGE';

export interface AuditError {
  code: ErrorCode;
  message: string;
}

export type EngineOutcome<T> =
  { status: 'ok'; result: T } | { status: 'error'; error: AuditError } | { status: 'skipped' };

export interface ContextResult {
  /** True when the audited repository's `.acdrc` supplied rules. */
  configApplied: boolean;
  /**
   * Issue fields (`evidence`, `message`) in which a credential was redacted.
   * Zero means the report is exactly the engine's output.
   */
  redactions: number;
  /** The engine's own JSON report (`acd audit --json`), with credentials redacted. */
  report: ContextAuditResult;
}

export interface CombinedReport {
  schemaVersion: 1;
  tool: { name: 'agent-readiness'; version: string };
  /** Absolute, symlink-resolved directory that was audited. */
  target: string;
  engines: Record<EngineKey, EngineInfo>;
  /** The kit's own JSON report (`ark audit --json`), unchanged. */
  readiness: EngineOutcome<ReadinessAuditJson>;
  context: EngineOutcome<ContextResult>;
}
