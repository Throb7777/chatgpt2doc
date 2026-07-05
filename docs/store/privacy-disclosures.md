# Store Privacy And Permission Disclosures

## Single Purpose

Export user-selected ChatGPT conversation content to local DOCX and PDF files.

## Permission Justification

- `storage`: save non-sensitive export preferences only.
- Optional `nativeMessaging`: requested only after the user selects WPS Office
  copy compatibility; communicates with the separately installed local WPS
  helper to place a bounded DOCX/OMML package on the local clipboard.
- `https://chatgpt.com/*` content-script match: display export controls and read
  conversation DOM content only when the user initiates an export.

No `downloads`, identity, history, cookies, tabs, broad host, or optional host
permission is requested. The optional local helper opens no network port and
does not transmit document content.

## Data Use Answers

- Personally identifiable information: not collected.
- Health information: not collected.
- Financial and payment information: not collected.
- Authentication information: not collected.
- Personal communications: processed locally for the requested export; not
  collected, retained by the developer, sold, or transmitted to a developer
  server.
- Location: not collected.
- Web history: not collected.
- User activity: not collected.
- Website content: read locally on ChatGPT for the user-requested export; not
  used for advertising, analytics, credit decisions, or unrelated purposes.

## Remote Code

No remote code is executed. Application code, renderers, and fonts are bundled
with the extension. Packaged TTF files are exposed only to `chatgpt.com` so the
content script can read them for local PDF generation.

## Network Boundary

The extension has no backend or telemetry endpoint. A remote image present in
the selected conversation may be fetched from its original URL without
credentials or a referrer so it can be embedded. Failure preserves a link and
warning. No chat text is added to that request.

## Certification

The disclosure matches `PRIVACY.md`, `PRIVACY.zh-CN.md`, the built Manifest V3
packages, and the M7.1/M7.5 privacy and release audits.
