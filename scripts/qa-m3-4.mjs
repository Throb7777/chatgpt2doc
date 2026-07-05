import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { chromium } from 'playwright-core';

const root = process.cwd();
const outputDir = path.join(root, 'docs', 'qa-screenshots', 'm3-4');
const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const contentRoot = path.resolve(
  root,
  process.env.CHAT_EXPORT_QA_BUILD_DIR ?? path.join('.output', 'chrome-mv3'),
  'content-scripts',
);

await mkdir(outputDir, { recursive: true });

function pageHtml(theme) {
  const dark = theme === 'dark';
  return `<!doctype html>
<html data-theme="${theme}" style="color-scheme:${theme}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>M3.4 ${theme} QA</title>
    <link rel="stylesheet" href="/chatgpt.css">
    <style>
      * { box-sizing: border-box; }
      body {
        background: ${dark ? '#212121' : '#f7f7f8'};
        color: ${dark ? '#ececec' : '#202123'};
        font-family: "Segoe UI", sans-serif;
        margin: 0;
      }
      main { margin: 24px auto 100px; max-width: 820px; padding: 16px; }
      .toolbar { border-bottom: 1px solid ${dark ? '#4a4a4a' : '#d9d9e3'}; }
      .msg {
        background: ${dark ? '#2f2f2f' : '#fff'};
        border: 1px solid ${dark ? '#454545' : '#e5e5e5'};
        border-radius: 12px;
        margin: 12px 0;
        padding: 16px;
      }
      output { display: block; margin-top: 16px; min-height: 24px; }
    </style>
  </head>
  <body>
    <main role="main">
      <div class="toolbar" data-testid="conversation-header"></div>
      <article class="msg" data-message-author-role="user" data-message-id="user-qa">
        <p>Explain the bilingual export workflow.</p>
      </article>
      <article class="msg" data-message-author-role="assistant" data-message-id="assistant-qa">
        <h2>Export workflow</h2>
        <p>The response remains local and supports DOCX and PDF actions.</p>
      </article>
      <article class="msg" data-message-author-role="assistant" data-message-id="assistant-stream" aria-busy="true">
        <p>Streaming response</p>
      </article>
      <output id="intent-state">No export intent</output>
    </main>
    <script>
      window.browser = {
        storage: {
          local: {
            async get(key) {
              const data = JSON.parse(localStorage.getItem('chat-export-qa-storage') || '{}');
              return Object.prototype.hasOwnProperty.call(data, key) ? { [key]: data[key] } : {};
            },
            async remove(key) {
              const data = JSON.parse(localStorage.getItem('chat-export-qa-storage') || '{}');
              delete data[key];
              localStorage.setItem('chat-export-qa-storage', JSON.stringify(data));
            },
            async set(value) {
              const data = JSON.parse(localStorage.getItem('chat-export-qa-storage') || '{}');
              Object.assign(data, value);
              localStorage.setItem('chat-export-qa-storage', JSON.stringify(data));
            }
          }
        }
      };
      window.chrome = window.browser;
      document.addEventListener('chat-export:request', (event) => {
        document.querySelector('#intent-state').textContent = JSON.stringify(event.detail);
      });
    </script>
    <script src="/chatgpt.js"></script>
  </body>
</html>`;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  if (url.pathname === '/chatgpt.js' || url.pathname === '/chatgpt.css') {
    const fileName = url.pathname.slice(1);
    const body = await readFile(path.join(contentRoot, fileName));
    response.writeHead(200, {
      'content-type': fileName.endsWith('.css') ? 'text/css' : 'text/javascript',
    });
    response.end(body);
    return;
  }
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(pageHtml(url.searchParams.get('theme') === 'dark' ? 'dark' : 'light'));
});

await new Promise((resolve) => server.listen(4173, '127.0.0.1', resolve));

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
});
const results = [];

