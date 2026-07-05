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
const extensionPath = path.resolve(
  root,
  process.env.CHAT_EXPORT_CHROME_BUILD_DIR ?? path.join('.output', 'chrome-mv3'),
);
const outputRoot = path.join(root, 'docs', 'qa-artifacts', 'm7-2');
const downloadsRoot = path.join(outputRoot, 'downloads');
const tempRoot = path.join(root, 'tmp', 'm7-2-chrome');
const fixture = await readFile(
  path.join(root, 'tests', 'fixtures', 'browser', 'm7-2-conversation.html'),
  'utf8',
);
const executablePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

function assertInside(parent, target) {
  const relative = path.relative(parent, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Unsafe generated path: ${target}`);
  }
}

assertInside(outputRoot, downloadsRoot);
await mkdir(downloadsRoot, { recursive: true });
for (const entry of await readdir(downloadsRoot)) {
  const generatedPath = path.join(downloadsRoot, entry);
  assertInside(downloadsRoot, generatedPath);
  await rm(generatedPath, { force: true, recursive: true });
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
      'chrome',
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
  await page.goto('chrome://extensions/');
  const developerMode = page.locator('extensions-toolbar #devMode');
  if (!(await developerMode.evaluate((element) => element.checked))) {
    await developerMode.focus();
    await page.keyboard.press('Space');
  }
  const button = page.locator('extensions-toolbar #loadUnpacked');
  await button.waitFor({ state: 'visible' });
  const selection = selectFolder();
  await button.click();
  await selection;
  await page.waitForTimeout(2_000);
  const extensions = await page.evaluate(() =>
    globalThis.chrome.developerPrivate.getExtensionsInfo());
  const extension = extensions.find(({ name }) => name === 'ChatGPT2Doc');
  if (!extension || extension.state !== 'ENABLED') {
    throw new Error(`Chrome extension did not load enabled: ${JSON.stringify(extension)}`);
  }
  if ((extension.manifestErrors ?? []).length || (extension.runtimeErrors ?? []).length) {
    throw new Error(`Chrome extension errors: ${JSON.stringify(extension)}`);
  }
  return extension.id;
}

async function docxText(file) {
  const archive = await JSZip.loadAsync(await readFile(file));
  const xml = await archive.file('word/document.xml')?.async('string');
  if (!xml) throw new Error(`DOCX document.xml missing: ${file}`);
  return xml.replace(/<[^>]+>/gu, ' ');
}

async function pdfText(file) {
  const loading = getDocument({
    data: new Uint8Array(await readFile(file)),
    isEvalSupported: false,
    useSystemFonts: false,
    useWorkerFetch: false,
  });
  const pdf = await loading.promise;
  const pages = [];
  for (let number = 1; number <= pdf.numPages; number += 1) {
    const page = await pdf.getPage(number);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => 'str' in item ? item.str : '').join(' '));
  }
  return pages.join('\n');
}

function includesAll(text, values) {
  return values.every((value) => text.includes(value));
}

const profilePath = await mkdtemp(path.join(tempRoot, 'profile-'));
const consoleErrors = [];
const pageErrors = [];
const requests = [];
const downloads = [];
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

  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => {
    requests.push({ method: request.method(), resourceType: request.resourceType(), url: request.url() });
  });
  page.on('download', (download) => {
    downloads.push(download.suggestedFilename());
  });
  await page.goto('https://chatgpt.com/c/m7-2-integration');
  const conversation = page.locator('[data-chat-export-floating-panel] .chat-export-floating-panel');
  await conversation.waitFor();
  await page.evaluate(() => {
    const main = document.querySelector('main');
    const trace = [];
    globalThis.__m72Trace = trace;
    const record = (kind) => {
      if (!main || trace.length >= 80) return;
      trace.push({
        kind,
        scrollHeight: main.scrollHeight,
        scrollTop: main.scrollTop,
      });
    };
    main?.addEventListener('scroll', () => record('scroll'));
    if (main) {
      new MutationObserver(() => record('mutation')).observe(main, {
        attributes: true,
        childList: true,
        subtree: true,
      });
    }
    record('start');
  });
  await page.screenshot({ path: path.join(outputRoot, 'chrome-actions.png') });

  async function dismiss() {
    const panel = page.locator('[data-chat-export-progress]');
    if (await panel.count()) {
      await panel.locator('button').last().click();
      await panel.waitFor({ state: 'detached' });
    }
  }

  async function scrollState() {
    return page.evaluate(() => {
      const main = document.querySelector('main');
      return {
        bodyTop: document.body.scrollTop,
        documentTop: document.documentElement.scrollTop,
        mainTop: main?.scrollTop ?? null,
        windowY: window.scrollY,
      };
    });
  }

  async function scrollToConversationBottom() {
    await page.evaluate(() => {
      const main = document.querySelector('main');
      if (main) main.scrollTop = main.scrollHeight;
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
  }

  async function exportClick(locator, artifactName, options = {}) {
    await dismiss();
    const beforeScroll = options.assertScrollStable ? await scrollState() : null;
    const pending = page.waitForEvent('download', { timeout: 120_000 }).catch(() => null);
    await locator.click();
    const terminalPanel = page.locator(
      '[data-chat-export-progress="completed"], [data-chat-export-progress="failed"]',
    );
    await terminalPanel.waitFor({ state: 'visible', timeout: 120_000 });
    const status = await terminalPanel.getAttribute('data-chat-export-progress');
    if (status === 'failed') {
      const metrics = await page.evaluate(() => ({
        body: {
          clientHeight: document.body.clientHeight,
          scrollHeight: document.body.scrollHeight,
          scrollTop: document.body.scrollTop,
        },
        documentElement: {
          clientHeight: document.documentElement.clientHeight,
          scrollHeight: document.documentElement.scrollHeight,
          scrollTop: document.documentElement.scrollTop,
        },
        main: (() => {
          const main = document.querySelector('main');
          return main ? {
            clientHeight: main.clientHeight,
            overflowY: getComputedStyle(main).overflowY,
            scrollHeight: main.scrollHeight,
            scrollTop: main.scrollTop,
          } : null;
        })(),
        scrollingElement: document.scrollingElement?.tagName ?? null,
        trace: globalThis.__m72Trace ?? [],
      }));
      throw new Error(
        `Browser export failed: ${await terminalPanel.textContent()} ${JSON.stringify(metrics)}`,
      );
    }
    const download = await pending;
    if (!download) {
      throw new Error(
        `Browser export completed without a download event: ${JSON.stringify({
          consoleErrors,
          pageErrors,
          panel: await terminalPanel.textContent(),
        })}`,
      );
    }
    const destination = path.join(downloadsRoot, artifactName);
    await download.saveAs(destination);
    const warningCount = await page.locator('.chat-export-warning-report li').count();
    const suggestedName = download.suggestedFilename();
    const afterScroll = options.assertScrollStable ? await scrollState() : null;
    await dismiss();
    return {
      artifact: path.relative(root, destination).replaceAll('\\', '/'),
      bytes: (await readFile(destination)).byteLength,
      scrollStable: beforeScroll && afterScroll
        ? JSON.stringify(beforeScroll) === JSON.stringify(afterScroll)
        : undefined,
      suggestedName,
      warningCount,
    };
  }

  async function setSettings(values) {
    await page.locator('[data-chat-export-settings-button]').click();
    const dialog = page.locator('[data-chat-export-settings] [role="dialog"]');
    await dialog.waitFor();
    if ('language' in values) await dialog.locator('select').nth(0).selectOption(values.language);
    if ('fileName' in values) await dialog.locator('input[type="text"]').fill(values.fileName);
    if ('paper' in values) await dialog.locator('select').nth(1).selectOption(values.paper);
    if ('theme' in values) await dialog.locator('select').nth(2).selectOption(values.theme);
    if ('codeStyle' in values) await dialog.locator('select').nth(3).selectOption(values.codeStyle);
    if ('includePrompts' in values) {
      const checkbox = dialog.locator('input[type="checkbox"]').nth(0);
      if ((await checkbox.isChecked()) !== values.includePrompts) await checkbox.click();
    }
    await dialog.locator('button').last().click();
    await dialog.waitFor({ state: 'detached' });
  }

  const results = [];
  results.push({
    case: 'full-docx',
    ...await exportClick(
      conversation.locator('[data-chat-export-format="docx"]'),
      'full-conversation.docx',
    ),
  });
  results.push({
    case: 'full-pdf',
    ...await exportClick(
      conversation.locator('[data-chat-export-format="pdf"]'),
      'full-conversation.pdf',
    ),
  });
  results.push({
    case: 'single-docx',
    ...await exportClick(
      page.locator(
        '[data-chat-export-actions="response"][data-chat-export-message-id="assistant-alpha"] '
        + '[data-chat-export-format="docx"]',
      ),
      'single-response.docx',
    ),
  });
  results.push({
    case: 'single-pdf',
    ...await (async () => {
      await scrollToConversationBottom();
      return exportClick(
        page.locator(
          '[data-chat-export-actions="response"][data-chat-export-message-id="assistant-beta"] '
          + '[data-chat-export-format="pdf"]',
        ),
        'single-response.pdf',
        { assertScrollStable: true },
      );
    })(),
  });

  await conversation.getByRole('button', { name: 'Select messages' }).click();
  await page.locator('[data-chat-export-selection="user-beta"] input').check();
  await page.locator('[data-chat-export-selection="assistant-beta"] input').check();
  const selectionBar = page.locator('[data-chat-export-selection-bar]');
  results.push({
    case: 'selected-docx',
    ...await exportClick(
      selectionBar.locator('[data-chat-export-selection-format="docx"]'),
      'selected-messages.docx',
    ),
  });
  results.push({
    case: 'selected-pdf',
    ...await (async () => {
      await scrollToConversationBottom();
      return exportClick(
        selectionBar.locator('[data-chat-export-selection-format="pdf"]'),
        'selected-messages.pdf',
        { assertScrollStable: true },
      );
    })(),
  });
  await selectionBar.getByRole('button', { name: 'Cancel' }).click();

  await setSettings({
    codeStyle: 'dark',
    fileName: 'AI Only',
    includePrompts: false,
    language: 'en',
    paper: 'a4',
    theme: 'dark',
  });
  results.push({
    case: 'assistant-only-docx',
    ...await exportClick(
      conversation.locator('[data-chat-export-format="docx"]'),
      'assistant-only.docx',
    ),
  });

  await setSettings({
    codeStyle: 'document',
    fileName: '研究:导出?',
    includePrompts: true,
    language: 'zh-CN',
    paper: 'letter',
    theme: 'light',
  });
  results.push({
    case: 'localized-letter-pdf',
    ...await exportClick(
      conversation.locator('[data-chat-export-format="pdf"]'),
      'localized-letter.pdf',
    ),
  });

  await page.reload();
  await conversation.waitFor();
  await page.locator('[data-chat-export-settings-button]').click();
  const persistedDialog = page.locator('[data-chat-export-settings] [role="dialog"]');
  await persistedDialog.waitFor();
  const persisted = {
    codeStyle: await persistedDialog.locator('select').nth(3).inputValue(),
    fileName: await persistedDialog.locator('input[type="text"]').inputValue(),
    includePrompts: await persistedDialog.locator('input[type="checkbox"]').nth(0).isChecked(),
    language: await persistedDialog.locator('select').nth(0).inputValue(),
    paper: await persistedDialog.locator('select').nth(1).inputValue(),
    theme: await persistedDialog.locator('select').nth(2).inputValue(),
  };
  await persistedDialog.locator('button').nth(1).click();

  await setSettings({
    fileName: 'Repeat',
    includePrompts: true,
    language: 'en',
  });
  const reloadedConversation = conversation;
  results.push({
    case: 'duplicate-1',
    ...await exportClick(
      reloadedConversation.locator('[data-chat-export-format="docx"]'),
      'duplicate-1.docx',
    ),
  });
  results.push({
    case: 'duplicate-2',
    ...await exportClick(
      reloadedConversation.locator('[data-chat-export-format="docx"]'),
      'duplicate-2.docx',
    ),
  });

  const downloadCountBeforeCancel = downloads.length;
  await page.locator('[data-message-id="assistant-alpha"] .markdown').evaluate((element) => {
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < 2500; index += 1) {
      const paragraph = document.createElement('p');
      paragraph.dataset.cancelStress = 'true';
      paragraph.textContent = `CANCEL_STRESS_${index}: deterministic local text`;
      fragment.append(paragraph);
    }
    element.append(fragment);
  });
  await reloadedConversation.locator('[data-chat-export-format="pdf"]').click();
  const activePanel = page.locator('[data-chat-export-progress="active"]');
  await activePanel.waitFor({ timeout: 30_000 });
  await activePanel.locator('button').click();
  await page.locator('[data-chat-export-progress="cancelled"]').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1_000);
  const cancellation = {
    downloadCreated: downloads.length !== downloadCountBeforeCancel,
    status: await page.locator('[data-chat-export-progress]').getAttribute(
      'data-chat-export-progress',
    ),
  };
  await dismiss();

  const texts = {
    assistantOnlyDocx: await docxText(path.join(downloadsRoot, 'assistant-only.docx')),
    fullDocx: await docxText(path.join(downloadsRoot, 'full-conversation.docx')),
    fullPdf: await pdfText(path.join(downloadsRoot, 'full-conversation.pdf')),
    localizedPdf: await pdfText(path.join(downloadsRoot, 'localized-letter.pdf')),
    selectedDocx: await docxText(path.join(downloadsRoot, 'selected-messages.docx')),
    selectedPdf: await pdfText(path.join(downloadsRoot, 'selected-messages.pdf')),
    singleDocx: await docxText(path.join(downloadsRoot, 'single-response.docx')),
    singlePdf: await pdfText(path.join(downloadsRoot, 'single-response.pdf')),
  };
  const compactFullDocx = texts.fullDocx.replace(/\s+/gu, '');
  const compactLocalizedPdf = texts.localizedPdf.replace(/\s+/gu, '');
  const unexpectedConsoleErrors = consoleErrors.filter(
    (message) => message !== 'Failed to load resource: net::ERR_FAILED',
  );
  const unexpectedExternalRequests = requests.filter(({ url }) =>
    url.startsWith('http')
    && !url.startsWith('https://chatgpt.com/')
    && !url.startsWith('https://invalid.example.test/'));
  const checks = [
    {
      name: 'full-docx-content',
      passed: includesAll(texts.fullDocx, [
        'USER_PROMPT_ALPHA',
        'ASSISTANT_ALPHA',
        'M7.2_CODE_SENTINEL',
        'USER_PROMPT_BETA',
        'ASSISTANT_BETA',
      ]),
    },
    {
      name: 'full-pdf-content',
      passed: includesAll(texts.fullPdf, [
        'USER_PROMPT_ALPHA',
        'ASSISTANT_ALPHA',
        'M7.2_CODE_SENTINEL',
        'ASSISTANT_BETA',
      ]),
    },
    {
      name: 'single-docx-scope',
      passed: texts.singleDocx.includes('ASSISTANT_ALPHA')
        && !texts.singleDocx.includes('USER_PROMPT_ALPHA')
        && !texts.singleDocx.includes('ASSISTANT_BETA'),
    },
    {
      name: 'single-pdf-scope',
      passed: texts.singlePdf.includes('ASSISTANT_BETA')
        && !texts.singlePdf.includes('USER_PROMPT_BETA')
        && !texts.singlePdf.includes('ASSISTANT_ALPHA'),
    },
    {
      name: 'selected-docx-scope',
      passed: includesAll(texts.selectedDocx, ['USER_PROMPT_BETA', 'ASSISTANT_BETA'])
        && !texts.selectedDocx.includes('USER_PROMPT_ALPHA'),
    },
    {
      name: 'selected-pdf-scope',
      passed: includesAll(texts.selectedPdf, ['USER_PROMPT_BETA', 'ASSISTANT_BETA'])
        && !texts.selectedPdf.includes('ASSISTANT_ALPHA'),
    },
    {
      name: 'assistant-only-scope',
      passed: includesAll(texts.assistantOnlyDocx, ['ASSISTANT_ALPHA', 'ASSISTANT_BETA'])
        && !texts.assistantOnlyDocx.includes('USER_PROMPT_ALPHA')
        && !texts.assistantOnlyDocx.includes('USER_PROMPT_BETA'),
    },
    {
      name: 'bilingual-rich-content',
      passed: compactFullDocx.includes('中文研究内容')
        && compactLocalizedPdf.includes('中文研究内容')
        && results.find(({ case: value }) => value === 'full-docx')?.warningCount === 2,
    },
    {
      name: 'single-visible-export-does-not-scroll',
      passed: results.find(({ case: value }) => value === 'single-pdf')?.scrollStable === true,
    },
    {
      name: 'selected-visible-export-does-not-scroll',
      passed: results.find(({ case: value }) => value === 'selected-pdf')?.scrollStable === true,
    },
    {
      name: 'localized-sanitized-name',
      passed: results.find(({ case: value }) => value === 'localized-letter-pdf')
        ?.suggestedName === '研究 导出.pdf',
    },
    {
      name: 'settings-persist-after-reload',
      passed: JSON.stringify(persisted) === JSON.stringify({
        codeStyle: 'document',
        fileName: '研究:导出?',
        includePrompts: true,
        language: 'zh-CN',
        paper: 'letter',
        theme: 'light',
      }),
    },
    {
      name: 'duplicate-names',
      passed: results.find(({ case: value }) => value === 'duplicate-1')?.suggestedName
        === 'Repeat.docx'
        && results.find(({ case: value }) => value === 'duplicate-2')?.suggestedName
        === 'Repeat (2).docx',
    },
    {
      name: 'cancellation',
      passed: cancellation.status === 'cancelled' && cancellation.downloadCreated === false,
    },
    {
      name: 'runtime-errors',
      passed: pageErrors.length === 0
        && unexpectedConsoleErrors.length === 0
        && unexpectedExternalRequests.length === 0
        && consoleErrors.length > 0,
    },
  ];
  const files = await Promise.all(results.map(async (result) => ({
    ...result,
    sha256: createHash('sha256')
      .update(await readFile(path.join(root, result.artifact)))
      .digest('hex'),
  })));
  const report = {
    browser: {
      executablePath,
      extensionId,
      version: await page.evaluate(() => navigator.userAgent),
    },
    cancellation,
    checks,
    files,
    networkRequests: requests.filter(({ url }) => !url.startsWith('data:')),
    persistedSettings: persisted,
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
    path.join(outputRoot, 'chrome-integration-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
  process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
  if (report.summary.failed > 0) {
    throw new Error(
      `M7.2 checks failed: ${checks.filter(({ passed }) => !passed)
        .map(({ name }) => name).join(', ')}`,
    );
  }
} finally {
  await context?.close().catch(() => {});
  assertInside(tempRoot, profilePath);
  await rm(profilePath, { force: true, recursive: true });
}
