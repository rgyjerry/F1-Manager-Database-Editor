# F1 Manager Database Editor - Local Mac App

A standalone macOS app for editing F1 Manager save files locally. This repo packages the browser-based editor into an Electron app with native Mac file open/save dialogs, local recent files, and bundled runtime assets so the core editor works without relying on the original hosted deployment.

## What This Repo Is

- A local Mac app wrapper around the F1 Manager save editor.
- A standalone repository, not a maintained GitHub fork.
- Intended for personal/local use on macOS.
- Built from the original open-source editor by [IUrreta](https://github.com/IUrreta), with credit preserved in [NOTICE.md](NOTICE.md).

## What Works Locally

- Open `.sav` files through a native macOS file picker.
- Drag and drop save files into the app.
- Edit supported save data using the existing editor UI.
- Export edited saves through a native save dialog.
- Use panic download/export behavior locally.
- Reopen files from local recents.
- Load `sql.js` from the bundled app instead of a CDN.

## Hosted Features Disabled In The Mac App

The original hosted app includes Patreon and OpenAI-backed features that depend on server-side secrets and Vercel API routes. This standalone Mac app does not recreate that hosted backend.

Disabled in desktop mode:

- Patreon login/logout.
- Hosted daily rate-limit checks.
- OpenAI article generation.

The normal web build path still exists for development compatibility.

## Build The Mac App

```bash
npm install
npm run package:mac
open "release/mac-arm64/F1 Manager Database Editor.app"
```

The generated app is unsigned and not notarized. macOS may show a first-launch warning.

## Development

```bash
npm run build
npm run build:desktop
npm run start:desktop
```

`npm run build` builds the browser bundle. `npm run build:desktop` builds the desktop-mode bundle. `npm run start:desktop` builds and launches the Electron app.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Attribution

This standalone repo is adapted from [IUrreta/DatabaseEditor](https://github.com/IUrreta/DatabaseEditor). The original editor UI, save parsing/editing behavior, and core feature set come from IUrreta's LGPL-licensed work.

Additional original project credits preserved from upstream:

- [xAranaktu for the Save Repacker](https://github.com/xAranaktu/F1-Manager-2022-SaveFile-Repacker)
- F1 Dark font, used under CC BY 4.0. Source: https://www.onlinewebfonts.com

## License

LGPL-3.0-or-later. See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).