async function openPage(theme, viewport, deviceScaleFactor = 1) {
  const page = await browser.newPage({ deviceScaleFactor, viewport });
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:4173/?theme=${theme}`);
  await page.getByRole('button', { name: theme === 'dark' ? 'Settings' : 'Settings' }).waitFor();
  return { errors, page };
}

async function assertInsideViewport(locator, viewport) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Expected visible element has no bounding box.');
  if (
    box.x < 0
    || box.y < 0
    || box.x + box.width > viewport.width
    || box.y + box.height > viewport.height
  ) {
    throw new Error(`Element overflows viewport: ${JSON.stringify({ box, viewport })}`);
  }
  return box;
}

async function actionButtonBoxes(page) {
  return page.locator([
    '.chat-export-floating-panel .chat-export-action-button',
    '[data-chat-export-actions="response"] .chat-export-action-button',
  ].join(', ')).evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect();
    return {
      height: box.height,
      width: box.width,
    };
  }));
}

async function storedPanelPosition(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('chat-export-qa-storage');
    if (!raw) return null;
    return JSON.parse(raw)['chatExport.settings.v2']?.settings?.panelPosition ?? null;
  });
}

try {
  {
    const viewport = { width: 1280, height: 800 };
    const { errors, page } = await openPage('light', viewport);
    const conversationGroup = page.getByRole('group', { name: 'Export conversation' });
    await assertInsideViewport(conversationGroup, viewport);
    const floatingPanelCount = await page.locator('[data-chat-export-floating-panel]').count();
    const mainConversationMountCount = await page.locator(
      'main > [data-chat-export-actions="conversation"]',
    ).count();
    const boxes = await actionButtonBoxes(page);
    const iconKinds = await page.locator('[data-chat-export-icon]').evaluateAll((icons) => (
      icons.map((icon) => icon.getAttribute('data-chat-export-icon'))
    ));
    const hitTargetsPass = boxes.every(({ height, width }) => height >= 32 && width >= 32);
    const responseOpacity = Number(await page.locator(
      '[data-chat-export-actions="response"] .chat-export-action-group',
    ).first().evaluate((element) => getComputedStyle(element).opacity));
    const floatingOpacity = Number(await page.locator(
      '.chat-export-floating-panel',
    ).evaluate((element) => getComputedStyle(element).opacity));
    await page.screenshot({
      path: path.join(outputDir, 'desktop-light-actions.png'),
      fullPage: true,
    });
    results.push({
      floatingOpacity,
      errors,
      floatingPanelCount,
      hitTargetsPass,
      iconKinds,
      mainConversationMountCount,
      name: 'desktop-light-actions',
      passed: errors.length === 0
        && floatingPanelCount === 1
        && mainConversationMountCount === 0
        && hitTargetsPass
        && iconKinds.filter((kind) => kind === 'docx').length === 3
        && iconKinds.filter((kind) => kind === 'pdf').length === 3
        && responseOpacity < 0.75
        && floatingOpacity < 0.85,
      responseOpacity,
      viewport,
    });
    await page.close();
  }

  {
    const viewport = { width: 1280, height: 800 };
    const { errors, page } = await openPage('light', viewport);
    const panel = page.locator('.chat-export-floating-panel');
    const handle = page.getByRole('button', { name: 'Drag export panel' });
    const before = await panel.boundingBox();
    await handle.hover();
    const handleBox = await handle.boundingBox();
    if (!before || !handleBox) throw new Error('Expected drag target bounding boxes.');
    const startX = handleBox.x + handleBox.width / 2;
    const startY = handleBox.y + handleBox.height / 2;
    await handle.dispatchEvent('mousedown', {
      bubbles: true,
      button: 0,
      clientX: startX,
      clientY: startY,
    });
    await page.locator('body').dispatchEvent('mousemove', {
      bubbles: true,
      button: 0,
      clientX: startX - 180,
      clientY: startY + 86,
    });
    await page.locator('body').dispatchEvent('mouseup', {
      bubbles: true,
      button: 0,
      clientX: startX - 180,
      clientY: startY + 86,
    });
    const dragged = await panel.boundingBox();
    const storedAfterDrag = await storedPanelPosition(page);
    await page.reload();
    await page.getByRole('button', { name: 'Settings' }).waitFor();
    const reloaded = await panel.boundingBox();
    await page.setViewportSize({ width: 360, height: 320 });
    await page.waitForTimeout(50);
    const clamped = await panel.boundingBox();
    const storedAfterClamp = await storedPanelPosition(page);
    const resetButtonCount = await page.locator('[aria-label="Reset panel position"]').count();
    await handle.focus();
    await page.keyboard.press('Home');
    await page.waitForTimeout(50);
    const storedAfterReset = await storedPanelPosition(page);
    results.push({
      clamped,
      dragged,
      errors,
      name: 'desktop-light-drag-persistence',
      passed: errors.length === 0
        && Math.abs((dragged?.x ?? before.x) - before.x) > 80
        && Math.abs((dragged?.y ?? before.y) - before.y) > 40
        && storedAfterDrag !== null
        && Math.abs((reloaded?.x ?? 0) - (dragged?.x ?? 0)) <= 2
        && Math.abs((reloaded?.y ?? 0) - (dragged?.y ?? 0)) <= 2
        && (clamped?.x ?? -1) >= 0
        && (clamped?.y ?? -1) >= 0
        && (clamped ? clamped.x + clamped.width <= 360 : false)
        && (clamped ? clamped.y + clamped.height <= 320 : false)
        && storedAfterClamp !== null
        && resetButtonCount === 0
        && storedAfterReset === null,
      storedAfterClamp,
      storedAfterDrag,
      storedAfterReset,
      viewport,
    });
    await page.close();
  }

  {
    const viewport = { width: 1280, height: 800 };
    const deviceScaleFactor = 1.5;
    const { errors, page } = await openPage('dark', viewport, deviceScaleFactor);
    await page.screenshot({
      path: path.join(outputDir, 'desktop-dark-actions-150.png'),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Settings' }).click();
    const dialog = page.getByRole('dialog', { name: 'Export settings' });
    await assertInsideViewport(dialog, viewport);
    const initialFocus = await page.evaluate(() => document.activeElement?.tagName);
    const checkboxRows = page.locator('.chat-export-settings-checkbox');
    const copyTargets = page.locator('.chat-export-copy-target');
    if (await checkboxRows.count() < 1 || await copyTargets.count() !== 2) {
      throw new Error('Expected settings checkbox rows and two copy targets.');
    }
    const checkboxRow = checkboxRows.first();
    const wpsTarget = copyTargets.nth(1);
    const saveHoverButton = page.getByRole('button', { name: 'Save' });
    const checkboxBackgroundBefore = await checkboxRow.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    await checkboxRow.hover();
    await page.waitForTimeout(160);
    const checkboxBackgroundAfter = await checkboxRow.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    const targetBackgroundBefore = await wpsTarget.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    await wpsTarget.hover();
    await page.waitForTimeout(160);
    const targetHoverStyle = await wpsTarget.evaluate((element) => ({
      background: getComputedStyle(element).backgroundColor,
      transform: getComputedStyle(element).transform,
    }));
    const saveTransformBefore = await saveHoverButton.evaluate(
      (element) => getComputedStyle(element).transform,
    );
    await saveHoverButton.hover();
    await page.waitForTimeout(160);
    const saveTransformAfter = await saveHoverButton.evaluate(
      (element) => getComputedStyle(element).transform,
    );
    const hoverFeedback = {
      buttonLifted: saveTransformAfter !== saveTransformBefore,
      checkboxHighlighted: checkboxBackgroundAfter !== checkboxBackgroundBefore,
      targetHighlighted: targetHoverStyle.background !== targetBackgroundBefore,
      targetLifted: targetHoverStyle.transform !== 'none'
        && targetHoverStyle.transform !== 'matrix(1, 0, 0, 1, 0, 0)',
    };
    await page.screenshot({
      path: path.join(outputDir, 'desktop-dark-settings-hover.png'),
      fullPage: true,
    });
    const settingsLatency = await page.evaluate(async () => {
      const selects = [...document.querySelectorAll('.chat-export-settings-panel select')];
      const select = selects[1];
      if (!(select instanceof HTMLSelectElement)) throw new Error('Paper select was not found.');
      const longTasks = [];
      const observer = typeof PerformanceObserver === 'undefined'
        ? null
        : new PerformanceObserver((list) => {
          longTasks.push(...list.getEntries().map(({ duration }) => duration));
        });
      try {
        observer?.observe({ entryTypes: ['longtask'] });
      } catch {
        // Some Chromium builds do not expose the long-task entry type in headless mode.
      }
      const durations = [];
      for (let index = 0; index < 20; index += 1) {
        const startedAt = performance.now();
        select.value = index % 2 === 0 ? 'a4' : 'letter';
        select.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((resolve) => requestAnimationFrame(() => resolve()));
        durations.push(performance.now() - startedAt);
      }
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
      observer?.disconnect();
      const ordered = [...durations].sort((left, right) => left - right);
      return {
        longTaskCount: longTasks.length,
        maxMs: Math.max(...durations),
        p95Ms: ordered[Math.floor((ordered.length - 1) * 0.95)],
      };
    });
    const saveButton = page.getByRole('button', { name: 'Save' });
    await saveButton.focus();
    await page.keyboard.press('Tab');
    const wrappedForward = await page.evaluate(
      () => document.activeElement?.getAttribute('aria-label')
        ?? document.activeElement?.closest('label')?.textContent?.trim(),
    );
    await page.keyboard.press('Shift+Tab');
    const wrappedReverse = await page.evaluate(() => document.activeElement?.textContent?.trim());
    await page.screenshot({
      path: path.join(outputDir, 'desktop-dark-settings.png'),
      fullPage: true,
    });
    await page.keyboard.press('Escape');
    const focusRestored = await page.evaluate(
      () => document.activeElement?.hasAttribute('data-chat-export-settings-button'),
    );
    results.push({
      errors,
      deviceScaleFactor,
      focusRestored,
      initialFocus,
      name: 'desktop-dark-settings',
      passed: errors.length === 0
        && initialFocus === 'SELECT'
        && wrappedForward?.includes('Language')
        && wrappedReverse === 'Save'
        && focusRestored
        && Object.values(hoverFeedback).every(Boolean)
        && settingsLatency.longTaskCount === 0
        && settingsLatency.p95Ms < 50,
      hoverFeedback,
      settingsLatency,
      viewport,
      wrappedForward,
      wrappedReverse,
    });
    await page.close();
  }

  {
    const viewport = { width: 390, height: 844 };
    const { errors, page } = await openPage('light', viewport);
    await page.getByRole('button', { name: 'Select messages' }).click();
    const selectionBar = page.getByRole('region', { name: 'Selected message export' });
    await assertInsideViewport(selectionBar, viewport);
    const horizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    await page.screenshot({
      path: path.join(outputDir, 'mobile-light-selection.png'),
      fullPage: true,
    });
    results.push({
      errors,
      horizontalOverflow,
      name: 'mobile-light-selection',
      passed: errors.length === 0 && !horizontalOverflow,
      viewport,
    });
    await page.close();
  }

  {
    const viewport = { width: 390, height: 844 };
    const { errors, page } = await openPage('dark', viewport);
    await page.getByRole('button', { name: 'Settings' }).click();
    const dialog = page.getByRole('dialog', { name: 'Export settings' });
    await assertInsideViewport(dialog, viewport);
    const horizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    await page.screenshot({
      path: path.join(outputDir, 'mobile-dark-settings.png'),
      fullPage: true,
    });
    results.push({
      errors,
      horizontalOverflow,
      name: 'mobile-dark-settings',
      passed: errors.length === 0 && !horizontalOverflow,
      viewport,
    });
    await page.close();
  }

  {
    const viewport = { width: 1280, height: 800 };
    const { errors, page } = await openPage('light', viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: 'Settings' }).click();
    const copyTargets = page.locator('.chat-export-copy-target');
    if (await copyTargets.count() !== 2) throw new Error('Expected two copy targets.');
    const wpsTarget = copyTargets.nth(1);
    await wpsTarget.hover();
    const targetMotion = await wpsTarget.evaluate((element) => ({
      transform: getComputedStyle(element).transform,
      transitionDuration: getComputedStyle(element).transitionDuration,
    }));
    const saveButton = page.getByRole('button', { name: 'Save' });
    await saveButton.hover();
    const buttonMotion = await saveButton.evaluate((element) => ({
      transform: getComputedStyle(element).transform,
      transitionDuration: getComputedStyle(element).transitionDuration,
    }));
    results.push({
      buttonMotion,
      errors,
      name: 'desktop-light-reduced-motion',
      passed: errors.length === 0
        && buttonMotion.transform === 'none'
        && buttonMotion.transitionDuration === '0s'
        && targetMotion.transform === 'none'
        && targetMotion.transitionDuration === '0s',
      targetMotion,
      viewport,
    });
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.close((error) => (
    error ? reject(error) : resolve()
  )));
}

const summary = {
  generatedAt: new Date().toISOString(),
  passed: results.every(({ passed }) => passed),
  results,
};
await writeFile(
  path.join(outputDir, 'qa-summary.json'),
  `${JSON.stringify(summary, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
if (!summary.passed) process.exitCode = 1;
