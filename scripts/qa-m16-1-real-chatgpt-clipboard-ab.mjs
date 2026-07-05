import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { chromium } from 'playwright-core';

const root = process.cwd();
const executablePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const extensionPath = path.resolve(root, '.output', 'chrome-mv3');
const runId = new Date().toISOString().replace(/[:.]/gu, '-');
const outputRoot = path.join(
  root,
  'docs',
  'qa-artifacts',
  'm16-1',
  'real-chatgpt-ab',
  runId,
);
const tempRoot = path.join(root, 'tmp', 'm16-1-real-chatgpt-ab');
const configuredProfilePath = process.env.M16_REAL_CHATGPT_PROFILE_PATH?.trim();
const keepConfiguredProfile = Boolean(configuredProfilePath);

const prompt = String.raw`请严格按下面结构输出，不解释、不省略，并保留所有 Markdown/LaTeX。开头输出 M16_CLIPBOARD_AB_START，结尾输出 M16_CLIPBOARD_AB_END。

行内公式：$x_i^2$。

分式与根式：
$$E=\frac{x^2+1}{\sqrt{y}}$$

求和、乘积和积分：
$$\sum_{i=1}^{n}p_i,\quad \prod_{k=1}^{m}q_k,\quad \int_0^1 x^2\,dx$$

分段函数：
$$f(x)=\begin{cases}1,&x>0\\0,&\text{otherwise}\end{cases}$$

矩阵：
$$A=\begin{bmatrix}a&b\\c&d\end{bmatrix}$$

重音与 prime：
$$\hat{x}+\bar{y}+\tilde{z}+\dot{q}+r'$$

符号与中英文：
$$\text{概率 }\alpha\leq\beta\Longrightarrow\gamma$$

- 列表项包含公式 $\|v\|_2$。
- 链接：[Example](https://example.com/)

\`\`\`text
clipboard synthetic fixture
\`\`\`

M16_CLIPBOARD_AB_END`;

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex').toUpperCase();
}

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function sanitizedUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return `${url.origin}${url.pathname}`;
  } catch {
    return 'invalid-url';
  }
}

function runPowerShell(script, args) {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      script,
      ...args,
    ], { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`PowerShell failed (${code}): ${stderr || stdout}`));
    });
  });
}

async function captureClipboard(condition, copyPath) {
  const directory = path.join(outputRoot, condition);
  await mkdir(directory, { recursive: true });
  const output = await runPowerShell(
    path.join(root, 'scripts', 'capture-clipboard-evidence.ps1'),
    ['-OutputDirectory', directory, '-Condition', condition, '-CopyPath', copyPath],
  );
  return JSON.parse(output);
}

async function selectFolder() {
  return runPowerShell(path.join(root, 'scripts', 'select-folder.ps1'), [
    '-FolderPath',
    extensionPath,
    '-BrowserName',
    'chrome',
  ]);
}

async function loadExtension(context) {
  const extensionPage = await context.newPage();
  await extensionPage.goto('chrome://extensions/');
  const developerMode = extensionPage.locator('extensions-toolbar #devMode');
  if (!(await developerMode.evaluate((element) => element.checked))) {
    await developerMode.focus();
    await extensionPage.keyboard.press('Space');
  }
  const button = extensionPage.locator('extensions-toolbar #loadUnpacked');
  await button.waitFor({ state: 'visible' });
  const selection = selectFolder();
  await button.click();
  await selection;
  await extensionPage.waitForTimeout(1_500);
  const extensions = await extensionPage.evaluate(() =>
    globalThis.chrome.developerPrivate.getExtensionsInfo());
  const extension = extensions.find(({ name }) => name === 'ChatGPT2Doc');
  if (!extension || extension.state !== 'ENABLED') {
    throw new Error(`Project extension did not load enabled: ${JSON.stringify(extension)}`);
  }
  await extensionPage.close();
  return { extensionId: extension.id, extensions };
}

