# Architecture Overview

ChatGPT2Doc is a Manifest V3 browser extension that turns visible ChatGPT content into local DOCX/PDF files and Word/WPS-friendly clipboard content.

## Main runtime layers

1. ChatGPT integration (`src/platform/chatgpt`, `src/export`)
   - Discovers ChatGPT messages.
   - Extracts visible rich content into a platform-neutral document AST.
   - Mounts export/copy controls and settings UI.

2. Document model (`src/document`)
   - Defines typed content nodes for text, links, code, tables, images, math, quotes, and separators.
   - Keeps extraction independent from DOCX/PDF rendering.

3. DOCX renderer (`src/renderers/docx`)
   - Produces editable Word structures where possible.
   - Emits native OMML for the supported math subset.
   - Uses explicit visible fallback for unsupported structures.

4. PDF renderer (`src/renderers/pdf`)
   - Produces direct-download searchable PDFs.
   - Loads packaged local fonts from `public/fonts`.
   - Keeps math, CJK, Latin, symbol, and code glyph routing local.

5. Clipboard and WPS integration (`src/clipboard`, `src/integrations/wps`, `native/wps-helper`)
   - Default Word-compatible copy remains browser-only.
   - Optional WPS compatibility uses a separately installed local Native Messaging helper.
   - The helper is local-only and does not open ports or send network requests.

6. UI (`src/ui`)
   - Preact components for the floating tray, actions, settings, progress, and warnings.
   - Chinese and English strings are centralized in `src/ui/i18n.ts`.

## Release boundary

The Chrome Web Store ZIP is built from `.output/chrome-mv3` and must contain `manifest.json` at the ZIP root.

The public source package excludes local build output, private reference material, generated release artifacts, historical QA binaries, and governance logs listed in `.releaseignore`.
