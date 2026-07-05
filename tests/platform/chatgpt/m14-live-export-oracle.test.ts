import { readFileSync } from 'node:fs';

import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import type { BlockNode, DocumentNode } from '../../../src/document/ast';
import { parseMessageContentResult } from '../../../src/platform/chatgpt/content-parser';

interface M14Oracle {
  directChromeRevalidation: string;
  evidenceBasis: string;
  fixture: string;
  negativeTextControls: string[];
  requiredMath: string[];
  requiredTextFigureMath: string[];
}

const fixtureHtml = readFileSync(
  new URL('../../fixtures/chatgpt/m14-live-export-shapes.html', import.meta.url),
  'utf8',
);
const oracle = JSON.parse(readFileSync(
  new URL('../../fixtures/chatgpt/m14-live-export-oracle.json', import.meta.url),
  'utf8',
)) as M14Oracle;

function parseFixture(): BlockNode[] {
  const document = new JSDOM(fixtureHtml, {
    url: 'https://chatgpt.com/c/m14-sanitized-shape',
  }).window.document;
  const message = document.querySelector<HTMLElement>('[data-message-id="m14-live-export-shapes"]');
  if (!message) throw new Error('M14 live-export-shape fixture message is missing.');
  return parseMessageContentResult(message, 'm14-live-export-shapes').content;
}

function walkNodes(nodes: DocumentNode[]): DocumentNode[] {
  const walked: DocumentNode[] = [];
  for (const node of nodes) {
    walked.push(node);
    if ('children' in node) walked.push(...walkNodes(node.children));
    if (node.kind === 'orderedList' || node.kind === 'unorderedList') {
      for (const item of node.items) walked.push(...walkNodes(item.children));
    }
    if (node.kind === 'table') {
      for (const row of [node.header, ...node.rows]) {
        for (const cell of row.cells) walked.push(...walkNodes(cell.children));
      }
    }
  }
  return walked;
}

describe('M14 live-export-shape baseline oracle', () => {
  it('contains only independently authored, sanitized target shapes', () => {
    const searchableFixture = `${fixtureHtml}\n${new JSDOM(fixtureHtml).window.document.body.textContent ?? ''}`;
    expect(oracle).toMatchObject({
      directChromeRevalidation: 'required-in-M14.6',
      evidenceBasis: 'sanitized-reconstruction-from-verified-live-export-shapes',
      fixture: 'm14-live-export-shapes.html',
    });
    expect(fixtureHtml).not.toContain('小论文2.5');
    expect(fixtureHtml).not.toContain('融合运行状态评估指标');
    expect(fixtureHtml).not.toContain('下载.docx');
    for (const shape of [
      ...oracle.requiredMath,
      ...oracle.requiredTextFigureMath,
      ...oracle.negativeTextControls,
    ]) {
      expect(searchableFixture).toContain(shape);
    }
  });

  it('preserves fragmented formulas and text-figure math as semantic nodes', () => {
    const nodes = walkNodes(parseFixture());
    const math = nodes.filter((node) => node.kind === 'mathInline' || node.kind === 'mathBlock');
    const mathFallbacks = math.map((node) => node.kind === 'mathInline' || node.kind === 'mathBlock'
      ? node.fallbackText
      : '');
    const textFigures = nodes.filter((node) =>
      node.kind === 'codeBlock' && node.presentation === 'textFigure');
    const figureText = textFigures.map((figure) => figure.kind === 'codeBlock'
      ? figure.value
      : '').join('\n');

    expect(mathFallbacks).toEqual(expect.arrayContaining([
      'τ∈[0,H]',
      'x_u(t)=(c_u,s_u,v_u,q_u)',
      'q=1→q=2→q=3→q=4',
      'Zint=Tmα∩RUA',
      '𝒵int',
    ]));
    expect(mathFallbacks.filter((value) => value === 'τ∈[0,H]')).toHaveLength(4);
    expect(math).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fallbackText: 'q=1→q=2→q=3→q=4',
        kind: 'mathBlock',
      }),
    ]));
    expect(textFigures.every((figure) => figure.kind === 'codeBlock'
      && figure.mathTokens === undefined)).toBe(true);
    expect(figureText).toContain('T_m^α');
    expect(figureText).toContain('Z_int');
    expect(figureText).toContain('R_UA');
    expect(figureText).toContain('v_u(t)');
    expect(figureText).not.toContain('\\mathcal');
  });

  it('keeps the negative controls as ordinary text', () => {
    const nodes = walkNodes(parseFixture());
    const text = nodes
      .filter((node) => node.kind === 'text')
      .map((node) => node.kind === 'text' ? node.value : '')
      .join(' ');
    const mathText = nodes
      .filter((node) => node.kind === 'mathInline' || node.kind === 'mathBlock')
      .map((node) => node.kind === 'mathInline' || node.kind === 'mathBlock'
        ? node.fallbackText
        : '')
      .join(' ');

    for (const control of oracle.negativeTextControls) {
      expect(text).toContain(control);
      expect(mathText).not.toContain(control);
    }
  });

  it('declares the exact extraction contract for M14.3', () => {
    expect(oracle.requiredMath).toEqual([
      'τ∈[0,H]',
      'x_u(t)=(c_u,s_u,v_u,q_u)',
      'q=1→q=2→q=3→q=4',
      'Zint=Tmα∩RUA',
      '\\mathcal{Z}_{int}',
    ]);
    expect(oracle.negativeTextControls).toHaveLength(4);
  });
});
