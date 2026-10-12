import { toDisplayText } from '../../../vendor/agent-context-doctor/src/text/displayText.js';
import { markInvisible } from './json.js';
import type {
  CombinedReport,
  ContextIssue,
  EngineInfo,
  EngineOutcome,
  ReadinessAuditJson,
  Severity,
} from './types.js';

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

/** Context issues ordered high → low, keeping the engine's order within a severity. */
export function rankContextIssues(issues: readonly ContextIssue[]): ContextIssue[] {
  return issues
    .map((issue, index) => ({ issue, index }))
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.issue.severity] - SEVERITY_RANK[b.issue.severity] || a.index - b.index,
    )
    .map(({ issue }) => issue);
}

export interface ReadinessGap {
  categoryId: string;
  category: string;
  status: 'fail' | 'warn';
  message: string;
  files: string[];
  /** Points the category is missing (maxScore - score). */
  pointsMissing: number;
}

/**
 * Readiness checks that did not pass: failures before warnings, then the
 * categories missing the most points first. The kit reports pass/warn/fail,
 * not a severity, so no severity is invented here.
 */
export function rankReadinessGaps(result: ReadinessAuditJson): ReadinessGap[] {
  const gaps: Array<ReadinessGap & { order: number }> = [];
  let order = 0;
  for (const c of result.categories) {
    for (const f of c.findings) {
      if (f.status === 'pass') continue;
      gaps.push({
        categoryId: c.id,
        category: c.label,
        status: f.status,
        message: f.message,
        files: f.files ?? [],
        pointsMissing: c.maxScore - c.score,
        order: order++,
      });
    }
  }
  return gaps
    .sort(
      (a, b) =>
        (a.status === b.status ? 0 : a.status === 'fail' ? -1 : 1) ||
        b.pointsMissing - a.pointsMissing ||
        a.order - b.order,
    )
    .map(({ order: _order, ...gap }) => gap);
}

/**
 * Untrusted text made safe to show on one line: control characters become
 * spaces, and invisible or reordering characters become `<U+XXXX>` markers.
 */
export function display(value: string): string {
  return markInvisible(toDisplayText(value));
}

