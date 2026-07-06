import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { chromium } from 'playwright-core';

const root = process.cwd();
const tempRoot = path.resolve(root, 'tmp', 'browser-smoke');
const targets = [
  {
    browser: 'chrome',
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    extensionPath: path.resolve(
      root,
      process.env.CHAT_EXPORT_CHROME_BUILD_DIR ?? path.join('.output', 'chrome-mv3'),
    ),
    extensionsUrl: 'chrome://extensions/',
    processName: 'chrome',
  },
  {
    browser: 'edge',
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    extensionPath: path.resolve(root, '.output', 'edge-mv3'),
    extensionsUrl: 'edge://extensions/',
    processName: 'msedge',
  },
];
const requestedTargets = new Set(process.argv.slice(2).map((value) => value.toLowerCase()));
const selectedTargets =
  requestedTargets.size === 0
    ? targets
    : targets.filter((target) => requestedTargets.has(target.browser));

if (selectedTargets.length === 0) {
  throw new Error(`No matching browser targets: ${[...requestedTargets].join(', ')}`);
}

await mkdir(tempRoot, { recursive: true });

function assertTemporaryProfile(profilePath) {
  const relative = path.relative(tempRoot, profilePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing to clean unsafe profile path: ${profilePath}`);
  }
}

function selectFolder(target) {
  const helperPath = path.join(root, 'scripts', 'select-folder.ps1');
  const helperArguments = [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    helperPath,
    '-FolderPath',
    target.extensionPath,
    '-BrowserName',
    target.processName,
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      helperArguments,
      { windowsHide: true },
    );
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

async function getEdgeDeveloperModeState(page) {
  return page.evaluate(() => {
    function deepFind(root, predicate) {
      for (const element of root.querySelectorAll('*')) {
        if (predicate(element)) return element;
        if (element.shadowRoot) {
          const found = deepFind(element.shadowRoot, predicate);
          if (found) return found;
        }
      }
      return null;
    }
    const switchElement = deepFind(
      document,
      (element) => element.tagName.toLowerCase() === 'fluent-switch' && element.id === 'dev-switch',
    );
    if (!switchElement) {
      throw new Error('Edge developer-mode switch was not found.');
    }
    return {
      checked: Boolean(switchElement.checked) || switchElement.getAttribute('checked') === 'true',
      disabled: Boolean(switchElement.disabled) || switchElement.getAttribute('disabled') === 'true',
    };
  });
}

async function clickEdgeDeveloperMode(page) {
  await page.evaluate(() => {
    function deepFind(root, predicate) {
      for (const element of root.querySelectorAll('*')) {
        if (predicate(element)) return element;
        if (element.shadowRoot) {
          const found = deepFind(element.shadowRoot, predicate);
          if (found) return found;
        }
      }
      return null;
    }
    const switchElement = deepFind(
      document,
      (element) => element.tagName.toLowerCase() === 'fluent-switch' && element.id === 'dev-switch',
    );
    if (!switchElement) {
      throw new Error('Edge developer-mode switch was not found.');
    }
    switchElement.click();
  });
}

async function clickEdgeLoadUnpacked(page) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const clicked = await page.evaluate(() => {
      function deepFind(root, predicate) {
        for (const element of root.querySelectorAll('*')) {
          if (predicate(element)) return element;
          if (element.shadowRoot) {
            const found = deepFind(element.shadowRoot, predicate);
            if (found) return found;
          }
        }
        return null;
      }
      const button = deepFind(document, (element) => {
        const text = (element.innerText || element.textContent || '').replace(/\s+/gu, ' ').trim();
        const title = element.getAttribute('title') ?? '';
        return element.tagName.toLowerCase() === 'fluent-button'
          && (
            /Load unpacked/iu.test(text)
              || /Load unpacked/iu.test(title)
              || text.includes('加载解压缩')
              || title.includes('加载解压缩')
          );
      });
      if (!button) {
        return false;
      }
      button.click();
      return true;
    });
    if (clicked) {
      return true;
    }
    await page.waitForTimeout(100);
  }
  throw new Error('Edge load-unpacked button was not found.');
}

async function verifyTarget(target) {
  const manifest = JSON.parse(
    await readFile(path.join(target.extensionPath, 'manifest.json'), 'utf8'),
  );
  if (manifest.manifest_version !== 3) {
    throw new Error(`${target.browser} artifact is not Manifest V3.`);
  }
  const profilePath = await mkdtemp(path.join(tempRoot, `${target.browser}-`));
  const pageErrors = [];
  const consoleErrors = [];
  let context;

  try {
    context = await chromium.launchPersistentContext(profilePath, {
      executablePath: target.executablePath,
      headless: false,
      ignoreDefaultArgs: ['--disable-extensions'],
      args: [
        '--disable-sync',
        '--no-first-run',
        '--window-position=-32000,-32000',
      ],
    });

    const extensionsPage = context.pages()[0] ?? (await context.newPage());
    await extensionsPage.goto(target.extensionsUrl);
    const developerMode =
      target.browser === 'edge'
        ? null
        : extensionsPage.locator('extensions-toolbar #devMode');
    const developerModeState = target.browser === 'edge'
      ? await getEdgeDeveloperModeState(extensionsPage)
      : await developerMode.evaluate((element) => ({
        checked: element.checked,
        disabled: element.disabled,
      }));
    if (!developerModeState.checked) {
      if (developerModeState.disabled) {
        throw new Error(`${target.browser} developer mode is disabled by policy.`);
      }
      if (target.browser === 'edge') {
        await clickEdgeDeveloperMode(extensionsPage);
      } else {
        await developerMode.focus();
        await extensionsPage.keyboard.press('Space');
      }
      const deadline = Date.now() + 5_000;
      while (!(target.browser === 'edge'
        ? await getEdgeDeveloperModeState(extensionsPage).then((state) => state.checked)
        : await developerMode.evaluate((element) => element.checked))) {
        if (Date.now() >= deadline) {
          throw new Error(`${target.browser} developer mode did not become enabled.`);
        }
        await extensionsPage.waitForTimeout(100);
      }
    }

    const loadUnpackedButton =
      target.browser === 'edge'
        ? null
        : extensionsPage.locator('extensions-toolbar #loadUnpacked');
    const folderSelection = selectFolder(target);
    if (target.browser === 'edge') {
      await clickEdgeLoadUnpacked(extensionsPage);
    } else {
      await loadUnpackedButton.waitFor({ state: 'visible' });
      await loadUnpackedButton.click();
    }
    const selectedFolder = await folderSelection;
    await extensionsPage.waitForTimeout(2_000);
    const extensionCards = await extensionsPage.evaluate(() =>
      globalThis.chrome.developerPrivate.getExtensionsInfo(),
    );
    const extensionState = extensionCards.find((item) => item.name === 'ChatGPT2Doc');
    if (!extensionState) {
      const toastText = await extensionsPage
        .locator('cr-toast-manager')
        .textContent()
        .catch(() => null);
      throw new Error(
        `${target.browser} did not show the selected extension: ${JSON.stringify({
          developerModeState,
          extensionCards,
          selectedFolder,
          toastText,
        })}`,
      );
    }
    const extensionId = extensionState.id;
    if (extensionState.state !== 'ENABLED') {
      throw new Error(
        `${target.browser} extension state is ${extensionState.state}, expected ENABLED.`,
      );
    }
    if ((extensionState.disableReasons ?? []).length > 0) {
      throw new Error(
        `${target.browser} reported disable reasons: ${extensionState.disableReasons.join(', ')}`,
      );
    }
    if ((extensionState.manifestErrors ?? []).length > 0) {
      throw new Error(
        `${target.browser} reported manifest errors: ${JSON.stringify(extensionState.manifestErrors)}`,
      );
    }
    if ((extensionState.runtimeErrors ?? []).length > 0) {
      throw new Error(
        `${target.browser} reported runtime errors: ${JSON.stringify(extensionState.runtimeErrors)}`,
      );
    }

    const page = await context.newPage();
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.locator('h1', { hasText: 'ChatGPT2Doc' }).waitFor();

    if (pageErrors.length > 0 || consoleErrors.length > 0) {
      throw new Error(
        `${target.browser} popup errors: ${JSON.stringify({ consoleErrors, pageErrors })}`,
      );
    }

    return {
      browser: target.browser,
      extensionId,
      manifestVersion: manifest.manifest_version,
      popupTitle: await page.title(),
      state: extensionState.state,
    };
  } finally {
    await context?.close().catch(() => {});
    assertTemporaryProfile(profilePath);
    await rm(profilePath, { force: true, recursive: true });
  }
}

const results = [];
for (const target of selectedTargets) {
  results.push(await verifyTarget(target));
}

process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
