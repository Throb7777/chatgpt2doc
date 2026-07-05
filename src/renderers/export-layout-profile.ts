import type { ExportRequest } from '../document/export';

export interface ExportTextStyleToken {
  docxHalfPoints: number;
  fontSizePt: number;
}

export interface ExportPageToken {
  docxTwips: {
    height: number;
    width: number;
  };
  marginsTwips: {
    bottom: number;
    left: number;
    right: number;
    top: number;
  };
  points: {
    height: number;
    width: number;
  };
  pdfMarginPt: number;
}

export interface ExportLayoutProfile {
  body: ExportTextStyleToken & {
    lineTwips: number;
    spacingAfterTwips: number;
  };
  code: ExportTextStyleToken;
  fonts: {
    cjk: string;
    code: string;
    serif: string;
    symbol: string;
  };
  headings: Record<1 | 2 | 3 | 4 | 5 | 6, ExportTextStyleToken>;
  math: ExportTextStyleToken;
  page: ExportPageToken;
  sourceLink: ExportTextStyleToken & {
    docxColor: string;
    pdfColor: {
      blue: number;
      green: number;
      red: number;
    };
  };
  textFigure: ExportTextStyleToken & {
    lineTwips: number;
  };
  title: ExportTextStyleToken;
}

const ONE_INCH_TWIPS = 1440;

export const REFERENCE_EXPORT_PROFILE: ExportLayoutProfile = {
  body: {
    docxHalfPoints: 24,
    fontSizePt: 12,
    lineTwips: 288,
    spacingAfterTwips: 160,
  },
  code: {
    docxHalfPoints: 19,
    fontSizePt: 9,
  },
  fonts: {
    cjk: 'Noto Sans CJK SC',
    code: 'Cascadia Mono',
    serif: 'Noto Serif',
    symbol: 'OpenSymbol',
  },
  headings: {
    1: { docxHalfPoints: 36, fontSizePt: 18 },
    2: { docxHalfPoints: 32, fontSizePt: 16 },
    3: { docxHalfPoints: 28, fontSizePt: 14 },
    4: { docxHalfPoints: 24, fontSizePt: 12 },
    5: { docxHalfPoints: 23, fontSizePt: 11.5 },
    6: { docxHalfPoints: 22, fontSizePt: 11 },
  },
  math: {
    docxHalfPoints: 24,
    fontSizePt: 12,
  },
  page: {
    docxTwips: {
      height: 15840,
      width: 12240,
    },
    marginsTwips: {
      bottom: ONE_INCH_TWIPS,
      left: ONE_INCH_TWIPS,
      right: ONE_INCH_TWIPS,
      top: ONE_INCH_TWIPS,
    },
    pdfMarginPt: 72,
    points: {
      height: 792,
      width: 612,
    },
  },
  sourceLink: {
    docxColor: '1E4FBC',
    docxHalfPoints: 20,
    fontSizePt: 10,
    pdfColor: {
      blue: 0.736,
      green: 0.312,
      red: 0.112,
    },
  },
  textFigure: {
    docxHalfPoints: 22,
    fontSizePt: 11,
    lineTwips: 264,
  },
  title: {
    docxHalfPoints: 40,
    fontSizePt: 20,
  },
};

export const A4_EXPORT_PROFILE: ExportLayoutProfile = {
  ...REFERENCE_EXPORT_PROFILE,
  page: {
    ...REFERENCE_EXPORT_PROFILE.page,
    docxTwips: {
      height: 16837,
      width: 11905,
    },
    points: {
      height: 841.89,
      width: 595.28,
    },
  },
};

export function exportLayoutProfileForPaper(
  paper: ExportRequest['options']['paper'],
): ExportLayoutProfile {
  return paper === 'letter' ? REFERENCE_EXPORT_PROFILE : A4_EXPORT_PROFILE;
}