// Markdown punctuation that could start a link, image, emphasis, HTML, code
// span, or table cell when it comes from an audited file.
const MARKDOWN_SPECIAL = /[\\`*_[\]<>|&~#!]/g;

// Text GitHub would turn into a link by itself (GFM extended autolinks: URLs,
// `www.` hosts, and email addresses).
const AUTOLINK = /(?:[a-z][a-z0-9+.-]*:\/\/|www\.)[^\s]*|[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gi;

function escapeText(value: string): string {
  return value.replace(MARKDOWN_SPECIAL, (ch) =>
    ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '&' ? '&amp;' : `\\${ch}`,
  );
}

/**
 * A code span: its content is shown literally and never becomes a link.
 *
 * Only `|` is escaped, so the span cannot end a table cell. Backslashes are
 * left alone: a code span shows them as typed, and a GFM table treats every
 * `\|` as an escaped pipe whatever precedes it, so `a\` followed by `|`
 * renders as `a\|` in one cell.
 */
function codeSpan(value: string): string {
  const longest = Math.max(0, ...(value.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(longest + 1);
  return `${fence} ${value.split('|').join('\\|')} ${fence}`;
}

/**
 * Untrusted text for one line of Markdown: no control, invisible, or markup
 * characters, and URL-like text shown as code so it is not clickable.
 */
export function md(value: string): string {
  const text = display(value);
  let out = '';
  let last = 0;
  for (const match of text.matchAll(AUTOLINK)) {
    out += escapeText(text.slice(last, match.index)) + codeSpan(match[0]);
    last = match.index + match[0].length;
  }
  return out + escapeText(text.slice(last));
}

function engineLine(info: EngineInfo): string {
  return `${info.name} ${info.version} (${info.commit.slice(0, 7)})`;
}

function outcomeLine(outcome: EngineOutcome<unknown>): string {
  if (outcome.status === 'ok') return 'completed';
  if (outcome.status === 'skipped') return 'not run';
  return `failed: ${outcome.error.code}`;
}

export interface MarkdownOptions {
  /** Most items to list per section. The JSON report always has everything. */
  maxItems?: number;
}

/** A Markdown summary of the combined report. Every audited string is escaped. */
export function formatMarkdown(report: CombinedReport, options: MarkdownOptions = {}): string {
  const max = options.maxItems ?? 25;
  const out: string[] = [];
  const { readiness, context } = report;

  out.push('# Agent readiness audit', '');
  out.push(`- Target: ${md(report.target)}`);
  out.push(`- Readiness engine: ${md(engineLine(report.engines.readiness))}`);
  out.push(`- Context engine: ${md(engineLine(report.engines.context))}`);
  out.push(`- Runtime: ${report.tool.name} ${report.tool.version}`, '');

  out.push('## Scores', '');
  out.push('| Audit | Score | Status |', '| --- | --- | --- |');
  out.push(
    `| Readiness (agent-readiness-kit) | ${
      readiness.status === 'ok' ? `${readiness.result.score}/100` : 'none'
    } | ${outcomeLine(readiness)} |`,
  );
  out.push(
    `| Context files (agent-context-doctor) | ${
      context.status === 'ok'
        ? `${context.result.report.score.total}/100 (${context.result.report.score.grade})`
        : 'none'
    } | ${outcomeLine(context)} |`,
  );
  out.push('');

  const errors: string[] = [];
  if (readiness.status === 'error') {
    errors.push(`- Readiness: ${readiness.error.code}: ${md(readiness.error.message)}`);
  }
  if (context.status === 'error') {
    errors.push(`- Context files: ${context.error.code}: ${md(context.error.message)}`);
  }
  if (errors.length > 0) {
    out.push('## Errors', '', 'No score is reported for an engine that failed.', '', ...errors, '');
  }

  if (readiness.status === 'ok') {
    const r = readiness.result;
    out.push('## Readiness categories', '');
    if (r.ecosystems && r.ecosystems.length > 0) {
      out.push(`Detected ecosystems: ${r.ecosystems.map(md).join(', ')}`, '');
    }
    out.push('| Category | Score |', '| --- | --- |');
    for (const c of r.categories) out.push(`| ${md(c.label)} | ${c.score}/${c.maxScore} |`);
    out.push('');

    const gaps = rankReadinessGaps(r);
    out.push(`## Readiness checks not passing (${gaps.length})`, '');
    if (gaps.length === 0) out.push('Every readiness check passed.');
    for (const g of gaps.slice(0, max)) {
      const files = g.files.length > 0 ? ` (${g.files.slice(0, 5).map(md).join(', ')})` : '';
      out.push(`- ${g.status} · ${md(g.category)}: ${md(g.message)}${files}`);
    }
    if (gaps.length > max) out.push(`- ${gaps.length - max} more in the JSON report`);
    out.push('');
  }

  if (context.status === 'ok') {
    const c = context.result.report;
    const issues = rankContextIssues(c.issues);
    out.push(
      `## Context file issues (${c.summary.high} high, ${c.summary.medium} medium, ${c.summary.low} low)`,
      '',
    );
    out.push(
      `Files checked: ${c.summary.fileCount}${
        context.result.configApplied ? ' (rules from the repository .acdrc applied)' : ''
      }`,
      '',
    );
    if (issues.length === 0) out.push('No issues found.');
    for (const i of issues.slice(0, max)) {
      const where = i.line !== undefined ? `${i.file}:${i.line}` : i.file;
      out.push(`- ${i.severity} · ${md(where)} · ${md(i.id)}: ${md(i.message)}`);
      out.push(`  - Recommendation: ${md(i.recommendation)}`);
    }
    if (issues.length > max) out.push(`- ${issues.length - max} more in the JSON report`);
    out.push('');
  }

  if (readiness.status === 'ok' && readiness.result.recommendations.length > 0) {
    const recs = readiness.result.recommendations;
    out.push('## Readiness recommendations', '');
    for (const rec of recs.slice(0, max)) out.push(`- ${md(rec)}`);
    if (recs.length > max) out.push(`- ${recs.length - max} more in the JSON report`);
    out.push('');
  }

  out.push(
    'Scores and findings come from the deterministic engines listed above. Nothing was written to the audited repository.',
  );
  return out.join('\n') + '\n';
}
