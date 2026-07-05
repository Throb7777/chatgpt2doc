import { describe, expect, it } from 'vitest';

import type { ChatDocument } from '../../src/document/ast';
import {
  assertExportWithinLimits,
  countDocumentNodes,
  LocalExportJobController,
} from '../../src/export/export-job';

function documentWithParagraphs(count: number): ChatDocument {
  return {
    version: 1,
    exportedAt: '2026-06-23T07:00:00.000Z',
    messages: [{
      content: Array.from({ length: count }, (_, index) => ({
        children: [{ kind: 'text' as const, value: `Paragraph ${index}` }],
        kind: 'paragraph' as const,
      })),
      id: 'assistant-1',
      order: 0,
      role: 'assistant',
      selected: true,
      status: 'complete',
    }],
    source: {
      platform: 'chatgpt',
      capturedAt: '2026-06-23T07:00:00.000Z',
      url: 'https://chatgpt.com/c/export-job',
    },
    title: 'Export Job Fixture',
    warnings: [],
  };
}

describe('local export job controller', () => {
  it('prevents duplicate execution while a job is active', async () => {
    const controller = new LocalExportJobController();
    let release!: () => void;
    const first = controller.run(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return 'done';
    });
    await Promise.resolve();

    await expect(controller.run(async () => 'duplicate')).resolves.toEqual({
      status: 'busy',
    });
    release();
    await expect(first).resolves.toEqual({ status: 'completed', value: 'done' });
  });

  it('cancels cooperatively and clears the busy state', async () => {
    const controller = new LocalExportJobController();
    const running = controller.run(({ signal }) => new Promise<string>((resolve, reject) => {
      signal.addEventListener('abort', () => reject(
        new DOMException('Cancelled', 'AbortError'),
      ));
      void resolve;
    }));
    await Promise.resolve();

    controller.cancel();
    await expect(running).resolves.toEqual({ status: 'cancelled' });
    expect(controller.busy).toBe(false);
  });

  it('reports a long deterministic task and completes', async () => {
    const controller = new LocalExportJobController();
    const progress: number[] = [];
    const result = await controller.run(async (context) => {
      for (let index = 0; index < 1_000; index += 1) {
        context.throwIfAborted();
        if (index % 100 === 0) {
          context.report({ completed: index, stage: 'rendering', total: 1_000 });
        }
      }
      return 1_000;
    }, ({ completed }) => progress.push(completed));

    expect(result).toEqual({ status: 'completed', value: 1_000 });
    expect(progress).toEqual([0, 100, 200, 300, 400, 500, 600, 700, 800, 900]);
  });

  it('counts nested nodes and enforces message and node limits', () => {
    const document = documentWithParagraphs(5);

    expect(countDocumentNodes(document)).toBe(10);
    expect(() => assertExportWithinLimits(document, {
      maxMessages: 1,
      maxNodes: 10,
      maxOutputBytes: 100,
    })).not.toThrow();
    expect(() => assertExportWithinLimits(document, {
      maxMessages: 1,
      maxNodes: 9,
      maxOutputBytes: 100,
    })).toThrow('9-node');
  });
});
