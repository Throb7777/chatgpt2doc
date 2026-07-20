<p align="center">
  <img src="public/icon/128.png" width="112" alt="ChatGPT2Doc icon">
</p>

<h1 align="center">ChatGPT2Doc</h1>

<p align="center"><strong>Free · Local · No subscription</strong></p>

<p align="center">
  Export ChatGPT conversations to editable Word documents and searchable PDFs.
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/chatgpt2doc/fbflighecngbagjcmgngndnabghckmgo?hl=zh-CN&utm_source=ext_sidebar">Chrome Web Store</a> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="docs/USAGE.md">Usage guide</a> ·
  <a href="PRIVACY.md">Privacy policy</a> ·
  <a href="LICENSE">License</a>
</p>

## What it does

ChatGPT2Doc adds DOCX and PDF export controls directly to the ChatGPT web
interface.

You can export:

- one assistant response;
- the complete conversation, in the order shown on the page;
- assistant-only content, automatically excluding your prompts;
- custom-selected messages.

Exports preserve headings, lists, quotes, links, citations, tables, code
blocks, images, Chinese and English text, and mathematical expressions where
supported.

- **DOCX:** supported formulas remain native and editable in Microsoft Word.
- **PDF:** generated PDFs keep searchable text and embed the fonts they need.
- **Local processing:** files are generated on your device. ChatGPT2Doc needs
  no account, external conversion server, subscription, analytics, or telemetry.

## Installation

### Chrome Web Store (recommended)

Install ChatGPT2Doc from the Chrome Web Store:

