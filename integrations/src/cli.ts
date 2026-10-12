import { parseArgs } from 'node:util';
import { toDisplayText } from '../../vendor/agent-context-doctor/src/text/displayText.js';
import { auditDirectory, isComplete } from './runtime/audit.js';
import { unsupportedNode } from './runtime/nodeVersion.js';
import { toAuditError } from './runtime/errors.js';
import { ENGINE_PROVENANCE } from './runtime/provenance.generated.js';
import { safeJson } from './runtime/json.js';
import { formatMarkdown } from './runtime/report.js';
import { ENGINE_KEYS, type EngineKey } from './runtime/types.js';
import { TOOL_VERSION } from './runtime/version.js';

const USAGE = `Usage: agent-readiness audit [path] [options]

Audit a repository for AI coding agents with the bundled agent-readiness-kit
(readiness score) and agent-context-doctor (instruction and config files).
Read-only: nothing is written to the audited repository and nothing is sent
over the network.

Options:
  --format <markdown|json>   Output format (default: markdown)
  --only <readiness|context> Run one engine instead of both
  --max-items <n>            Items per Markdown section (default: 25)
  --timeout <seconds>        Stop after this many seconds (default: 300)
  --canonical                Fail unless the path is absolute and contains no symlink
  -h, --help                 Show this help

Other commands:
  agent-readiness version    Print the runtime and engine versions as JSON

Exit codes: 0 audit completed, 1 audit or path error, 2 usage error.
`;

class UsageError extends Error {}

function positiveInt(value: string | undefined, name: string, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 100_000) {
    throw new UsageError(`--${name} must be a whole number from 1 to 100000.`);
  }
  return n;
}

export async function main(argv: string[]): Promise<number> {
  const runtimeProblem = unsupportedNode();
  if (runtimeProblem) {
    process.stderr.write(`${runtimeProblem}\n`);
    return 1;
  }
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        format: { type: 'string' },
        only: { type: 'string' },
        'max-items': { type: 'string' },
        timeout: { type: 'string' },
        canonical: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n\n${USAGE}`);
    return 2;
  }
  const { values, positionals } = parsed;
  const [command, ...rest] = positionals;

  if (values.help || command === 'help' || command === undefined) {
    process.stdout.write(USAGE);
    return command === undefined && !values.help ? 2 : 0;
  }
  if (command === 'version') {
    if (rest.length > 0) {
      process.stderr.write(`version takes no arguments.\n\n${USAGE}`);
      return 2;
    }
    process.stdout.write(
      JSON.stringify({ version: TOOL_VERSION, engines: ENGINE_PROVENANCE }, null, 2) + '\n',
    );
    return 0;
  }
  if (command !== 'audit') {
    process.stderr.write(`Unknown command: ${JSON.stringify(command)}\n\n${USAGE}`);
    return 2;
  }

  let format: 'markdown' | 'json';
  let engines: EngineKey[];
  let maxItems: number;
  let timeoutSeconds: number;
  try {
    if (rest.length > 1) throw new UsageError('Give at most one path.');
    const f = values.format ?? 'markdown';
    if (f !== 'markdown' && f !== 'json')
      throw new UsageError('--format must be markdown or json.');
    format = f;
    if (values.only !== undefined && !ENGINE_KEYS.includes(values.only as EngineKey)) {
      throw new UsageError('--only must be readiness or context.');
    }
    engines = values.only ? [values.only as EngineKey] : [...ENGINE_KEYS];
    maxItems = positiveInt(values['max-items'], 'max-items', 25);
    timeoutSeconds = positiveInt(values.timeout, 'timeout', 300);
  } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    process.stderr.write(`${err.message}\n\n${USAGE}`);
    return 2;
  }

  const timer = setTimeout(() => {
    const error = {
      code: 'TIMEOUT',
      message: `The audit did not finish within ${timeoutSeconds} seconds.`,
    };
    if (format === 'json') process.stdout.write(safeJson({ error }, 2) + '\n');
    else process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }, timeoutSeconds * 1000);

  try {
    const report = await auditDirectory(rest[0] ?? '.', {
      engines,
      requireCanonical: values.canonical === true,
    });
    process.stdout.write(
      format === 'json' ? safeJson(report, 2) + '\n' : formatMarkdown(report, { maxItems }),
    );
    return isComplete(report) ? 0 : 1;
  } catch (err) {
    const error = toAuditError(err);
    if (format === 'json') process.stdout.write(safeJson({ error }, 2) + '\n');
    else process.stderr.write(`Audit failed (${error.code}): ${toDisplayText(error.message)}\n`);
    return 1;
  } finally {
    clearTimeout(timer);
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    process.stderr.write(`Unexpected error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  },
);
