import {
  beginText,
  endText,
  PDFDocument,
  PDFName,
  type PDFFont,
  type PDFPage,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setFillingColor,
  setFontAndSize,
  setTextMatrix,
  showText,
} from 'pdf-lib';

import type { ExportRequest } from '../../document/export';
import { exportBuildFingerprint } from '../../export/build-info';
import { exportDiagnosticFingerprint } from '../../export/export-trace';
import { getExportStrings } from '../../localization/strings';
import { exportLayoutProfileForPaper, REFERENCE_EXPORT_PROFILE } from '../export-layout-profile';
import { pdfFontkit } from './pdf-fontkit';
import {
  createBrowserPdfFontEnvironment,
  createPdfFontRuns,
  embedPdfFonts,
  type PdfFontEnvironment,
} from './pdf-fonts';

export const PDF_MARGIN = REFERENCE_EXPORT_PROFILE.page.pdfMarginPt;

export const PDF_MIME_TYPE = 'application/pdf';

const pageFontResources = new WeakMap<PDFPage, Map<PDFFont, PDFName>>();

function pageFontResource(page: PDFPage, font: PDFFont): PDFName {
  let resources = pageFontResources.get(page);
  if (!resources) {
    resources = new Map();
    pageFontResources.set(page, resources);
  }
  const existing = resources.get(font);
  if (existing) return existing;
  const created = page.node.newFontDictionary(font.name, font.ref);
  resources.set(font, created);
  return created;
}

export function drawPdfTextRun(
  page: PDFPage,
  text: string,
  options: {
    color?: ReturnType<typeof rgb>;
    font: PDFFont;
    size: number;
    skew?: number;
    x: number;
    y: number;
  },
): void {
  if (!text) return;
  page.pushOperators(
    pushGraphicsState(),
    beginText(),
    setFillingColor(options.color ?? rgb(0.12, 0.14, 0.17)),
    setFontAndSize(pageFontResource(page, options.font), options.size),
    setTextMatrix(1, 0, options.skew ?? 0, 1, options.x, options.y),
    showText(options.font.encodeText(text)),
    endText(),
    popGraphicsState(),
  );
}

export interface PdfFoundationLine {
  size?: number;
  text: string;
}

export interface PdfFoundationOptions {
  fontEnvironment?: PdfFontEnvironment;
}

export function localizedPdfDescription(
  language: ExportRequest['options']['language'],
): string {
  return getExportStrings(language).exportedDescription;
}

export function drawPdfTextLine(
  page: PDFPage,
  text: string,
  y: number,
  size: number,
  fonts: Awaited<ReturnType<typeof embedPdfFonts>>,
  x = PDF_MARGIN,
): void {
  let cursorX = x;
  for (const run of createPdfFontRuns(text, fonts)) {
    drawPdfTextRun(page, run.text, {
      color: rgb(0.12, 0.14, 0.17),
      font: run.font,
      size,
      x: cursorX,
      y,
    });
    cursorX += run.font.widthOfTextAtSize(run.text, size);
  }
}

export interface PdfDocumentFoundation {
  codeFont: PDFFont;
  document: PDFDocument;
  fonts: Awaited<ReturnType<typeof embedPdfFonts>>;
  styleFonts: {
    bold: PDFFont;
    boldItalic: PDFFont;
    italic: PDFFont;
    regular: PDFFont;
  };
}

export async function createPdfDocumentFoundation(
  request: ExportRequest,
  text: string,
  options: PdfFoundationOptions = {},
): Promise<PdfDocumentFoundation> {
  const document = await PDFDocument.create();
  document.registerFontkit(pdfFontkit);
  document.setAuthor('ChatGPT2Doc');
  document.setCreator('ChatGPT2Doc');
  document.setProducer('ChatGPT2Doc');
  document.setTitle(request.document.title);
  const buildFingerprint = exportBuildFingerprint();
  const diagnosticFingerprint = exportDiagnosticFingerprint(request);
  document.setSubject(
    `${getExportStrings(request.options.language).subject} ${buildFingerprint} ${diagnosticFingerprint}`,
  );
  document.setKeywords([
    'ChatGPT',
    'local export',
    'DOCX',
    'PDF',
    buildFingerprint,
    diagnosticFingerprint,
  ]);
  document.setCreationDate(new Date(request.document.exportedAt));
  document.setModificationDate(new Date(request.document.exportedAt));
  const environment = options.fontEnvironment ?? createBrowserPdfFontEnvironment();
  const fonts = await embedPdfFonts(
    document,
    text,
    environment,
  );
  const [codeFont, regular, italic, bold, boldItalic] = await Promise.all([
    'mono',
    'serif-regular',
    'serif-italic',
    'serif-bold',
    'serif-bold-italic',
  ].map(async (id) => document.embedFont(
    await environment.loadFragment(id),
    { subset: true },
  )));
  const styleFonts = {
    bold,
    boldItalic,
    italic,
    regular,
  };
  return { codeFont, document, fonts, styleFonts };
}

export function addPdfPage(
  document: PDFDocument,
  paper: ExportRequest['options']['paper'],
): PDFPage {
  const { points } = exportLayoutProfileForPaper(paper).page;
  return document.addPage([points.width, points.height]);
}

export async function createPdfFoundation(
  request: ExportRequest,
  lines: readonly PdfFoundationLine[] = [],
  options: PdfFoundationOptions = {},
): Promise<PDFDocument> {
  const description = localizedPdfDescription(request.options.language);
  const allText = [request.document.title, description, ...lines.map(({ text }) => text)]
    .join('\n');
  const { document, fonts } = await createPdfDocumentFoundation(
    request,
    allText,
    options,
  );
  const page = addPdfPage(document, request.options.paper);
  const profile = exportLayoutProfileForPaper(request.options.paper);
  let y = page.getHeight() - PDF_MARGIN;

  drawPdfTextLine(page, request.document.title, y, profile.title.fontSizePt, fonts);
  y -= 34;
  drawPdfTextLine(page, description, y, 9, fonts);
  y -= 28;
  for (const line of lines) {
    drawPdfTextLine(page, line.text, y, line.size ?? profile.body.fontSizePt, fonts);
    y -= (line.size ?? profile.body.fontSizePt) * 1.5;
  }

  return document;
}

export async function renderPdfBlob(
  request: ExportRequest,
  lines: readonly PdfFoundationLine[] = [],
  options: PdfFoundationOptions = {},
): Promise<Blob> {
  const document = await createPdfFoundation(request, lines, options);
  return savePdfBlob(document);
}

export async function savePdfBlob(document: PDFDocument): Promise<Blob> {
  const bytes = await document.save({ useObjectStreams: false });
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return new Blob([buffer], { type: PDF_MIME_TYPE });
}