[https://chromewebstore.google.com/detail/chatgpt2doc/fbflighecngbagjcmgngndnabghckmgo?hl=zh-CN&utm_source=ext_sidebar](https://chromewebstore.google.com/detail/chatgpt2doc/fbflighecngbagjcmgngndnabghckmgo?hl=zh-CN&utm_source=ext_sidebar)

This is the recommended installation method because Chrome can update the
extension automatically.

Project source and release downloads:

- GitHub repository: [https://github.com/Throb7777/chatgpt2doc](https://github.com/Throb7777/chatgpt2doc)
- Releases: [https://github.com/Throb7777/chatgpt2doc/releases](https://github.com/Throb7777/chatgpt2doc/releases)

### Manual installation (developer mode)

If you want to build and load the current version manually:

1. Install Node.js and npm.
2. Open a terminal in the project folder.
3. Run:

   ```powershell
   npm ci
   npm run build:chrome
   ```

4. Open Chrome and go to `chrome://extensions/`.
5. Turn on **Developer mode** in the top-right corner.
6. Click **Load unpacked**.
7. Select the `.output/chrome-mv3` folder.
8. Open or refresh `https://chatgpt.com/`.

For Microsoft Edge, run `npm run build:edge`, open `edge://extensions/`, and
load the `.output/edge-mv3` folder.

## How to export documents

### Export a single response

Hover over an assistant response and click the DOCX or PDF icon beside that
response. Only that response is exported.

### Export the complete conversation

Click the DOCX or PDF icon in the floating control panel. Conversation messages
are exported in the order shown on the page.

### Export assistant responses only

1. Click the gear icon in the floating control panel.
2. Turn off **Include user prompts**.
3. Export the conversation from the floating control panel.

Your prompts are omitted, while assistant responses keep their original order.

### Export selected messages

1. Click **Select messages** in the floating control panel.
2. Check the user messages or assistant responses you want to export.
3. Click DOCX or PDF in the bottom selection bar.
4. Exit selection mode when finished.

An empty selection cannot be exported. If ChatGPT is still generating a
response, wait until generation has finished before exporting.

## Export progress and diagnostics

Only one export task can run at a time. During export, the progress notice shows
whether the extension is collecting content, generating the document, or
downloading the file. You can cancel before the file starts downloading. After
the file is generated, the notice closes automatically.

By default, a successful export simply shows that it is complete. If you want
technical details about failed image loading, unsupported formulas, incomplete
collection, or fallback layout, turn on **Show export diagnostics** in Settings.

A fallback does not mean the whole file failed. It only means that a specific
piece of content could not keep its original complex structure.

## Copy mathematical formulas

### Copy to Microsoft Word (no helper required)

You do not need any additional helper to copy formulas into Microsoft Word:

1. Select the text and mathematical formulas inside a ChatGPT message.
2. Press `Ctrl+C` (`Cmd+C` on macOS).
3. Paste normally into Word.

On supported Windows versions of Word, supported formulas are converted into
native, editable Word equations. If you paste as plain text, equation structure
will be removed.

### Copy editable formulas to WPS Writer (optional)

WPS Office uses a different native clipboard format. To paste editable WPS
equations, install the optional Windows helper. Chrome and Edge do not allow a
Web Store extension to silently install or register a Native Messaging host on
your computer, so this helper must remain a separate, user-approved local
component. Ordinary users do not need to build anything from source.

1. Download `chatgpt2doc-wps-helper-setup-v1.0.0.exe` from
   [Releases](https://github.com/Throb7777/chatgpt2doc/releases).
2. Run the installer. If it asks for an extension ID, copy the current ID from
   ChatGPT2Doc Settings and paste it into the installer.
3. Open ChatGPT2Doc Settings.
4. Change **Copy target** to **WPS Office**.
5. Allow the optional Native Messaging permission when Chrome asks.
6. Click **Recheck** until the helper status shows as ready. The settings panel
   shows both the current extension ID and the helper-bound ID so you can spot
   an ID mismatch.
7. Select content inside a ChatGPT message and press `Ctrl+C`.
8. Paste directly into WPS Writer.

When the formula structure is supported, formulas remain editable in WPS. If the
helper is unavailable, ChatGPT2Doc safely falls back to the standard
Word-compatible clipboard format. DOCX and PDF export do not depend on this
helper. Advanced users can still download the ZIP package or build the helper
from source; see [the WPS helper instructions](native/wps-helper/README.md).

## Settings

Click the gear icon in the floating control panel to configure:

- **Language:** English or Simplified Chinese.
- **File name:** customize the file name, or leave it blank to use the
  conversation title and timestamp.
- **Paper:** A4 or Letter.
- **Document theme:** Light or Dark.
- **Code style:** follow the document, Light, or Dark.
- **Include user prompts:** include or omit your prompts when exporting a whole
  conversation.
- **Show export diagnostics:** show or hide detailed warning and fallback
  reports.
- **Per-message actions:** show or hide quick export buttons beside assistant
  responses.
- **Copy target:** choose Microsoft Word or WPS Office as the default clipboard
  target.
- **Panel position:** drag the floating control panel; Chrome remembers its
  position.

Click **Reset settings** to restore defaults. All preferences are stored only in
your browser's local extension storage.

## Troubleshooting

- **Export buttons do not appear:** refresh ChatGPT after installing or
  reloading the extension. Make sure the extension is allowed to run on
  `chatgpt.com`.
- **Export stays busy:** wait until the current ChatGPT response has finished
  streaming. If it is still stuck, cancel the export and try again. Avoid
  starting multiple exports at the same time.
- **A formula appears as fallback content:** turn on **Show export diagnostics**
  to inspect the exact formula. Unsupported notation is shown as a fallback so
  the content is not silently lost.
- **Images are missing in the exported document:** the browser may have been
  unable to access or decode the source image. The extension tries to keep the
  original link or a visible placeholder at the same position.
- **WPS helper is unavailable:** install the WPS Helper Setup from Releases,
  confirm the extension ID shown in Settings if prompted, grant the required
  permission, and click **Recheck**. If Settings shows that the helper-bound ID
  differs from the current extension ID, re-run the setup with the current ID.
- **Chrome says the manifest file is missing:** run `npm run build:chrome`
  successfully, then load `.output/chrome-mv3`, not the project root.

## Privacy

Your privacy matters. Conversation content is processed locally in your browser
only when you actively export or copy. ChatGPT2Doc does not upload your chats to
a developer server and does not include tracking, analytics, or telemetry.
Remote images already present in the conversation may be fetched from their
original URLs so they can be embedded in exported files. See
[PRIVACY.md](PRIVACY.md) for details.

## Development and build

```powershell
npm ci
npm run check
npm run build:chrome
npm run build:edge
npm run release:readiness
npm run release:package
```

Unpacked builds are written to `.output/`. Release ZIP files are written to
`release/v1.0.0/`.

## License

ChatGPT2Doc is free to use. The source code is licensed under the
[PolyForm Noncommercial License 1.0.0](LICENSE): personal, academic,
educational, and other noncommercial use is allowed; commercial use requires separate permission.
Third-party components keep their own licenses; see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
