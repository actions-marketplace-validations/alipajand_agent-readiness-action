import type { AuditError, ErrorCode } from './types.js';

export class AuditRuntimeError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AuditRuntimeError';
  }

  toJSON(): AuditError {
    return { code: this.code, message: this.message };
  }
}

/** A structured error for any thrown value, without its stack. */
export function toAuditError(error: unknown, fallback: ErrorCode = 'ENGINE_FAILED'): AuditError {
  if (error instanceof AuditRuntimeError) return error.toJSON();
  const message = error instanceof Error ? error.message : String(error);
  return { code: fallback, message };
}
