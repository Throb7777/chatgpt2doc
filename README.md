<p align="center">
  <img src="public/icon/128.png" width="112" alt="ChatGPT2Doc icon">
</p>

<h1 align="center">ChatGPT2Doc</h1>

<p align="center"><strong>Free · Local · No subscription</strong></p>

<p align="center">
  Export ChatGPT conversations to editable Word documents and searchable PDFs.
</p>

<p align="center">
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="docs/USAGE.md">Usage guide</a> ·
  <a href="PRIVACY.md">Privacy</a> ·
  <a href="LICENSE">License</a>
</p>

## What it does

ChatGPT2Doc adds DOCX and PDF controls directly to ChatGPT. It can export:

- one assistant response;
- the complete conversation;
- assistant-only content without your prompts;
- only the messages you select.

The extension preserves headings, lists, quotes, links, citations, tables,
code blocks, images, Chinese and English text, and supported mathematical
expressions. DOCX uses editable Word equations where supported. PDF keeps text
searchable and embeds the fonts it needs.

Everything is generated on your device. There is no ChatGPT2Doc account,
conversion server, subscription, analytics, or telemetry.

## Install

### Chrome Web Store

The direct store link will be added after the public listing is approved. This
is the recommended installation method because Chrome can update the extension
automatically.

Project source and release downloads:

- https://github.com/Throb7777/chatgpt2doc
- https://github.com/Throb7777/chatgpt2doc/releases

### Load the current build manually

1. Install Node.js and npm.
2. Open a terminal in the project folder.
3. Run:

   ```powershell
   npm ci
   npm run build:chrome
   ```

4. Open `chrome://extensions`.
5. Turn on **Developer mode**.
6. Select **Load unpacked**.
7. Choose `.output/chrome-mv3`.
8. Open or refresh `https://chatgpt.com/`.

For Microsoft Edge, run `npm run build:edge`, open `edge://extensions`, and
load `.output/edge-mv3`.

## Export a document

### Export one response

Move the pointer over an assistant response and use its DOCX or PDF action.
Only that response is exported.

### Export the whole conversation

Use the DOCX or PDF icon in the floating tray. The messages are exported in
their visible order.

### Export assistant responses only

1. Open the gear icon in the floating tray.
2. Turn off **Include user prompts**.
3. Export the conversation from the floating tray.

Your prompts are omitted; assistant responses keep their original order.

### Export selected messages

1. Start **Select messages** from the floating tray.
2. Tick each user or assistant message you want.
3. Use DOCX or PDF in the bottom selection bar.
4. Leave selection mode when finished.

An empty selection cannot be exported. If ChatGPT is still generating a
response, wait until streaming finishes before exporting it.

## Export progress and warnings

Only one export runs at a time. While it is working, a progress notice shows
the current collection, rendering, or download stage. You can cancel before
the file is downloaded. The completion notice closes automatically.

By default, a successful export simply reports completion. Turn on
**Show export diagnostics** in Settings if you want details about unavailable
images, unsupported formulas, incomplete collection, or visible fallbacks.

Fallbacks do not mean that the whole export failed. They mark the exact content
that could not retain its original structure.

## Copy formulas to Microsoft Word

The default copy target is **Microsoft Word** and needs no helper:

1. Select text and formulas inside one ChatGPT message.
2. Press `Ctrl+C`.
3. Paste normally into Microsoft Word.

On supported Windows Word versions, supported formulas become editable Word
equations. Plain-text paste intentionally removes equation structure.

## Copy editable formulas to WPS Writer

WPS uses a different native clipboard format, so editable WPS equations need
the optional Windows helper.

1. Follow [the WPS helper instructions](native/wps-helper/README.md) to build
   and install it for the current extension ID.
2. Open ChatGPT2Doc Settings.
3. Change **Copy target** to **WPS Office**.
4. Allow the optional Native Messaging permission when Chrome asks.
5. Select **Recheck** until the helper status is ready.
6. Select content inside one ChatGPT message and press `Ctrl+C`.
7. Paste into WPS Writer.

The generated equations remain editable when their structures are supported.
If the helper is unavailable, ChatGPT2Doc safely falls back to the normal
Word-compatible clipboard. DOCX and PDF export never require the helper.

## Settings

Open the gear icon in the floating tray to configure:

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

## If something does not work

- **The controls are missing:** refresh ChatGPT after installing or reloading
  the extension. Confirm that the extension is enabled on `chatgpt.com`.
- **Export stays busy:** wait for the current ChatGPT response to finish, then
  cancel and retry once. Do not start several exports at the same time.
- **A formula uses a fallback:** enable diagnostics, check the visible result,
  and keep the fallback if the expression uses unsupported notation.
- **An image is missing:** the browser may be unable to read or decode its
  source. The export keeps a link or visible fallback when possible.
- **WPS says the helper is unavailable:** confirm the selected extension ID,
  reinstall the helper for that ID, grant the optional permission, and recheck.
- **The unpacked extension has no manifest:** run `npm run build:chrome` again
  and load `.output/chrome-mv3`, not the project root.

## Privacy

Conversation content is processed locally for the export or copy action you
request. ChatGPT2Doc does not upload conversations to the developer and does
not include tracking. Remote images already present in a conversation may be
read from their original addresses so they can be embedded. See
[PRIVACY.md](PRIVACY.md) for details.

## Development

```powershell
npm ci
npm run check
npm run build:chrome
npm run build:edge
npm run release:readiness
npm run release:package
```

Unpacked builds are written to `.output/`. Release ZIPs are written to
`release/v1.0.0/`.

## License

ChatGPT2Doc is free to use. Its source is available under the
[PolyForm Noncommercial License 1.0.0](LICENSE): personal, research,
educational, and other noncommercial use is permitted; commercial use requires
separate permission. Third-party components keep their own licenses in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