async function setExtensionEnabled(context, extensionId, enabled) {
  const extensionPage = await context.newPage();
  await extensionPage.goto('chrome://extensions/');
  await extensionPage.evaluate(({ id, nextEnabled }) => new Promise((resolve, reject) => {
    globalThis.chrome.developerPrivate.updateExtensionConfiguration({
      enable: nextEnabled,
      extensionId: id,
    }, () => {
      const error = globalThis.chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  }), { id: extensionId, nextEnabled: enabled });
  await extensionPage.close();
}

async function responseEvidence(page) {
  const evidence = await page.evaluate(() => {
    const messages = [...document.querySelectorAll('[data-message-author-role="assistant"]')];
    const response = messages.at(-1);
    if (!response) return null;
    const math = [...response.querySelectorAll('math')].map((node) => ({
      math: node.outerHTML,
      tex: node.querySelector('annotation[encoding*="application/x-tex"]')?.textContent ?? null,
    }));
    return {
      math,
      text: response.innerText,
    };
  });
  if (!evidence) throw new Error('No assistant response found.');
  return {
    aggregateMathSha256: sha256(evidence.math.map(({ math }) => math).join('\n')),
    formulas: evidence.math.map(({ math, tex }) => ({
      mathSha256: sha256(math),
      tex,
    })),
    mathCount: evidence.math.length,
    textCharacters: evidence.text.length,
    textSha256: sha256(evidence.text),
  };
}

async function selectLatestAssistant(page) {
  return page.evaluate(() => {
    const messages = [...document.querySelectorAll('[data-message-author-role="assistant"]')];
    const response = messages.at(-1);
    if (!response) return false;
    const selection = globalThis.getSelection();
    const range = document.createRange();
    range.selectNodeContents(response);
    selection.removeAllRanges();
    selection.addRange(range);
    return !selection.isCollapsed;
  });
}

async function captureSelection(page, condition, requests) {
  if (!(await selectLatestAssistant(page))) {
    throw new Error(`Could not select assistant response for ${condition}.`);
  }
  const requestStart = requests.length;
  const startedAt = Date.now();
  await page.keyboard.press('Control+C');
  const clipboard = await captureClipboard(condition, 'selection');
  await page.waitForTimeout(5_000);
  const network = requests.slice(requestStart);
  await writeJson(path.join(outputRoot, condition, 'network.json'), network);
  return { clipboard, copyDurationMs: Date.now() - startedAt, networkRequests: network.length };
}

await mkdir(outputRoot, { recursive: true });
await mkdir(tempRoot, { recursive: true });
const profilePath = configuredProfilePath
  ? path.resolve(configuredProfilePath)
  : await mkdtemp(path.join(tempRoot, 'profile-'));
const requests = [];
let context;
let finalStatus = 'FAILED';

try {
  context = await chromium.launchPersistentContext(profilePath, {
    executablePath,
    headless: false,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      '--disable-sync',
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1280,900',
    ],
  });
  const browserVersion = context.browser()?.version() ?? 'unknown';
  const page = context.pages()[0] ?? await context.newPage();
  page.on('request', (request) => {
    requests.push({
      method: request.method(),
      resourceType: request.resourceType(),
      timestamp: new Date().toISOString(),
      url: sanitizedUrl(request.url()),
    });
  });

  await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 90_000 });
  const promptBoxes = page.locator('#prompt-textarea');
  await promptBoxes.first().waitFor({ state: 'visible', timeout: 120_000 }).catch(() => {});
  const promptBoxCount = await promptBoxes.count();
  const promptBox = promptBoxes.first();
  if (promptBoxCount < 1) {
    const state = await page.evaluate(() => ({
      captcha: Boolean(document.querySelector('iframe[src*="challenge"], [id*="captcha"], [class*="captcha"]')),
      login: /log in|sign in|登录|登入/iu.test(document.body.innerText.slice(0, 5_000)),
      promptTextAreaCount: document.querySelectorAll('#prompt-textarea').length,
      title: document.title,
      url: location.href,
    }));
    finalStatus = state.captcha ? 'BLOCKED_CAPTCHA' : state.login ? 'BLOCKED_LOGIN' : 'BLOCKED_CHATGPT_UI';
    await writeJson(path.join(outputRoot, 'environment.json'), {
      browserVersion,
      finalStatus,
      pageState: state,
      profileInherited: false,
      profilePathMode: keepConfiguredProfile ? 'configured' : 'temporary',
    });
    process.stdout.write(`${JSON.stringify({ finalStatus, outputRoot }, null, 2)}\n`);
    process.exitCode = 2;
  } else {
    await promptBox.fill(prompt);
    await promptBox.press('Enter');
    await page.waitForFunction(() => {
      const messages = [...document.querySelectorAll('[data-message-author-role="assistant"]')];
      return messages.at(-1)?.innerText.includes('M16_CLIPBOARD_AB_END');
    }, null, { timeout: 180_000 });

    const nativeA1Evidence = await responseEvidence(page);
    await writeJson(path.join(outputRoot, 'chatgpt-math-signatures.json'), {
      nativeA1: nativeA1Evidence,
    });
    const nativeA1 = await captureSelection(page, 'native-a1', requests);

    const loaded = await loadExtension(context);
    await writeJson(path.join(outputRoot, 'extensions.json'), loaded.extensions.map((item) => ({
      id: item.id,
      location: item.location,
      name: item.name,
      state: item.state,
      type: item.type,
    })));

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('[data-message-author-role="assistant"]').last().waitFor({ state: 'visible' });
    await page.locator('[data-chat-export-floating-panel]').waitFor({ state: 'visible' });
    const enhancedEvidence = await responseEvidence(page);
    const enhanced = await captureSelection(page, 'enhanced', requests);

    await setExtensionEnabled(context, loaded.extensionId, false);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('[data-message-author-role="assistant"]').last().waitFor({ state: 'visible' });
    const nativeA2Evidence = await responseEvidence(page);
    const nativeA2 = await captureSelection(page, 'native-a2', requests);

    const domStable = nativeA1Evidence.aggregateMathSha256 === enhancedEvidence.aggregateMathSha256
      && nativeA1Evidence.aggregateMathSha256 === nativeA2Evidence.aggregateMathSha256
      && nativeA1Evidence.textSha256 === enhancedEvidence.textSha256
      && nativeA1Evidence.textSha256 === nativeA2Evidence.textSha256;
    const nativeStable = nativeA1.clipboard.htmlSha256 === nativeA2.clipboard.htmlSha256
      && nativeA1.clipboard.textSha256 === nativeA2.clipboard.textSha256;
    finalStatus = domStable && nativeStable ? 'BROWSER_AB_COMPLETE' : 'BROWSER_AB_UNSTABLE';

    await writeJson(path.join(outputRoot, 'chatgpt-math-signatures.json'), {
      enhanced: enhancedEvidence,
      nativeA1: nativeA1Evidence,
      nativeA2: nativeA2Evidence,
    });
    await writeJson(path.join(outputRoot, 'comparison.json'), {
      domStable,
      enhanced,
      finalStatus,
      nativeA1,
      nativeA2,
      nativeStable,
    });
    await writeJson(path.join(outputRoot, 'environment.json'), {
      browserVersion,
      finalStatus,
      profileInherited: false,
      profilePathMode: keepConfiguredProfile ? 'configured' : 'temporary',
      syntheticPromptSha256: sha256(prompt),
    });
    process.stdout.write(`${JSON.stringify({ finalStatus, outputRoot }, null, 2)}\n`);
  }
} catch (error) {
  await writeJson(path.join(outputRoot, 'failure.json'), {
    message: error instanceof Error ? error.message : String(error),
    status: finalStatus,
  });
  throw error;
} finally {
  await context?.close().catch(() => {});
  if (!keepConfiguredProfile) {
    await rm(profilePath, { force: true, recursive: true }).catch(() => {});
  }
}
