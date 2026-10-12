// Characters JSON.stringify leaves raw that can still mislead a terminal or a
// reader: C1 controls (including the 8-bit CSI), bidirectional controls,
// zero-width and other invisible characters, line and paragraph separators,
// variation selectors, and Unicode tag characters. Kept as numeric ranges so
// no invisible character appears in this source file.
const UNSAFE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0080, 0x009f], // C1 controls
  [0x00ad, 0x00ad], // soft hyphen
  [0x034f, 0x034f], // combining grapheme joiner
  [0x061c, 0x061c], // Arabic letter mark
  [0x115f, 0x1160], // Hangul fillers
  [0x17b4, 0x17b5], // Khmer inherent vowels
  [0x180e, 0x180e], // Mongolian vowel separator
  [0x200b, 0x200f], // zero-width characters, LRM, RLM
  [0x2028, 0x202e], // line/paragraph separators, bidi embeddings and overrides
  [0x2060, 0x206f], // word joiner, invisible operators, bidi isolates
  [0x3164, 0x3164], // Hangul filler
  [0xfe00, 0xfe0f], // variation selectors
  [0xfeff, 0xfeff], // zero-width no-break space
  [0xffa0, 0xffa0], // halfwidth Hangul filler
  [0xfff9, 0xfffb], // interlinear annotation controls
  [0xe0000, 0xe007f], // tag characters
  [0xe0100, 0xe01ef], // variation selectors supplement
];

function isUnsafe(codePoint: number): boolean {
  return UNSAFE_RANGES.some(([start, end]) => codePoint >= start && codePoint <= end);
}

function replaceUnsafe(text: string, replace: (char: string, codePoint: number) => string): string {
  let out = '';
  for (const char of text) {
    const codePoint = char.codePointAt(0) ?? 0;
    out += isUnsafe(codePoint) ? replace(char, codePoint) : char;
  }
  return out;
}

function escapeUnits(char: string): string {
  let out = '';
  for (let i = 0; i < char.length; i++) {
    out += `\\u${char.charCodeAt(i).toString(16).padStart(4, '0')}`;
  }
  return out;
}

/** JSON.stringify, with characters that could hide or reorder text escaped; the value is unchanged. */
export function safeJson(value: unknown, space?: number): string {
  return replaceUnsafe(JSON.stringify(value, null, space), escapeUnits);
}

/** Replace the characters above with visible `<U+XXXX>` markers. */
export function markInvisible(text: string): string {
  return replaceUnsafe(
    text,
    (_char, codePoint) => `<U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}>`,
  );
}
