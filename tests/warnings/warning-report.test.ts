import { describe, expect, it } from 'vitest';

import type { DocumentWarning } from '../../src/document/ast';
import { aggregateWarnings } from '../../src/warnings/warning-report';

describe('degradation warning report', () => {
  it('groups duplicates while preserving counts and provenance', () => {
    const warnings: DocumentWarning[] = [
      {
        code: 'image-unavailable',
        message: 'Image unavailable.',
        provenance: {
          messageId: 'message-1',
          nodePath: [2],
          sourceKind: 'image',
          stage: 'asset',
        },
      },
      {
        code: 'image-unavailable',
        message: 'Image unavailable.',
        provenance: {
          messageId: 'message-2',
          nodePath: [4],
          sourceKind: 'image',
          stage: 'asset',
        },
      },
    ];

    expect(aggregateWarnings(warnings)).toEqual([{
      code: 'image-unavailable',
      count: 2,
      message: 'Image unavailable.',
      provenance: warnings.map(({ provenance }) => provenance),
    }]);
  });

  it('covers the complete image, math, unsupported, and partial-collection matrix', () => {
    const warnings: DocumentWarning[] = [
      {
        code: 'image-unavailable',
        message: 'image',
        provenance: { sourceKind: 'image', stage: 'asset' },
      },
      {
        code: 'incomplete-collection',
        message: 'collection',
        provenance: { sourceKind: 'conversation', stage: 'extraction' },
      },
      {
        code: 'math-fallback',
        message: 'math',
        provenance: { sourceKind: 'mathBlock', stage: 'render' },
      },
      {
        code: 'unsupported-content',
        message: 'unsupported',
        provenance: { sourceKind: 'video', stage: 'extraction' },
      },
    ];

    expect(aggregateWarnings(warnings).map(({ code }) => code).sort()).toEqual([
      'image-unavailable',
      'incomplete-collection',
      'math-fallback',
      'unsupported-content',
    ]);
  });
});
