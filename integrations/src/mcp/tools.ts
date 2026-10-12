import * as z from 'zod';
import { display, rankContextIssues, rankReadinessGaps } from '../runtime/report.js';
import type { EngineInfo } from '../runtime/types.js';
import type { StoredReport } from './store.js';

// Strings in tool results come from the audited repository. They are bounded
// so one long line cannot flood the client's context window.
export const MAX_STRING = 2000;
const MAX_FILES_PER_ITEM = 20;

/**
 * Audited text for a structured result: one line, control and invisible
 * characters shown as markers, and bounded in length.
 */
export function clip(value: string): string {
  const text = display(value);
  return text.length > MAX_STRING ? `${text.slice(0, MAX_STRING)}… [truncated]` : text;
}

const engineSchema = z.object({ name: z.string(), version: z.string(), commit: z.string() });

function engineOf(info: EngineInfo) {
  return { name: info.name, version: info.version, commit: info.commit };
}

export const pathInput = z.object({
  path: z
    .string()
    .min(1)
    .max(4096)
    .optional()
    .describe(
      'Directory to audit. Relative paths resolve from the first authorized root. Defaults to that root.',
    ),
  max_findings: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe('Most findings to return; get_audit_report pages through the rest.'),
});

// ── audit_repository ──────────────────────────────────────────────────────

const readinessItem = z.object({
  category_id: z.string(),
  category: z.string(),
  status: z.enum(['pass', 'warn', 'fail']),
  message: z.string(),
  files: z.array(z.string()),
});

export const readinessOutput = z.object({
  report_id: z.string(),
  target: z.string(),
  engine: engineSchema,
  score: z.number(),
  ecosystems: z.array(z.string()),
  categories: z.array(
    z.object({ id: z.string(), label: z.string(), score: z.number(), max_score: z.number() }),
  ),
  findings: z.array(readinessItem),
  total_findings: z.number(),
  recommendations: z.array(z.string()),
  truncated: z.boolean(),
});

export function summarizeReadiness(
  stored: StoredReport,
  max: number,
): z.infer<typeof readinessOutput> {
  const { report } = stored;
  if (report.readiness.status !== 'ok') throw new Error('readiness result missing');
  const r = report.readiness.result;
  const gaps = rankReadinessGaps(r);
  return {
    report_id: stored.id,
    target: report.target,
    engine: engineOf(report.engines.readiness),
    score: r.score,
    ecosystems: r.ecosystems ?? [],
    categories: r.categories.map((c) => ({
      id: c.id,
      label: c.label,
      score: c.score,
      max_score: c.maxScore,
    })),
    findings: gaps.slice(0, max).map((g) => ({
      category_id: g.categoryId,
      category: clip(g.category),
      status: g.status,
      message: clip(g.message),
      files: g.files.slice(0, MAX_FILES_PER_ITEM).map(clip),
    })),
    total_findings: gaps.length,
    recommendations: r.recommendations.slice(0, max).map(clip),
    truncated: gaps.length > max || r.recommendations.length > max,
  };
}

// ── audit_agent_context ───────────────────────────────────────────────────

const contextItem = z.object({
  id: z.string(),
  severity: z.enum(['high', 'medium', 'low']),
  category: z.string(),
  file: z.string(),
  line: z.number().optional(),
  message: z.string(),
  recommendation: z.string(),
  evidence: z.string().optional(),
});

export const contextOutput = z.object({
  report_id: z.string(),
  target: z.string(),
  engine: engineSchema,
  score: z.object({ total: z.number(), max: z.number(), grade: z.string() }),
  summary: z.object({
    file_count: z.number(),
    issue_count: z.number(),
    high: z.number(),
    medium: z.number(),
    low: z.number(),
  }),
  config_applied: z.boolean(),
  files: z.array(
    z.object({
      path: z.string(),
      kind: z.string(),
      bytes: z.number(),
      skipped: z.string().optional(),
    }),
  ),
  issues: z.array(contextItem),
  total_issues: z.number(),
  truncated: z.boolean(),
});

function toContextItem(i: {
  id: string;
  severity: 'high' | 'medium' | 'low';
  category: string;
  file: string;
  line?: number;
  message: string;
  recommendation: string;
  evidence?: string;
}): z.infer<typeof contextItem> {
  return {
    id: i.id,
    severity: i.severity,
    category: i.category,
    file: clip(i.file),
    ...(i.line !== undefined ? { line: i.line } : {}),
    message: clip(i.message),
    recommendation: clip(i.recommendation),
    ...(i.evidence !== undefined ? { evidence: clip(i.evidence) } : {}),
  };
}

