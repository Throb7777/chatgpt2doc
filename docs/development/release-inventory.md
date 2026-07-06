# Release Inventory

Updated: 2026-07-05

## Publishable source categories

- Product source: `src/`
- Automated tests: `tests/`
- Static extension assets: `public/icon/`, `public/fonts/`
- Optional local helper source and installer script: `native/wps-helper/`, excluding `dist/`
- Build and QA scripts: `scripts/`
- Public documentation: `README.md`, `README.zh-CN.md`, `PRIVACY.md`, `PRIVACY.zh-CN.md`, PolyForm Noncommercial `LICENSE`, `THIRD_PARTY_NOTICES.md`, `docs/USAGE.md`, `docs/USAGE.zh-CN.md`, `docs/store/`, `docs/development/`
- Package and tool configuration: `package.json`, `package-lock.json`, `wxt.config.ts`, `tsconfig.json`, `vitest.config.ts`, `eslint.config.js`

## Store package categories

- Chrome store ZIP source: `.output/chrome-mv3/`
- Edge ZIP source: `.output/edge-mv3/`
- Both ZIPs must have `manifest.json` at the ZIP root.
- Neither ZIP may contain source docs, tests, local release folders, private reference material, or helper binaries.

## Helper release artifact categories

- WPS helper setup EXE: `release/v1.0.0/wps-helper/chatgpt2doc-wps-helper-setup-v1.0.0.exe`
- WPS helper advanced ZIP: `release/v1.0.0/wps-helper/chatgpt2doc-wps-helper-v1.0.0.zip`
- These helper artifacts are separate GitHub Release downloads. They are not bundled inside the Chrome or Edge extension ZIP.

## Local-only categories

- `.reference-private/`
- `.output/`
- `.wxt/`
- `.tmp/`
- `tmp/`
- `node_modules/`
- `native/wps-helper/dist/`
- `release/`
- `docs/qa-artifacts/`
- `docs/qa-screenshots/`

## Cleanup status

- `.gitignore` and `.releaseignore` now exclude local build, private, QA, and release-output directories.
- Old duplicated source TTF files under `src/assets/fonts/**` were removed; font binaries are packaged from `public/fonts/`, while OFL license files remain under `src/assets/fonts/**`.
- Historical RC ZIP directories are removed once superseded by the current release package. QA evidence remains local only when a current verification command or non-reproducible manual acceptance still depends on it.
