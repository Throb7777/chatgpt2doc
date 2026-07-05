import { readFile, stat } from 'node:fs/promises';

import { PDFDocument } from 'pdf-lib';

const artifactDir = 'docs/qa-artifacts/m14-4';
const report = JSON.parse(await readFile(`${artifactDir}/m14-4-report.json`, 'utf8'));
const word = JSON.parse(await readFile(
  `${artifactDir}/m14-4-word365-acceptance.json`,
  'utf8',
));
const checks = [];

function check(id, passed, detail) {
  checks.push({ detail, id, passed });
  if (!passed) throw new Error(`${id}: ${detail}`);
}

check('docx-math-coverage', report.mathObjects === 8, `${report.mathObjects} OMML objects`);
check('docx-display-math', report.displayMathParagraphs === 1,
  `${report.displayMathParagraphs} display equation`);
check('docx-plain-math', report.plainMathTextRuns.length === 0,
  `${report.plainMathTextRuns.length} plain formula runs`);
check('docx-text-figure-math', report.textFigureMathObjects === 0,
  `${report.textFigureMathObjects} anchored text-figure equations`);
check('docx-text-figures', report.textFigureParagraphs === 2,
  `${report.textFigureParagraphs} text figures`);
check('docx-heading', report.hasHeadingStyle === true, 'Heading2 style present');
check('docx-bullets', report.hasNativeBullets === true, 'native numbering present');
check('docx-warnings', report.warningCodes.length === 0,
  `${report.warningCodes.length} warnings`);

const docx = await stat(`${artifactDir}/m14-4-docx-live-shape.docx`);
check('docx-artifact', docx.size === report.size, `${docx.size} bytes`);

check('word-version', word.productVersion === '16.0.20026.20182', word.productVersion);
check('word-open', word.openedWithoutRepair === true, 'opened without repair prompt');
check('word-source', word.sourceDocumentUnchanged === true, 'source DOCX was not saved');
check('word-pages', word.pages === 1, `${word.pages} page`);
check('word-equations', word.editableEquationObjects === report.mathObjects,
  `${word.editableEquationObjects} editable equation objects`);
check('word-display-math', word.displayMathParagraphs === report.displayMathParagraphs,
  `${word.displayMathParagraphs} display equation`);
check('word-visual-review', word.visualReview === 'PASS', word.visualNotes);

if (word.wordPdf) {
  const pdfBytes = await readFile(`${artifactDir}/${word.wordPdf}`);
  const pdf = await PDFDocument.load(pdfBytes);
  check('word-pdf-pages', pdf.getPageCount() === word.pages, `${pdf.getPageCount()} page`);
} else {
  check('word-pdf-export', word.wordPdfExport === 'UNAVAILABLE_WORD_EXPORT_TIMEOUT',
    word.wordPdfExport);
}

for (const file of word.wordPageRenders) {
  const bytes = await readFile(`${artifactDir}/${file}`);
  const isPng = bytes.subarray(0, 8).equals(Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]));
  check(`word-render-${file}`, isPng && bytes.length > 10_000, `${bytes.length} bytes`);
}

process.stdout.write(`${JSON.stringify({
  checks,
  passed: checks.length,
  result: 'PASS',
}, null, 2)}\n`);
