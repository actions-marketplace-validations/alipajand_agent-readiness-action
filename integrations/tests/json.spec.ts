import { describe, expect, it } from 'vitest';
import { markInvisible, safeJson } from '../src/runtime/json';
import { md } from '../src/runtime/report';

// Built from code points so no invisible character appears in this file.
const C1_CSI = String.fromCodePoint(0x9b);
const RLO = String.fromCodePoint(0x202e);
const LINE_SEP = String.fromCodePoint(0x2028);
const ALM = String.fromCodePoint(0x061c);
const VS16 = String.fromCodePoint(0xfe0f);
const VS_SUPP = String.fromCodePoint(0xe0101);
const HANGUL_FILLER = String.fromCodePoint(0x3164);
const ALL = [C1_CSI, RLO, LINE_SEP, ALM, VS16, VS_SUPP, HANGUL_FILLER];

describe('safeJson', () => {
  it('escapes characters that hide or reorder text and keeps the value', () => {
    const value = { path: `a${ALL.join('b')}c`, n: 1 };
    const text = safeJson(value, 2);
    for (const ch of ALL) expect(text.includes(ch)).toBe(false);
    expect(text).toContain('\\u009b');
    expect(text).toContain('\\udb40\\udd01');
    expect(JSON.parse(text)).toEqual(value);
  });
});

describe('markInvisible and md', () => {
  it('shows each character as a visible marker', () => {
    expect(markInvisible(`x${RLO}y`)).toBe('x<U+202E>y');
    expect(markInvisible(`x${VS_SUPP}`)).toBe('x<U+E0101>');
    const out = md(`file${ALL.join('')}.md`);
    for (const ch of ALL) expect(out.includes(ch)).toBe(false);
    expect(out).toContain('&lt;U+3164&gt;');
  });
});
