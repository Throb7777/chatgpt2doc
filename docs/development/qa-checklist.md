# QA Checklist

## Automated gates

```powershell
npm run check
npm run build:chrome
npm run build:edge
npm run test:browser-load
npm run qa:m7.1
npm run qa:m7.5:release
npm run qa:m16.1:wps-helper
npm run release:readiness
npm run release:package
```

## Manual acceptance gates

- Load `.output/chrome-mv3` in Chrome developer mode.
- Export one representative response to DOCX.
- Export one representative response to PDF.
- Confirm successful export toast auto-dismisses.
- Copy a representative formula into Microsoft Word and confirm it remains editable where Word supports the MathML path.
- Select WPS Office, confirm helper status is ready, copy a supported formula, and confirm WPS editability.

## External coverage still separate

Clean VM/Sandbox checks and representative Word/WPS version coverage are external acceptance tasks. They are not required for local packaging, but must not be claimed as completed until actually performed.