export function summarizeContext(stored: StoredReport, max: number): z.infer<typeof contextOutput> {
  const { report } = stored;
  if (report.context.status !== 'ok') throw new Error('context result missing');
  const c = report.context.result.report;
  const issues = rankContextIssues(c.issues);
  return {
    report_id: stored.id,
    target: report.target,
    engine: engineOf(report.engines.context),
    score: { total: c.score.total, max: c.score.max, grade: c.score.grade },
    summary: {
      file_count: c.summary.fileCount,
      issue_count: c.summary.issueCount,
      high: c.summary.high,
      medium: c.summary.medium,
      low: c.summary.low,
    },
    config_applied: report.context.result.configApplied,
    files: c.files.slice(0, 100).map((f) => ({
      path: clip(f.path),
      kind: f.kind,
      bytes: f.bytes,
      ...(f.skipped ? { skipped: f.skipped } : {}),
    })),
    issues: issues.slice(0, max).map(toContextItem),
    total_issues: issues.length,
    truncated: issues.length > max || c.files.length > 100,
  };
}

// ── get_audit_report ──────────────────────────────────────────────────────

export const reportInput = z.object({
  report_id: z
    .string()
    .uuid()
    .describe('The report_id from audit_repository or audit_agent_context.'),
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(100).default(50),
  include_passing: z
    .boolean()
    .default(false)
    .describe(
      'Readiness reports: also list checks that passed, after the ones that did not. ' +
        'Without it, pages continue the ranked list audit_repository started.',
    ),
  include_raw: z
    .boolean()
    .default(false)
    .describe(
      "Also return the engine's complete JSON report (bounded in size). Its strings are the " +
        'audited text as found, not sanitized; credentials in context issues are redacted.',
    ),
});

export const reportOutput = z.object({
  report_id: z.string(),
  engine: z.enum(['readiness', 'context']),
  target: z.string(),
  total: z.number(),
  offset: z.number(),
  limit: z.number(),
  next_offset: z.number().nullable(),
  readiness_items: z.array(readinessItem).optional(),
  context_items: z.array(contextItem).optional(),
  raw: z.record(z.string(), z.unknown()).optional(),
});

/**
 * One page of a stored report, in the same order as the summary tools:
 * readiness checks that did not pass (fail before warn, most points missing
 * first), then passing checks when asked; context issues high → low.
 */
export function pageReport(
  stored: StoredReport,
  offset: number,
  limit: number,
  includeRaw: boolean,
  includePassing = false,
): z.infer<typeof reportOutput> {
  const { report } = stored;
  const base = {
    report_id: stored.id,
    engine: stored.engine,
    target: report.target,
    offset,
    limit,
  };
  if (stored.engine === 'readiness') {
    if (report.readiness.status !== 'ok') throw new Error('readiness result missing');
    const result = report.readiness.result;
    const gaps = rankReadinessGaps(result).map((g) => ({
      category_id: g.categoryId,
      category: clip(g.category),
      status: g.status as 'fail' | 'warn' | 'pass',
      message: clip(g.message),
      files: g.files.slice(0, MAX_FILES_PER_ITEM).map(clip),
    }));
    const passing = includePassing
      ? result.categories.flatMap((c) =>
          c.findings
            .filter((f) => f.status === 'pass')
            .map((f) => ({
              category_id: c.id,
              category: clip(c.label),
              status: f.status,
              message: clip(f.message),
              files: (f.files ?? []).slice(0, MAX_FILES_PER_ITEM).map(clip),
            })),
        )
      : [];
    const all = [...gaps, ...passing];
    return {
      ...base,
      total: all.length,
      next_offset: offset + limit < all.length ? offset + limit : null,
      readiness_items: all.slice(offset, offset + limit),
      ...(includeRaw ? { raw: result as unknown as Record<string, unknown> } : {}),
    };
  }
  if (report.context.status !== 'ok') throw new Error('context result missing');
  const result = report.context.result.report;
  const all = rankContextIssues(result.issues).map(toContextItem);
  return {
    ...base,
    total: all.length,
    next_offset: offset + limit < all.length ? offset + limit : null,
    context_items: all.slice(offset, offset + limit),
    ...(includeRaw ? { raw: result as unknown as Record<string, unknown> } : {}),
  };
}
