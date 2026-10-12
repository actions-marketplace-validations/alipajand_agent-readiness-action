import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { AuditRuntimeError } from './errors.js';

const MAX_PATH_LENGTH = 4096;
// Control characters cannot appear in a path someone meant to type.
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

function isWithin(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate);
  if (rel === '') return true;
  return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

async function realDirectory(input: string, base: string): Promise<string> {
  const absolute = path.resolve(base, input);
  let resolved: string;
  try {
    resolved = await realpath(absolute);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      throw new AuditRuntimeError('PATH_NOT_FOUND', `No such directory: ${absolute}`);
    }
    throw new AuditRuntimeError('INVALID_PATH', `Cannot resolve ${absolute}: ${String(code)}`);
  }
  if (!(await stat(resolved)).isDirectory()) {
    throw new AuditRuntimeError('NOT_A_DIRECTORY', `Not a directory: ${absolute}`);
  }
  return resolved;
}

export interface ResolveTargetOptions {
  /** Base for a relative `input`. Defaults to the current directory. */
  cwd?: string;
  /**
   * Fail when the path is not already canonical (absolute, with no symlink in
   * it). The MCP worker uses this to detect a path that changed after the
   * server authorized it.
   */
  requireCanonical?: boolean;
  /**
   * Directories the caller may audit. The target, after resolving symlinks,
   * must be one of them or inside one. When empty, any existing directory is
   * allowed: the CLI uses that, because the person typed the path.
   */
  roots?: readonly string[];
}

/**
 * Resolve the directory to audit. Symlinks are resolved before the root check,
 * so a link inside an authorized root cannot point the audit somewhere else.
 */
export async function resolveTarget(
  input: string,
  options: ResolveTargetOptions = {},
): Promise<string> {
  if (typeof input !== 'string' || input.length === 0) {
    throw new AuditRuntimeError('INVALID_PATH', 'The path is empty.');
  }
  if (input.length > MAX_PATH_LENGTH || CONTROL_CHARS.test(input)) {
    throw new AuditRuntimeError(
      'INVALID_PATH',
      'The path is too long or contains control characters.',
    );
  }
  const cwd = options.cwd ?? process.cwd();
  const roots = options.roots ?? [];
  const outside = () =>
    new AuditRuntimeError(
      'OUTSIDE_ROOT',
      `The path is outside the authorized roots: ${roots.join(', ')}`,
    );

  // Check the path as written before touching the filesystem, so an answer
  // never reveals whether something exists outside the roots.
  const realRoots = await Promise.all(roots.map((r) => realDirectory(r, cwd)));
  const lexical = path.resolve(cwd, input);
  if (roots.length > 0 && !roots.some((r) => isWithin(path.resolve(cwd, r), lexical))) {
    if (!realRoots.some((r) => isWithin(r, lexical))) throw outside();
  }

  const target = await realDirectory(input, cwd);
  if (options.requireCanonical && target !== lexical) {
    throw new AuditRuntimeError('OUTSIDE_ROOT', 'The path changed after it was authorized.');
  }
  // A symlink inside a root can still lead outside it; the message does not
  // say where it leads.
  if (roots.length > 0 && !realRoots.some((root) => isWithin(root, target))) throw outside();
  return target;
}
