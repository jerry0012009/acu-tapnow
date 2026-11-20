# TapNow 0.1.34: Mainland Site Compatibility

The published 0.1.33 manifests matched only `app.tapnow.ai`. Version 0.1.34
adds `app.tapnow.media` to Companion and Backup, for both classic and new
canvases. Backup validates the source origin together with tab and canvas ID.
It uses that site's session for canvas reads and never sends the page token to
media hosts. Local backup folder layout and extension IDs are unchanged.

## Publication

- Release tag `v0.1.34`, source `e27a8cd`, published 2026-11-20 at 04:45:35 UTC.
- Workflow `44676413382` passed 102 unit tests, npm audit and real Chromium
  extension tests on fixtures for both sites. The tests exercised automatic
  injection, Companion node read, backup scanning and hash verification, and
  invalidation after cross-site navigation.
- Both downloaded ZIPs matched their release manifest, fixed extension ID,
  SHA-256 and size. All unpacked files matched the reviewed local builds.
- The downloaded release catalog was activated on `main` in `01b890e`.
- The downloaded ZIPs also passed the isolated Chromium native-messaging
  round trip to Runtime, and the mainland backup fixture passed again.
- After the CDN cache refreshed, Runtime's live channel acceptance downloaded,
  verified and safely extracted both 0.1.34 packages with their fixed IDs.

Runtime does not need a new build for this update. After updating the plugin
files, reload both unpacked extensions in Chrome, allow access to the TapNow
site in use, then refresh the canvas tab. Runtime's displayed connected version
is the version confirmed by the installed extension, not just the catalog.
No authenticated real TapNow account or personal Chrome installation was used.
