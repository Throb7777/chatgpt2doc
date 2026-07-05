# Privacy Policy

Effective date: 2026-07-04

[简体中文](PRIVACY.zh-CN.md) · [README](README.md)

ChatGPT2Doc processes ChatGPT conversation content locally in your browser
sandbox to generate DOCX and PDF files.

## Data Collection

The extension does not collect, sell, transmit, or retain your conversation
text, conversation titles, message identifiers, browsing history, generated
files, or error payloads on any developer-operated server.

ChatGPT2Doc contains no account system, data analytics, telemetry,
advertisements, subscriptions, licensing checks, or remote document conversion
services.

## Local Storage

The `storage` permission is used exclusively to save your local configuration
preferences:

- interface and document language settings;
- custom file naming format;
- paper size selection (A4 or Letter);
- include user prompts option;
- document theme (Light or Dark);
- code block styling (Follow document, Light, or Dark);
- conversation collection and copy-target clipboard preferences;
- floating panel position and export diagnostics visibility.

These settings are stored locally on your device under the
`chatExport.settings.v2` namespace and can be reset to default values at any
time from the settings panel.

## Optional WPS Integration

If you choose to enable WPS Office copy compatibility mode, the extension will
request the optional `nativeMessaging` permission.

- **Helper communication:** the extension communicates only with your separately
  installed local WPS helper utility to place a bounded DOCX/OMML package onto
  your native clipboard.
- **Local restrictions:** the helper does not open any network ports and does
  not transmit document content over the internet.
- **No helper required for Word:** standard copy compatibility with Microsoft
  Word remains fully functional without this helper.

## Page Access

The extension runs exclusively on `https://chatgpt.com/*`. It only reads
conversation DOM content when you actively trigger an export action. All data
parsing, processing, and document generation occur inside your local browser
sandbox.

## Images and Network Requests

When exported content includes a remote image URL, the extension may request
that image from its original source hosting address to embed it into the
generated document.

- **Privacy safeguards:** the extension omits credentials, such as cookies, and
  suppresses the page referrer header for these requests. No conversation text
  or context is added to the request by the extension.
- **Standard web logs:** the image hosting server can still observe typical
  connection metadata, such as the request URL and IP address.
- **Fallback behavior:** if the network request is blocked by the browser,
  source server, CORS policy, file size limit, or image decoder, the output
  document preserves a direct source link or a visible fallback representation.

Bundled PDF fonts are read directly from the installed extension bundle and are
exposed only to `chatgpt.com` as packaged extension resources.

## Downloads

Generated DOCX and PDF files are downloaded locally using browser Blob URLs
initiated by your actions. The extension does not request or require the broad
`downloads` permission.

## Clipboard Copy Enhancement

The copy enhancement runs only when you actively press `Ctrl+C` (`Cmd+C` on
macOS) to copy ChatGPT message content.

- **Word copy mode:** uses the browser's native rich-text clipboard path.
- **WPS copy mode:** after you choose WPS and install the helper, uses the local
  helper for formula compatibility.
- **Data safety:** clipboard content is never sent to a developer server.

## Permissions

ChatGPT2Doc follows a minimal-permission design:

- **`storage`:** saves your local preferences.
- **`https://chatgpt.com/*`:** lets the extension run on ChatGPT, show export
  controls, and read conversation content only when you request it.
- **Optional `nativeMessaging`:** requested only when you enable WPS Office copy
  compatibility mode.

The extension does not request or use unnecessary sensitive permissions such as
Downloads, Identity, History, Cookies, Tabs, broad host access, or remote code
execution.

## Changes to This Policy

Any future update that introduces data collection, requires additional
permissions, accesses other hosts, or connects to external services must publish
an updated version of this policy before release.

## Contact

Privacy inquiries or issues can be reported through GitHub:

- Project homepage: [https://github.com/Throb7777/chatgpt2doc](https://github.com/Throb7777/chatgpt2doc)
- Issues: [https://github.com/Throb7777/chatgpt2doc/issues](https://github.com/Throb7777/chatgpt2doc/issues)
