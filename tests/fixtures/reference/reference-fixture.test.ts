import { readFileSync } from 'node:fs';

import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

interface FixtureContract {
  messageCount: number;
  invariants: {
    headingLevels: number[];
    mathExpressionCount: number;
    tableBodyRows: number;
    tableColumns: number;
    longParagraphLabels: string[];
  };
  privacy: {
    allowsRemoteConversion: boolean;
    allowsTelemetry: boolean;
    containsPrivateData: boolean;
    requiresAccount: boolean;
    requiresNetwork: boolean;
  };
}

const html = readFileSync(
  new URL('./synthetic-conversation.html', import.meta.url),
  'utf8',
);
const contract = JSON.parse(
  readFileSync(new URL('./expected-document.json', import.meta.url), 'utf8'),
) as FixtureContract;
const document = new JSDOM(html).window.document;

describe('reference fixture contract', () => {
  it('contains two ordered semantic messages', () => {
    const messages = [...document.querySelectorAll('[data-message-author-role]')];

    expect(messages).toHaveLength(contract.messageCount);
    expect(messages.map((message) => message.getAttribute('data-message-author-role'))).toEqual([
      'user',
      'assistant',
    ]);
    expect(messages.map((message) => message.getAttribute('data-message-id'))).toEqual([
      'fixture-user-1',
      'fixture-assistant-1',
    ]);
  });

  it('covers the required rich-content structures', () => {
    const headingLevels = [...document.querySelectorAll('h1, h2, h3')]
      .map((heading) => Number(heading.tagName.slice(1)))
      .filter((level, index, levels) => levels.indexOf(level) === index)
      .sort();
    const tableRows = [...document.querySelectorAll('table tbody tr')];

    expect(headingLevels).toEqual(contract.invariants.headingLevels);
    expect(document.querySelectorAll('[data-math-source]')).toHaveLength(
      contract.invariants.mathExpressionCount,
    );
    expect(tableRows).toHaveLength(contract.invariants.tableBodyRows);
    expect(tableRows.every((row) => row.children.length === contract.invariants.tableColumns)).toBe(
      true,
    );
    expect(tableRows[1]?.children[3]?.textContent).toBe('');
    expect(document.querySelector('pre code')?.textContent).toContain('<>&"${1}');
    expect(document.querySelector('svg')?.getAttribute('aria-label')).toBe(
      'Synthetic three-bar chart',
    );
  });

  it('is deterministic, local, and synthetic', () => {
    const text = document.body.textContent ?? '';

    for (const label of contract.invariants.longParagraphLabels) {
      expect(text).toContain(`${label}:`);
    }
    expect(document.querySelectorAll('script, link, iframe')).toHaveLength(0);
    expect(contract.privacy).toEqual({
      allowsRemoteConversion: false,
      allowsTelemetry: false,
      containsPrivateData: false,
      requiresAccount: false,
      requiresNetwork: false,
    });
  });
});
