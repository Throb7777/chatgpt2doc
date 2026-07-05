# Usage Guide

[README](../README.md) · [简体中文](USAGE.zh-CN.md) · [Privacy](../PRIVACY.md)

## Install

### Chrome Web Store

The direct store link will be added after the public listing is approved. This
is the recommended installation method because Chrome can update the extension
automatically.

Project source and release downloads:

- [https://github.com/Throb7777/chatgpt2doc](https://github.com/Throb7777/chatgpt2doc)
- [https://github.com/Throb7777/chatgpt2doc/releases](https://github.com/Throb7777/chatgpt2doc/releases)

### Local build

1. Install Node.js and npm.
2. Open a terminal in the project folder.
3. Run:

   ```powershell
   npm ci
   npm run build:chrome
   ```

4. Open `chrome://extensions`.
5. Turn on **Developer mode**.
6. Choose **Load unpacked**.
7. Select `.output/chrome-mv3`.
8. Open or refresh `https://chatgpt.com/`.

For Microsoft Edge, run `npm run build:edge`, open `edge://extensions`, and
load `.output/edge-mv3`.

## Export

### One assistant response

Move the pointer over an assistant response and click its DOCX or PDF action.
Only that response is exported.

### Full conversation

Use the DOCX or PDF icon in the floating tray. Messages are exported in their
visible order.

### Assistant-only content

Open Settings from the gear icon, turn off **Include user prompts**, then
export from the floating tray. User prompts are omitted and assistant responses
keep their original order.

### Selected messages

Start **Select messages** from the floating tray, check the messages you want,
then export from the bottom selection bar. Empty selections cannot be exported.

Wait for ChatGPT to finish streaming before exporting a response.

## Progress and warnings

Only one export runs at a time. The progress notice shows collection, rendering,
and download stages. You can cancel before the file is downloaded. Successful
notices close automatically.

By default, a successful export only reports completion. Turn on **Show export
diagnostics** in Settings if you want details about unavailable images,
unsupported formulas, incomplete collection, or visible fallbacks.

Fallbacks do not mean the whole export failed. They mark the exact content that
could not keep its original structure.

## Output behavior

- Supported Word equations are native and editable.
- Unsupported equations stay visible through a rendered or text fallback.
- PDF text remains searchable.
- Images are embedded when the browser can read and decode them.
- If an image cannot be embedded, the export keeps a source link or visible
  fallback where possible.

## Copy formulas to Microsoft Word

The default copy target is **Microsoft Word** and needs no helper:

1. Select text and formulas inside one ChatGPT message.
2. Press `Ctrl+C`.
3. Paste normally into Microsoft Word.

On supported Windows Word versions, supported formulas become editable Word
equations. Plain-text paste intentionally removes equation structure.

## Copy editable formulas to WPS Writer

WPS uses a different native clipboard format. Editable WPS equations therefore
need the optional Windows helper:

1. Follow [the WPS helper instructions](../native/wps-helper/README.md) to
   build and install it for the current extension ID.
2. Open ChatGPT2Doc Settings.
3. Change **Copy target** to **WPS Office**.
4. Allow the optional Native Messaging permission when Chrome asks.
5. Select **Recheck** until the helper status is ready.
6. Select content inside one ChatGPT message and press `Ctrl+C`.
7. Paste into WPS Writer.

DOCX and PDF export never require the helper.

## Settings

- **Language:** English or Simplified Chinese.
- **File name:** leave empty to use the conversation title and timestamp.
- **Paper:** A4 or Letter.
- **Document theme:** light or dark.
- **Code style:** follow the document, light, or dark.
- **Include user prompts:** include or omit prompts in conversation exports.
- **Show export diagnostics:** show detailed fallback and warning information.
- **Per-message actions:** show or hide actions beside assistant responses.
- **Copy target:** Microsoft Word or WPS Office.
- **Panel position:** drag the floating tray; its position is remembered.

**Reset settings** restores the defaults. Preferences stay in browser-local
extension storage.

## Troubleshooting

- **Controls are missing:** refresh ChatGPT and confirm the extension is enabled
  on `chatgpt.com`.
- **Export stays busy:** wait for the current ChatGPT response to finish, cancel,
  and retry once.
- **A formula uses a fallback:** enable diagnostics and check the visible result.
- **An image is missing:** the browser may be unable to read or decode its
  source; the export keeps a link or fallback when possible.
- **WPS helper is unavailable:** confirm the extension ID, reinstall the helper
  for that ID, grant the optional permission, and recheck.
- **Chrome says the manifest is missing:** run `npm run build:chrome` again and
  load `.output/chrome-mv3`, not the project root.
