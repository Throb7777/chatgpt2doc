import { describe, expect, it } from 'vitest';

import {
  inferTextFigureMathSpans,
  splitInferredMath,
} from '../../src/document/math-inference';

describe('plain-text math inference', () => {
  it('preserves source dialect for actual-export compact formulas', () => {
    expect(splitInferredMath('Zint=Tmα∩RUA', true)).toEqual([{
      fallbackText: 'Zint=Tmα∩RUA',
      kind: 'mathInline',
      provenance: 'inferred',
      source: 'Zint=Tmα∩RUA',
      sourceFormat: 'tex',
    }]);
    expect(splitInferredMath('T_m^α', true)).toEqual([{
      fallbackText: 'T_m^α',
      kind: 'mathInline',
      provenance: 'inferred',
      source: 'T_m^α',
      sourceFormat: 'tex',
    }]);
    expect(splitInferredMath('R_UA', true)).toEqual([{
      fallbackText: 'R_UA',
      kind: 'mathInline',
      provenance: 'inferred',
      source: 'R_{UA}',
      sourceFormat: 'tex',
    }]);
    expect(splitInferredMath('Z_int', true)).toEqual([{
      fallbackText: 'Z_int',
      kind: 'mathInline',
      provenance: 'inferred',
      source: 'Z_{int}',
      sourceFormat: 'tex',
    }]);
    expect(splitInferredMath('v_u(t)', true)).toEqual([{
      fallbackText: 'v_u(t)',
      kind: 'mathInline',
      provenance: 'inferred',
      source: 'v_u(t)',
      sourceFormat: 'tex',
    }]);
  });

  it('keeps ordinary versions, dates, URLs, and prose ratios as text', () => {
    for (const value of [
      'version 2.9.0',
      '2026-06-29',
      'https://example.com/a/b',
      'A/B testing',
      'x = prose',
    ]) {
      expect(splitInferredMath(value, false)).toEqual([{ kind: 'text', value }]);
    }
  });

  it('infers tau intervals with ordinary, NBSP, and zero-width spacing', () => {
    for (const value of [
      '\u03c4\u2208[0,H]',
      '\u03c4 \u2208 [0,H]',
      '\u03c4\u00a0\u2208\u00a0[0,H]',
      '\u03c4\u200b\u2208\u200b[0,H]',
    ]) {
      expect(splitInferredMath(`target ${value} tail`, false)).toEqual([
        { kind: 'text', value: 'target ' },
        {
          fallbackText: value,
          kind: 'mathInline',
          provenance: 'inferred',
          source: '\u03c4\u2208[0,H]',
          sourceFormat: 'tex',
        },
        { kind: 'text', value: ' tail' },
      ]);
    }
  });

  it('anchors complete TeX expressions in text figures without partial tokens', () => {
    const line = String.raw`  \mathcal{T}_m^\alpha | \mathcal{Z}_{int} | \mathcal{R}_{UA}`;
    const spans = inferTextFigureMathSpans(line);

    expect(spans.map((span) => span.node.fallbackText)).toEqual([
      String.raw`\mathcal{T}_m^\alpha`,
      String.raw`\mathcal{Z}_{int}`,
      String.raw`\mathcal{R}_{UA}`,
    ]);
    expect(spans.map((span) => line.slice(span.start, span.end))).toEqual(
      spans.map((span) => span.node.fallbackText),
    );
  });
});
