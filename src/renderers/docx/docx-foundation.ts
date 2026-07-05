import {
  AlignmentType,
  BuilderElement,
  Document,
  type FileChild,
  HeadingLevel,
  type INumberingOptions,
  LevelFormat,
  Packer,
  Paragraph,
} from 'docx';

import type { ExportRequest } from '../../document/export';
import { exportBuildFingerprint } from '../../export/build-info';
import { exportDiagnosticFingerprint } from '../../export/export-trace';
import { getExportStrings } from '../../localization/strings';
import { exportLayoutProfileForPaper } from '../export-layout-profile';

const MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const DOCX_MIME_TYPE = MIME_TYPE;

export interface DocxFoundationOptions {
  profile?: 'default' | 'wps-clipboard';
  numbering?: INumberingOptions;
}

function addWpsMathFontSetting(document: Document): void {
  const settings = document.Settings as unknown as { root: unknown[] };
  settings.root.push(new BuilderElement({
    children: [new BuilderElement({
      attributes: { val: { key: 'm:val', value: 'Cambria Math' } },
      name: 'm:mathFont',
    })],
    name: 'm:mathPr',
  }));
}

function exportLayoutProfile(
  request: ExportRequest,
  profile: DocxFoundationOptions['profile'] = 'default',
) {
  const base = exportLayoutProfileForPaper(request.options.paper);
  if (profile !== 'wps-clipboard') return base;
  return {
    ...base,
    body: {
      ...base.body,
      lineTwips: 276,
      spacingAfterTwips: 80,
    },
    fonts: {
      ...base.fonts,
      cjk: 'Microsoft YaHei',
      serif: 'Arial',
      symbol: 'Cambria Math',
    },
    textFigure: {
      ...base.textFigure,
      lineTwips: 252,
    },
  };
}

function defaultNumbering(): INumberingOptions {
  return {
    config: [{
      levels: Array.from({ length: 9 }, (_, level) => ({
        alignment: 'start' as const,
        format: LevelFormat.DECIMAL,
        level,
        start: 1,
        style: {
          paragraph: {
            indent: {
              hanging: 360,
              left: 720 + level * 360,
            },
          },
        },
        text: `%${level + 1}.`,
      })),
      reference: 'chat-export-numbering',
    }],
  };
}

