import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import JSZip from 'jszip';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { chromium } from 'playwright-core';

const root = process.cwd();
const extensionPath = path.join(root, '.output', 'edge-mv3');
const outputRoot = path.join(root, 'docs', 'qa-artifacts', 'm7-4');
const downloadsRoot = path.join(outputRoot, 'downloads');
const tempRoot = path.join(root, 'tmp', 'm7-4-edge');
const executablePath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const fixture = await readFile(
  path.join(root, 'tests', 'fixtures', 'browser', 'm7-2-conversation.html'),
  'utf8',
);

function assertInside(parent, target) {
  const relative = path.relative(parent, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Unsafe generated path: ${target}`);
  }
}

await mkdir(downloadsRoot, { recursive: true });
for (const entry of await readdir(downloadsRoot)) {
  const generated = path.join(downloadsRoot, entry);
  assertInside(downloadsRoot, generated);
  await rm(generated, { force: true, recursive: true });
}
await mkdir(tempRoot, { recursive: true });

function selectFolder() {
  const helperPath = path.join(root, 'scripts', 'select-folder.ps1');
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      helperPath,
      '-FolderPath',
      extensionPath,
      '-BrowserName',
      'msedge',
    ], { windowsHide: true });
    let stderr = '';
    let stdout = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`Folder selector failed (${code}): ${stderr || stdout}`));
    });
  });
}

async function loadExtension(context) {
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto('edge://extensions/');
  const developerMode = page.locator('#developer-mode');
  if (!(await developerMode.isChecked())) await developerMode.check();
  const button = page.getByRole('button', { name: /Load unpacked|加载解压缩/ });
  await button.waitFor({ state: 'visible' });
  const selection = selectFolder();
  await button.click();
  await selection;
  await page.waitForTimeout(2_000);
  const extensions = await page.evaluate(() =>
    globalThis.chrome.developerPrivate.getExtensionsInfo());
  const extension = extensions.find(({ name }) => name === 'ChatGPT2Doc');
  if (!extension || extension.state !== 'ENABLED') {
    throw new Error(`Edge extension did not load enabled: ${JSON.stringify(extension)}`);
  }
  if ((extension.manifestErrors ?? []).length || (extension.runtimeErrors ?? []).length) {
    throw new Error(`Edge extension errors: ${JSON.stringify(extension)}`);
  }
  return extension.id;
}

async function docxEvidence(file) {
  const archive = await JSZip.loadAsync(await readFile(file));
  const xml = await archive.file('word/document.xml')?.async('string');
  if (!xml) throw new Error('DOCX document.xml is missing.');
  const media = Object.keys(archive.files).filter(
    (name) => name.startsWith('word/media/') && !name.endsWith('/'),
  );
  return {
    equations: (xml.match(/<m:oMath(?:Para)?>/gu) ?? []).length,
    hasExportControls: xml.includes('Export response'),
    media,
    text: xml.replace(/<[^>]+>/gu, ' '),
  };
}

async function pdfText(file) {
  const pdf = await getDocument({
    data: new Uint8Array(await readFile(file)),
    isEvalSupported: false,
    useSystemFonts: false,
    useWorkerFetch: false,
  }).promise;
  const pages = [];
  for (let number = 1; number <= pdf.numPages; number += 1) {
    const content = await (await pdf.getPage(number)).getTextContent();
    pages.push(content.items.map((item) => 'str' in item ? item.str : '').join(' '));
  }
  return pages.join('\n');
}

const profilePath = await mkdtemp(path.join(tempRoot, 'profile-'));
let context;
try {
  context = await chromium.launchPersistentContext(profilePath, {
    acceptDownloads: true,
    downloadsPath: downloadsRoot,
    executablePath,
    headless: false,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      '--disable-sync',
      '--no-first-run',
      '--window-position=-32000,-32000',
    ],
  });
  const extensionId = await loadExtension(context);
  await context.route('https://invalid.example.test/**', (route) => route.abort('failed'));
  await context.route('https://chatgpt.com/**', (route) => route.fulfill({
    body: fixture,
    contentType: 'text/html; charset=utf-8',
    status: 200,
  }));

  const consoleErrors = [];
  const pageErrors = [];
  const requests = [];
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => {
    requests.push({ method: request.method(), url: request.url() });
  });
  await page.goto('https://chatgpt.com/c/m7-4-edge');
  const conversation = page.locator('[data-chat-export-floating-panel] .chat-export-floating-panel');
  await conversation.waitFor();
  await page.screenshot({ path: path.join(outputRoot, 'edge-actions.png') });

  await page.locator('[data-chat-export-settings-button]').click();
  let dialog = page.locator('[data-chat-export-settings] [role="dialog"]');
  await dialog.waitFor();
  await dialog.locator('select').nth(0).selectOption('zh-CN');
  await dialog.locator('input[type="text"]').fill('Edge Smoke');
  await dialog.locator('select').nth(1).selectOption('letter');
  await dialog.locator('button').last().click();
  await dialog.waitFor({ state: 'detached' });
  await page.reload();
  await conversation.waitFor();

  await page.locator('[data-chat-export-settings-button]').click();
  dialog = page.locator('[data-chat-export-settings] [role="dialog"]');
  await dialog.waitFor();
  const persistedSettings = {
    fileName: await dialog.locator('input[type="text"]').inputValue(),
    language: await dialog.locator('select').nth(0).inputValue(),
    paper: await dialog.locator('select').nth(1).inputValue(),
  };
  await dialog.locator('button').nth(1).click();

  async function exportFormat(format) {
    const pending = page.waitForEvent('download', { timeout: 120_000 });
    await conversation.locator(`[data-chat-export-format="${format}"]`).click();
    const download = await pending;
    const destination = path.join(downloadsRoot, `edge-smoke.${format}`);
    await download.saveAs(destination);
    const completed = page.locator('[data-chat-export-progress="completed"]');
    await completed.waitFor({ timeout: 120_000 });
    const warningCount = await completed.locator('.chat-export-warning-report li').count();
    await completed.locator('button').last().click();
    await completed.waitFor({ state: 'detached' });
    return {
      bytes: (await readFile(destination)).byteLength,
      file: path.relative(root, destination).replaceAll('\\', '/'),
      sha256: createHash('sha256').update(await readFile(destination)).digest('hex'),
      suggestedName: download.suggestedFilename(),
      warningCount,
    };
  }

  const docx = await exportFormat('docx');
  const pdf = await exportFormat('pdf');
  const docxContent = await docxEvidence(path.join(downloadsRoot, 'edge-smoke.docx'));
  const pdfContent = await pdfText(path.join(downloadsRoot, 'edge-smoke.pdf'));
  const compactDocx = docxContent.text.replace(/\s+/gu, '');
  const compactPdf = pdfContent.replace(/\s+/gu, '');
  const unexpectedConsoleErrors = consoleErrors.filter(
    (message) => message !== 'Failed to load resource: net::ERR_FAILED',
  );
  const unexpectedExternalRequests = requests.filter(({ url }) =>
    url.startsWith('http')
    && !url.startsWith('https://chatgpt.com/')
    && !url.startsWith('https://invalid.example.test/'));
  const checks = [
    {
      name: 'settings-persist',
      passed: JSON.stringify(persistedSettings) === JSON.stringify({
        fileName: 'Edge Smoke',
        language: 'zh-CN',
        paper: 'letter',
      }),
    },
    {
      name: 'docx-download',
      passed: docx.bytes > 0 && docx.suggestedName === 'Edge Smoke.docx',
    },
    {
      name: 'docx-content',
      passed: compactDocx.includes('USER_PROMPT_ALPHA')
        && compactDocx.includes('ASSISTANT_BETA')
        && compactDocx.includes('中文研究内容')
        && docxContent.media.length === 1
        && docxContent.equations >= 2
        && !docxContent.hasExportControls
        && docx.warningCount === 2,
    },
    {
      name: 'pdf-download',
      passed: pdf.bytes > 0 && pdf.suggestedName === 'Edge Smoke.pdf',
    },
    {
      name: 'pdf-content',
      passed: compactPdf.includes('USER_PROMPT_ALPHA')
        && compactPdf.includes('ASSISTANT_BETA')
        && compactPdf.includes('中文研究内容'),
    },
    {
      name: 'runtime-errors',
      passed: pageErrors.length === 0
        && unexpectedConsoleErrors.length === 0
        && unexpectedExternalRequests.length === 0,
    },
  ];
  const report = {
    browser: {
      executablePath,
      extensionId,
      userAgent: await page.evaluate(() => navigator.userAgent),
    },
    checks,
    downloads: { docx, pdf },
    persistedSettings,
    runtime: {
      consoleErrors,
      expectedFixtureNetworkFailure: 'https://invalid.example.test/missing.png',
      pageErrors,
      unexpectedConsoleErrors,
      unexpectedExternalRequests,
    },
    summary: {
      failed: checks.filter(({ passed }) => !passed).length,
      passed: checks.filter(({ passed }) => passed).length,
      total: checks.length,
    },
  };
  await writeFile(
    path.join(outputRoot, 'edge-smoke-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
  process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
  if (report.summary.failed > 0) {
    throw new Error(
      `M7.4 checks failed: ${checks.filter(({ passed }) => !passed)
        .map(({ name }) => name).join(', ')}`,
    );
  }
} finally {
  await context?.close().catch(() => {});
  assertInside(tempRoot, profilePath);
  await rm(profilePath, { force: true, recursive: true });
}
