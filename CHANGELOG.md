# Changelog

All notable changes to this standalone Mac app adaptation are documented here.

This project is based on the original [DatabaseEditor](https://github.com/IUrreta/DatabaseEditor) by [IUrreta](https://github.com/IUrreta), licensed under LGPL-3.0-or-later.

## 3.5.10-local.8 - 2026-04-17

### Added

- Added an Attributes page driver filter that shows only F1 main drivers in team seats 1 and 2.

## 3.5.10-local.7 - 2026-04-17

### Fixed

- Replaced native browser prompts with an in-app number modal so bulk contract, main-attribute, and team-performance edits can be entered in the desktop app.

## 3.5.10-local.6 - 2026-04-17

### Added

- Added Current grid bulk contract end-year editing for drivers, reserve drivers, and staff.
- Added per-person main-attribute bulk editing on the Attributes page for drivers and staff roles.
- Added one-click per-team overall performance editing with even part-stat distribution.
- Added a visible Game settings control to freeze or unfreeze AI car-part development.

## 3.5.10-local.5 - 2026-04-17

### Changed

- Webpack now cleans `dist/` before each build so removed UI, worker chunks, data files, and assets cannot survive in the packaged Mac app as stale build output.

### Removed

- Removed the Google Analytics tag from the local app HTML.

## 3.5.10-local.4 - 2026-04-17

### Removed

- Removed the News tab, article modals, custom-news flows, and bundled News image/template assets.
- Removed Turning Point configuration, generation, approval/cancel, storage, and related worker commands.
- Removed ADUO Turning Point controls and engine-upgrade Turning Point annotations.
- Removed external/social links from the app start screen and footer.

### Changed

- Updated the start screen copy to describe a local Mac save editor instead of a hosted browser app.
- Kept season-viewer and lineup helpers local by moving the remaining data-only utilities out of the removed News module.

## 3.5.10-local.3 - 2026-04-17

### Security

- Rewrote repository history to replace a previously committed Google API key value in `src/js/frontend/news.js`.
- Verified the current source and rewritten local refs no longer contain Google API key patterns.

## 3.5.10-local.2 - 2026-04-17

### Removed

- Removed the serverless API routes and server helper modules from `api/` and `lib/`.
- Removed Vercel deployment configuration.
- Removed hosted auth, Redis rate-limit, JWT, cookie, and OpenAI server dependencies.
- Removed frontend calls to hosted auth, session, usage, release-note, and article-generation endpoints.
- Removed hosted login, rate-limit, and support-prompt UI from the local app shell.

### Changed

- News article reads now render local save-context summaries instead of calling hosted article generation.
- The Appearance section now exposes local themes without hosted account checks.
- Build metadata now uses a local build id by default instead of deployment-provider ids.

## 3.5.10-local.1 - 2026-04-17

### Added

- Converted the editor into a standalone local macOS app using Electron.
- Added a secure Electron preload bridge for native file open/save dialogs.
- Added path-based local recents for the Mac app.
- Added desktop packaging commands:
  - `npm run build:desktop`
  - `npm run start:desktop`
  - `npm run package:mac`
- Added local `sql.js` WASM bundling so save loading no longer depends on the CDN.
- Added standalone repository metadata and attribution to the original author.

### Changed

- The local Mac app now opens `.sav` files through a native macOS file picker.
- Export and panic-download actions now use a native save dialog in the Mac app.
- Hosted login, hosted rate-limit calls, and hosted article generation are disabled in desktop mode.
- The generated app output is ignored under `release/`.

### Notes

- The generated `.app` is unsigned and intended for personal local use.
- The original browser build path remains available through `npm run build`.