export function createDocxFoundation(
  request: ExportRequest,
  children: readonly FileChild[] = [],
  options: DocxFoundationOptions = {},
): Document {
  const language = request.options.language === 'zh-CN' ? 'zh-CN' : 'en-US';
  const strings = getExportStrings(request.options.language);
  const profile = exportLayoutProfile(request, options.profile);
  const codePalette = request.options.codeStyle === 'dark'
    ? { fill: '1F2937', text: 'F9FAFB' }
    : request.options.codeStyle === 'light'
      ? { fill: 'F8FAFC', text: '111827' }
      : { fill: 'EEF2F6', text: '1F2937' };
  const includeTitle = request.selection.scope !== 'single-response';
  const buildFingerprint = exportBuildFingerprint();
  const diagnosticFingerprint = exportDiagnosticFingerprint(request);
  const document = new Document({
    creator: 'ChatGPT2Doc',
    description: `${strings.exportedDescription} ${buildFingerprint} ${diagnosticFingerprint}`,
    keywords: `ChatGPT, local export, DOCX, PDF, ${buildFingerprint}, ${diagnosticFingerprint}`,
    lastModifiedBy: 'ChatGPT2Doc',
    numbering: options.numbering ?? defaultNumbering(),
    subject: `${strings.subject} ${buildFingerprint} ${diagnosticFingerprint}`,
    title: request.document.title,
    styles: {
      default: {
        document: {
          paragraph: {
            spacing: {
              after: profile.body.spacingAfterTwips,
              line: profile.body.lineTwips,
            },
          },
          run: {
            font: {
              ascii: profile.fonts.serif,
              cs: profile.fonts.symbol,
              eastAsia: profile.fonts.cjk,
              hAnsi: profile.fonts.serif,
            },
            language: {
              eastAsia: language,
              value: language,
            },
            size: profile.body.docxHalfPoints,
          },
        },
        title: {
          paragraph: {
            keepNext: true,
            spacing: { after: 240 },
          },
          run: {
            bold: true,
            font: {
              ascii: profile.fonts.serif,
              cs: profile.fonts.symbol,
              eastAsia: profile.fonts.cjk,
              hAnsi: profile.fonts.serif,
            },
            size: profile.title.docxHalfPoints,
          },
        },
      },
      paragraphStyles: [
        ...Array.from({ length: 3 }, (_, index) => ({
          id: `Heading${index + 1}`,
          name: `heading ${index + 1}`,
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          paragraph: {
            keepLines: true,
            keepNext: true,
            spacing: {
              after: index === 0 ? 160 : index === 1 ? 120 : 80,
              before: index === 0 ? 320 : index === 1 ? 240 : 160,
            },
          },
          run: {
            bold: true,
            color: index === 0 ? '17365D' : index === 1 ? '1F4E79' : '365F91',
            font: {
              ascii: profile.fonts.serif,
              cs: profile.fonts.symbol,
              eastAsia: profile.fonts.cjk,
              hAnsi: profile.fonts.serif,
            },
            size: profile.headings[(index + 1) as 1 | 2 | 3].docxHalfPoints,
          },
        })),
        {
          id: 'ChatExportQuote',
          name: 'ChatGPT2Doc Quote',
          paragraph: {
            indent: { left: 240 },
            spacing: { after: 120, before: 40 },
          },
          run: { color: '111827' },
        },
        {
          id: 'ChatExportCode',
          name: 'ChatGPT2Doc Code',
          paragraph: {
            keepLines: true,
            shading: { fill: codePalette.fill },
            spacing: { after: 160, before: 80 },
          },
          run: {
            color: codePalette.text,
            font: {
              ascii: profile.fonts.code,
              cs: profile.fonts.code,
              eastAsia: profile.fonts.cjk,
              hAnsi: profile.fonts.code,
            },
            size: profile.code.docxHalfPoints,
          },
        },
        {
          id: 'ChatExportMath',
          name: 'ChatGPT2Doc Math',
          paragraph: {
            alignment: AlignmentType.CENTER,
            keepLines: true,
            spacing: { after: 160, before: 120 },
          },
        },
        {
          id: 'ChatExportTextFigure',
          name: 'ChatGPT2Doc Text Figure',
          paragraph: {
            keepLines: true,
            spacing: { after: 160, before: 80, line: profile.textFigure.lineTwips },
          },
          run: {
            color: '000000',
            font: {
              ascii: profile.fonts.code,
              cs: profile.fonts.code,
              eastAsia: profile.fonts.cjk,
              hAnsi: profile.fonts.code,
            },
            size: profile.textFigure.docxHalfPoints,
          },
        },
      ],
    },
    sections: [{
      properties: {
        page: {
          margin: {
            bottom: profile.page.marginsTwips.bottom,
            left: profile.page.marginsTwips.left,
            right: profile.page.marginsTwips.right,
            top: profile.page.marginsTwips.top,
          },
          size: profile.page.docxTwips,
        },
      },
      children: [
        ...(includeTitle ? [new Paragraph({
          heading: HeadingLevel.TITLE,
          text: request.document.title,
        })] : []),
        ...children,
      ],
    }],
  });
  if (options.profile === 'wps-clipboard') addWpsMathFontSetting(document);
  return document;
}

export async function renderDocxBlob(
  request: ExportRequest,
  children: readonly FileChild[] = [],
  options: DocxFoundationOptions = {},
): Promise<Blob> {
  const packed = await Packer.toBlob(createDocxFoundation(request, children, options));
  return packed.type === MIME_TYPE
    ? packed
    : new Blob([packed], { type: MIME_TYPE });
}
