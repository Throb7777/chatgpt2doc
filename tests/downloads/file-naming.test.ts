import { describe, expect, it } from 'vitest';

import {
  createExportFileName,
  DownloadNameRegistry,
  sanitizeWindowsFileName,
} from '../../src/downloads/browser-download';

describe('Windows-safe export file naming', () => {
  it('sanitizes invalid characters, control characters, and trailing dots or spaces', () => {
    expect(sanitizeWindowsFileName('  research<>:"/\\|?*\u0001 report...  '))
      .toBe('research report');
  });

  it('protects Windows reserved device names', () => {
    for (const name of ['CON', 'prn.txt', 'AUX', 'NUL', 'COM1', 'lpt9.docx']) {
      expect(sanitizeWindowsFileName(name)).toBe(`_${name}`);
    }
  });

  it('uses a sanitized title and local timestamp for the default name', () => {
    expect(createExportFileName({
      exportedAt: new Date(2026, 5, 23, 13, 4, 5),
      format: 'pdf',
      title: 'Research: notes?',
    })).toBe('Research notes 2026-06-23_13-04-05.pdf');
  });

  it('sanitizes a preferred name, preserves one extension, and caps length', () => {
    const fileName = createExportFileName({
      exportedAt: new Date(2026, 5, 23, 13, 4, 5),
      format: 'docx',
      preferredName: `${'x'.repeat(250)}.DOCX`,
      title: 'ignored',
    });

    expect(fileName).toHaveLength(180);
    expect(fileName.endsWith('.docx')).toBe(true);
    expect(createExportFileName({
      exportedAt: new Date(),
      format: 'pdf',
      preferredName: 'CON.pdf',
      title: 'ignored',
    })).toBe('_CON.pdf');
  });

  it('uses deterministic session suffixes for repeated names', () => {
    const registry = new DownloadNameRegistry();

    expect(registry.reserve('Report.pdf')).toBe('Report.pdf');
    expect(registry.reserve('report.pdf')).toBe('report (2).pdf');
    expect(registry.reserve('Report.pdf')).toBe('Report (3).pdf');
  });
});
