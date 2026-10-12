import { describe, expect, it } from 'vitest';
import { unsupportedNode } from '../src/runtime/nodeVersion';

describe('unsupportedNode', () => {
  it('accepts Node.js 22.12 and later', () => {
    for (const v of ['22.12.0', '22.13.1', '23.0.0', '24.11.0', '30.1.0']) {
      expect(unsupportedNode(v)).toBeUndefined();
    }
  });

  it('explains older versions', () => {
    for (const v of ['22.11.0', '20.19.0', '18.0.0']) {
      expect(unsupportedNode(v)).toMatch(/needs Node\.js 22\.12 or later; this is Node\.js/);
    }
  });
});
