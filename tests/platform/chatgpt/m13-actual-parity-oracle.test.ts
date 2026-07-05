import { readFileSync } from 'node:fs';

import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import type { BlockNode, DocumentNode } from '../../../src/document/ast';
import { parseMessageContentResult } from '../../../src/platform/chatgpt/content-parser';

interface M13Oracle {
  fixture: string;
  negativeTextControls: string[];
  privacyBoundary: string;
  requiredDisplayMath: string[];
  requiredExplicitMath: string[];
  requiredInlineMath: string[];
  requiredTextFigureLabels: string[];
}

const fixtureHtml = readFileSync(
  new URL('../../fixtures/chatgpt/m13-actual-parity-shapes.html', import.meta.url),
  'utf8',
);
const oracle = JSON.parse(readFileSync(
  new URL('../../fixtures/chatgpt/m13-actual-parity-oracle.json', import.meta.url),
  'utf8',
)) as M13Oracle;

function parseFixture(): BlockNode[] {
  const document = new JSDOM(fixtureHtml, {
    url: 'https://chatgpt.com/c/m13-actual-parity',
  }).window.document;
  const message = document.querySelector<HTMLElement>('[data-message-id="m13-actual-parity"]');
  if (!message) throw new Error('M13 parity fixture message is missing.');
  return parseMessageContentResult(message, 'm13-actual-parity').content;
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

describe('M13 actual-export parity semantic oracle', () => {
  it('uses only a sanitized derived fixture with the required target shapes', () => {
    const visibleText = new JSDOM(fixtureHtml).window.document.body.textContent ?? '';
    const searchableFixture = `${fixtureHtml}\n${visibleText}`;
    expect(oracle).toMatchObject({
      fixture: 'm13-actual-parity-shapes.html',
      privacyBoundary: 'sanitized-derived-fixture-only',
    });
    expect(fixtureHtml).not.toContain('4_融合运行状态评估指标');
    expect(fixtureHtml).not.toContain('下载.docx');
    expect(fixtureHtml).not.toContain('下载 (1).pdf');
    for (const label of [
      ...oracle.requiredInlineMath,
      ...oracle.requiredDisplayMath,
      ...oracle.requiredExplicitMath,
      ...oracle.requiredTextFigureLabels,
      ...oracle.negativeTextControls,
    ]) {
      expect(searchableFixture).toContain(label);
    }
  });

  it('satisfies the source-preserving math target before renderer work', () => {
    const blocks = parseFixture();
    const nodes = walkNodes(blocks);
    const inlineMath = nodes.filter((node) => node.kind === 'mathInline');
    const displayMath = nodes.filter((node) => node.kind === 'mathBlock');
    const textFigures = nodes.filter((node) =>
      node.kind === 'codeBlock' && node.presentation === 'textFigure');
    const text = nodes
      .filter((node) => node.kind === 'text')
      .map((node) => node.kind === 'text' ? node.value : '')
      .join(' ');

    expect(inlineMath).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fallbackText: 'τ∈[0,H]',
        kind: 'mathInline',
        provenance: 'inferred',
      }),
      expect.objectContaining({
        fallbackText: '𝒵int',
        kind: 'mathInline',
        provenance: 'explicit',
        source: '\\mathcal{Z}_{int}',
      }),
      expect.objectContaining({
        fallbackText: 'Zint=Tmα∩RUA',
        kind: 'mathInline',
        provenance: 'inferred',
      }),
    ]));
    expect(inlineMath).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ fallbackText: 'Zint=Tmα' }),
    ]));
    expect(displayMath).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fallbackText: 'Zint↓q=3',
        kind: 'mathBlock',
        provenance: 'inferred',
      }),
    ]));
    expect(textFigures).toHaveLength(2);
    for (const label of oracle.requiredTextFigureLabels) {
      expect(textFigures.some((figure) =>
        figure.kind === 'codeBlock' && figure.value.includes(label))).toBe(true);
    }
    expect(textFigures.every((figure) => figure.kind === 'codeBlock'
      && figure.mathTokens === undefined)).toBe(true);
    for (const control of oracle.negativeTextControls) {
      expect(text).toContain(control);
    }
  });

  it('declares the target semantic contract for M13.3 and later tasks', () => {
    expect(oracle.requiredInlineMath).toEqual([
      'τ∈[0,H]',
      'Zint=Tmα∩RUA',
    ]);
    expect(oracle.requiredDisplayMath).toEqual(['Zint↓q=3']);
    expect(oracle.requiredTextFigureLabels).toEqual(expect.arrayContaining([
      'T_m^α',
      'Z_int',
      'R_UA',
      'control action',
      'v_u(t)',
    ]));
  });
});
