# ACU Plugin Visual Acceptance

Date: 2026-11-15. Baseline: `090a8e7cce76f27ea8d33604cd28fba2256f804b`.
Task branch: `feat/acu-plugin-visuals-20261115`.

## Passed

- `npm test`: 96 tests, zero failures.
- `npm run backup:typecheck`: passed.
- `npm audit --audit-level=high`: zero vulnerabilities.
- `npm run extension:zip`: both editions built; fixed identities verified and
  every ZIP entry compared against actual build output.
- `node scripts/check-acu-ui.mjs`: passed for both popup editions and connection
  pages, with keyboard, saving, error/retry and native-connection fixture states.
- Backup scanning retains explicit source selection and refuses to enable
  download without a selected directory.
- Library opens a genuine OPFS directory fixture, persists its handle, displays
  the graph, and navigates between graph and asset lists without remote media.
- Injected Companion bundle mounts, reads focused node context, performs local
  detection and closes. Its panel remains inside 1440/920/390px viewports.
- Backup center and library screenshots at 1440/920/390px; no page overflow.
- Popup body is limited to 600px with internal scrolling and a visible save
  footer, including expanded advanced settings.

Screenshots are in `artifacts/private/acu-ui/`. They contain synthetic data only.
Candidate ZIPs are in `releases/tapnow-{companion,backup}-0.1.30-chrome.zip`.
They are not the published 0.1.30 bytes and must not be uploaded over that release.

## Existing Type Diagnostics

The Companion compiler baseline check ran against `090a8e7` using independently
generated WXT declarations and identical dependencies. All seven diagnostics are
unchanged (ignoring line locations), with zero added diagnostics. They are the
existing media-element narrowing and LLM diagnostics/result-type issues in
`entrypoints/tapnow.content.ts` and `utils/llm.ts`. The popup/connect explicit type
check reaches three of those existing LLM errors through shared imports; no
popup, connection or new styling-module error was reported. Full Companion
typecheck is not claimed green.

## Not Claimed

No real cloud inference, real user canvas mutation, real backup download,
Windows/macOS Load Unpacked/update, publisher release or Runtime catalog change
was performed. Browser fixture acceptance does not replace those deployment and
device tests. Credentials, extension identities, permissions, native contracts,
backup data and accounting semantics were not changed.
