# Optional editable WPS helper for ChatGPT2Doc

This Windows-only local helper adds the WPS-native clipboard format used for editable equations. The Chrome/Edge extension continues to work without it; Microsoft Word copy remains browser-local HTML/MathML.

## Build

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\native\wps-helper\build.ps1
```

## Install for an unpacked extension

Find the 32-character extension ID on `chrome://extensions`, then run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\native\wps-helper\install.ps1 -ExtensionId <chrome-extension-id>
```

Pass both IDs as a comma-separated PowerShell array when enabling Chrome and Edge builds.

Reload the extension, open its settings, and choose **WPS Office** as the copy target. Chrome requests the optional native-application permission at that moment, not at initial install.

## Uninstall

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\native\wps-helper\uninstall.ps1
```

## Privacy and security

- Local Windows process only; no listening port and no network access.
- Accepts only `ping` and bounded `prepare-wps-clipboard` messages.
- Validates the DOCX ZIP structure before writing the clipboard.
- Does not persist conversation content.
- Registered only for the explicitly supplied Chrome/Edge extension ID.
