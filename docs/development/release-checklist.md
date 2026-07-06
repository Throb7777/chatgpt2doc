# Release Checklist

Run this checklist before publishing source or uploading a browser package.

## Source readiness

- `npm ci` succeeds on a clean checkout.
- `npm run check` passes.
- `npm run release:readiness` passes.
- Public source archive contains required source/docs/license files.
- `package.json`, `LICENSE`, and both READMEs identify `PolyForm-Noncommercial-1.0.0` and clearly prohibit unlicensed commercial use.
- Public source archive excludes `.reference-private`, `.output`, `.wxt`, `node_modules`, `release`, `docs/qa-artifacts`, `docs/qa-screenshots`, secrets, and helper binaries.

## Extension package readiness

- `npm run build:chrome` passes.
- `npm run build:edge` passes.
- `npm run release:package` creates Chrome and Edge ZIP files.
- `npm run release:package` creates the optional WPS helper setup EXE when Inno Setup 6 is installed.
- `npm run release:helper-installer` can rebuild just the WPS helper setup EXE.
- Each extension ZIP has `manifest.json` at the ZIP root.
- Chrome manifest requires only `storage`.
- Chrome manifest declares only optional `nativeMessaging`.
- Web-accessible resources are limited to packaged fonts scoped to `https://chatgpt.com/*`.

## Store readiness

- Store listing text is present in `docs/store/`.
- Privacy disclosures match `PRIVACY.md` and `PRIVACY.zh-CN.md`.
- Screenshots exist under `docs/store/screenshots/`.
- Small promotional image exists under `docs/store/promotional/`.
- Test instructions explain DOCX/PDF export and optional WPS helper behavior.
- The store description links to the final GitHub repository.
- After Google creates the public item, replace the pending README sentence with the direct Chrome Web Store item URL and verify both directions before publishing either page.

## Not part of this task

- Creating a remote repository.
- Pushing code.
- Uploading to Chrome Web Store.
- Publishing a release publicly.
