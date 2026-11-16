# TapNow 0.1.33: New Canvas Backup And Task UI

## Diagnosed And Fixed

The Backup source parser accepted only `/canvas/<uuid>` and its launcher was
hidden on `/p/` and `/collection/`. Companion already supported these routes.
Backup now reuses the strict shared route parser, including standalone `?t=c`
and collection `?c=<canvas>` entries, retaining source-tab and canvas binding.
Project-only URLs never become canvas IDs.

Public frontend evidence checked on 2026-11-16: TapNow index
`index-Du0Qc7lK.js` and `vendor-pkg-endpoints-D8cabmAF.js` retain full v1 nodes
and connections cursor endpoints. Backup continues to paginate full API data;
it does not scrape only visible GPU/DOM nodes or invent undocumented endpoints.
Canvas metadata accepts the current direct envelope as well as the old wrapper.
HTTP-200 permission errors, missing page flags/IDs/cursors, and wrong canvas IDs
fail before enabling backup. Canvas-level cover references are now included.

The download engine, DNR Referer, allowlisted hosts, incremental hashes and
readback verification are retained, not replaced speculatively. The route bug
prevented reaching that chain in new canvases.

UI uses a compact two-column source/destination workspace and a full-width
execution band. Added a bounded asset list with escaped/text-only names, paths,
individual results and failure reasons. Partial runs stay visibly partial;
small writes use B/KB/MB rather than misleading `0.00 GB`. Narrow screens stack
controls without horizontal overflow. No promotional artwork or new privileges.

## Verification

- Unit tests cover new route binding, current/legacy metadata, complete page
  contracts and invalid envelopes. Existing download tests remain intact.
- `scripts/check-backup-flow.mjs` loads the real built MV3 Backup extension,
  opens a fixture `/p/<project>?c=<canvas>`, clicks its launcher, and exercises
  the actual background and bridge with a non-secret fake login.
- Two API pages include an offscreen node, current/history/alternate media and
  a canvas cover. Files are downloaded from a loopback HTTPS origin mapped to
  the allowlisted media hostname. The test server verifies DNR Referer on real
  network requests and no page Bearer token on media requests.
- A genuine isolated OPFS directory receives original bytes, reports and hash
  objects. Readback and SHA-256 are checked. HTTP 404 remains partial, retry
  reuses the verified object, recovery completes both targets, and source
  navigation invalidates stale scan state.
- Desktop/920px/390px screenshots, plus complete/partial task states, are saved
  under `artifacts/private/backup-flow`. Normal UI regressions remain in
  `artifacts/private/acu-ui`. Both now run before release publication.

This is isolated browser acceptance, not a claim of testing the user's actual
account, all remote assets, ordinary OS directory chooser or every TapNow data
shape. No real user canvas was modified or downloaded, no model was invoked,
and no production backend restart is needed. Public release/channel activation
requires workflow success and downloaded ZIP verification.
