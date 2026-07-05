import { readFile, stat } from 'node:fs/promises';

import { PDFDocument } from 'pdf-lib';

const artifactDir = 'docs/qa-artifacts/m13-5';
const report = JSON.parse(await readFile(`${artifactDir}/m13-5-report.json`, 'utf8'));
const word = JSON.parse(await readFile(
  `${artifactDir}/m13-5-word365-acceptance.json`,
  'utf8',
));
const checks = [];

function check(id, passed, detail) {
  checks.push({ detail, id, passed });
  if (!passed) throw new Error(`${id}: ${detail}`);
}

check('docx-math-coverage', report.mathObjects === 31, `${report.mathObjects} OMML objects`);
check('docx-display-math', report.displayMathParagraphs === 20,
  `${report.displayMathParagraphs} display equations`);
check('docx-terminal-tau', report.plainTauTextRuns === 0,
  `${report.plainTauTextRuns} plain tau runs`);
check('docx-text-figure-math', report.textFigureMathObjects === 4,
  `${report.textFigureMathObjects} anchored text-figure equations`);
check('docx-text-figures', report.textFigureParagraphs === 2,
  `${report.textFigureParagraphs} text figures`);
check('docx-warnings', report.warningCodes.length === 0,
  `${report.warningCodes.length} warnings`);

const docx = await stat(`${artifactDir}/m13-5-docx-parity.docx`);
check('docx-artifact', docx.size === report.size, `${docx.size} bytes`);

const pdfBytes = await readFile(`${artifactDir}/m13-5-word365.pdf`);
const pdf = await PDFDocument.load(pdfBytes);
check('word-version', word.productVersion === '16.0.20026.20182', word.productVersion);
check('word-open', word.openedWithoutRepair === true, 'opened without repair prompt');
check('word-source', word.sourceDocumentUnchanged === true, 'source DOCX was not saved');
check('word-pages', pdf.getPageCount() === word.pages && word.pages === 2,
  `${pdf.getPageCount()} pages`);
check('word-equations', word.editableEquationObjects === report.mathObjects,
  `${word.editableEquationObjects} editable equation objects`);
check('word-display-math', word.displayMathParagraphs === report.displayMathParagraphs,
  `${word.displayMathParagraphs} display equations`);
check('word-visual-review', word.visualReview === 'PASS', word.visualNotes);

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
