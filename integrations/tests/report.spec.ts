import { describe, expect, it } from 'vitest';
import { formatMarkdown, md, rankContextIssues, rankReadinessGaps } from '../src/runtime/report';
import type { CombinedReport, ContextIssue, ReadinessAuditJson } from '../src/runtime/types';
import { ENGINE_PROVENANCE } from '../src/runtime/provenance.generated';

function issue(id: string, severity: ContextIssue['severity']): ContextIssue {
  return { id, severity, category: 'x', file: 'AGENTS.md', message: id, recommendation: 'fix' };
}

const readiness: ReadinessAuditJson = {
  repoPath: '/r',
  score: 50,
  categories: [
    {
      id: 'a',
      label: 'A',
      score: 9,
      maxScore: 10,
      findings: [
        { status: 'warn', message: 'a-warn' },
        { status: 'pass', message: 'a-pass' },
      ],
    },
    {
      id: 'b',
      label: 'B',
      score: 2,
      maxScore: 10,
      findings: [
        { status: 'warn', message: 'b-warn' },
        { status: 'fail', message: 'b-fail', files: ['x'] },
      ],
    },
    {
      id: 'c',
      label: 'C',
      score: 9,
      maxScore: 10,
      findings: [{ status: 'fail', message: 'c-fail' }],
    },
  ],
  missing: [],
  recommendations: ['Add tests'],
};

describe('ranking', () => {
  it('orders context issues high to low and keeps engine order within a severity', () => {
    const ranked = rankContextIssues([
      issue('l1', 'low'),
      issue('h1', 'high'),
      issue('m1', 'medium'),
      issue('h2', 'high'),
    ]);
    expect(ranked.map((i) => i.id)).toEqual(['h1', 'h2', 'm1', 'l1']);
  });

  it('orders readiness gaps fail first, then by missing points, and drops passes', () => {
    expect(rankReadinessGaps(readiness).map((g) => g.message)).toEqual([
      'b-fail',
      'c-fail',
      'b-warn',
      'a-warn',
    ]);
  });
});

describe('md', () => {
  it('neutralizes Markdown, HTML, control, and invisible characters', () => {
    const out = md('[x](javascript:1) <img> | `code` *b* \u202E\u200B\n#');
    expect(out).not.toMatch(/<img>|\u202E|\u200B|\n/);
    expect(out).toContain('\\[x\\]');
    expect(out).toContain('&lt;img&gt;');
    expect(out).toContain('\\|');
    expect(out).toContain('&lt;U+202E&gt;');
  });
});

describe('md autolinks', () => {
  it('shows URLs, www hosts, and email addresses as code so they are not clickable', () => {
    expect(md('see https://evil.example/x?a=1 now')).toBe('see ` https://evil.example/x?a=1 ` now');
    expect(md('www.evil.example')).toBe('` www.evil.example `');
    expect(md('mail a.b@evil.example')).toBe('mail ` a.b@evil.example `');
    expect(md('x javascript://`a`|b')).toBe('x `` javascript://`a`\\|b ``');
  });
});

describe('formatMarkdown', () => {
  const base: CombinedReport = {
    schemaVersion: 1,
    tool: { name: 'agent-readiness', version: '0.1.0' },
    target: '/r',
    engines: ENGINE_PROVENANCE,
    readiness: { status: 'ok', result: readiness },
    context: { status: 'error', error: { code: 'CONFIG_INVALID', message: 'bad .acdrc' } },
  };

  it('shows the readiness score and no score for a failed engine', () => {
    const out = formatMarkdown(base);
    expect(out).toContain('| Readiness (agent-readiness-kit) | 50/100 | completed |');
    expect(out).toContain(
      '| Context files (agent-context-doctor) | none | failed: CONFIG_INVALID |',
    );
    expect(out).toContain('CONFIG_INVALID: bad .acdrc');
    expect(out).toContain(ENGINE_PROVENANCE.readiness.commit.slice(0, 7));
  });

  it('limits list lengths and points to the JSON report', () => {
    const out = formatMarkdown(base, { maxItems: 1 });
    expect(out).toContain('- 3 more in the JSON report');
  });

  it('marks skipped engines as not run', () => {
    const out = formatMarkdown({ ...base, context: { status: 'skipped' } });
    expect(out).toContain('| none | not run |');
  });
});
