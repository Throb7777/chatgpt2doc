# Usage Guide

[README](../README.md) · [Chrome Web Store](https://chromewebstore.google.com/detail/chatgpt2doc/fbflighecngbagjcmgngndnabghckmgo?hl=zh-CN&utm_source=ext_sidebar) · [简体中文](USAGE.zh-CN.md) · [Privacy policy](../PRIVACY.md)

## Installation

### Via Chrome Web Store (recommended)

Install ChatGPT2Doc from the Chrome Web Store:

[https://chromewebstore.google.com/detail/chatgpt2doc/fbflighecngbagjcmgngndnabghckmgo?hl=zh-CN&utm_source=ext_sidebar](https://chromewebstore.google.com/detail/chatgpt2doc/fbflighecngbagjcmgngndnabghckmgo?hl=zh-CN&utm_source=ext_sidebar)

This is the recommended installation method because Chrome can update the
extension automatically.

Project source and release downloads:

- GitHub repository: [https://github.com/Throb7777/chatgpt2doc](https://github.com/Throb7777/chatgpt2doc)
- Releases: [https://github.com/Throb7777/chatgpt2doc/releases](https://github.com/Throb7777/chatgpt2doc/releases)

### Local build and manual loading

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

## Export features

### Export a single assistant response

Hover over an assistant response and click its DOCX or PDF action icon. Only
that response is exported.

### Export the full conversation

Click the DOCX or PDF icon in the floating control panel. Messages are exported
in their visible order.

### Export assistant-only content

1. Click the gear icon in the floating control panel.
2. Turn off **Include user prompts**.
3. Export the conversation from the floating control panel.

Your prompts are omitted, while assistant responses keep their original order.

### Export selected messages

1. Click **Select messages** in the floating control panel.
2. Check the user prompts or assistant responses you want to export.
3. Click DOCX or PDF in the bottom selection bar.

Empty selections cannot be exported. If ChatGPT is still streaming a response,
wait until generation has finished before exporting.

## Export progress and diagnostics

Only one export task can run at a time. During export, a progress notice shows
the current stage: content collection, document generation, or download. You can
cancel before the file starts downloading. After the file is generated, the
notice closes automatically.

By default, successful exports simply show that they are complete. If you want
layout details about missing images, unsupported formulas, incomplete content,
or visible fallbacks, turn on **Show export diagnostics** in Settings.

A fallback warning does not mean the whole export failed. It only marks content
that could not fully retain its original complex structure.

## Output behavior and compatibility

- **Word equations:** supported mathematical expressions convert to native,
  editable Word equations.
- **Unsupported formulas:** unsupported notation falls back to a rendered image
  or a clear text placeholder, never silent deletion.
- **PDF text:** generated PDF text remains searchable.
- **Image embedding:** images are embedded when the browser can access and
  decode their source URLs.
- **Missing images:** if an image cannot be embedded, the export tries to keep a
  direct source link or visible fallback.

## Copy mathematical formulas

### Copy formulas to Microsoft Word (no helper required)

The default copy target is Microsoft Word and does not require any helper:

1. Select text and formulas inside a ChatGPT message.
2. Press `Ctrl+C` (`Cmd+C` on macOS).
3. Paste normally into Microsoft Word.

On supported Windows versions of Word, formulas are converted into native,
editable Word equations. If you paste as plain text, the equation structure is
removed.

### Copy editable formulas to WPS Writer (optional helper)

WPS Office uses a different native clipboard format, so editable WPS equations
require the optional Windows helper. Chrome and Edge intentionally prevent Web
Store extensions from silently installing Native Messaging hosts, so the helper
must be installed once as a separate local component. Ordinary users do not need
to build anything from source.

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

Standard DOCX and PDF export do not require this helper. Advanced users can
still download the ZIP package or build from source; see
[the WPS helper instructions](../native/wps-helper/README.md).

## Settings

Open Settings from the gear icon in the floating control panel:

- **Language:** English or Simplified Chinese.
- **File name:** set a custom file name, or leave it blank to use the
  conversation title and timestamp.
- **Paper:** A4 or Letter.
- **Document theme:** Light or Dark.
- **Code style:** follow the document, Light, or Dark.
- **Include user prompts:** choose whether full-conversation export includes
  your prompts.
- **Show export diagnostics:** enable or disable detailed warning and fallback
  diagnostics.
- **Per-message actions:** show or hide quick export buttons beside assistant
  responses.
- **Copy target:** choose the default formula clipboard target: Microsoft Word
  or WPS Office.
- **Panel position:** drag the floating control panel; its position is
  remembered by the browser.

Click **Reset settings** to restore defaults. All preferences are stored only in
your browser's local extension storage.

## Troubleshooting

- **No export buttons appear:** refresh ChatGPT after installing or reloading
  the extension. Make sure the extension is allowed to run on `chatgpt.com`.
- **Export stays busy:** wait for the current response to finish streaming. If
  it is still stuck, cancel and retry once. Avoid running multiple exports at
  the same time.
- **Formula uses fallback layout:** turn on **Show export diagnostics** to
  inspect the formula. Unsupported syntax is shown as fallback content so the
  result remains visible.
- **Images are missing:** the browser may have been unable to read or decode
  the source URL. The extension tries to keep the original image link or a
  visible fallback.
- **WPS helper is unavailable:** install the WPS Helper Setup from Releases,
  confirm the extension ID shown in Settings if prompted, grant the required
  permission, and click **Recheck**. If Settings shows that the helper-bound ID
  differs from the current extension ID, re-run the setup with the current ID.
- **Chrome reports a missing manifest file:** make sure `npm run build:chrome`
  completed successfully. In Chrome, load `.output/chrome-mv3`, not the project
  root.
