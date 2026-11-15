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

## Authorized Publication

The user authorized main integration and formal publication on 2026-11-15.
Source/tag revision: `dbceafa` (`v0.1.31`).
[Workflow 43736216159](https://github.com/jerry0012009/acu-tapnow/actions/runs/43736216159)
passed, including the new browser UI gate. The public, non-prerelease version
was published at `2026-11-15T16:34:57Z`.

Both downloaded release ZIPs match the release catalog size and SHA-256, retain
their exact fixed identity, and every unpacked file matches the reviewed local
build. Published packages:

- Companion: 54,920 bytes,
  `9283ca1d175ba4f5008d38c1ac72faeaf6d7ff45f6b7f890beee5af8211babac`.
- Backup: 195,762 bytes,
  `ea0ee4e0359a82cb3c6d7bebfa1404bec5f117e8acbdf1723f2c0e435eec4fb8`.

Runtime native-message acceptance passed again using those downloaded ZIPs:
actual MV3 -> native executable -> authenticated isolated Runtime -> local
configuration readback -> receipt. Existing team rules retained, Backup received
no Key, and no cloud/inference request was made. Runtime TapNow Go tests passed.
Runtime's native browser test now checks the model input is attached, not visible,
because advanced settings are deliberately collapsed (`acu-runtime` `0f68e36`).

The Runtime channel is activated after publication using the catalog from the
downloaded release, not a separately rebuilt archive. Existing Runtime reads
this remote main-branch catalog; no Runtime binary or backend restart is needed.
Users must reload unpacked extensions in Chrome after Runtime updates their
files. This publication does not claim a remote change to a user's browser or
ordinary Windows/macOS Load Unpacked acceptance.

Post-activation verification used Runtime's actual `tapnowCatalogURL`, HTTP
client, `validTapnowPackage`, `prepare` and `tapnowPreparedIdentity`, with a
temporary installation root. `ACU_TAPNOW_RELEASE_VERSION=0.1.31 go test -run
'^TestTapnowPublishedChannelPreparesBothEditions$' -count=1 -v .` passed for
both editions. This fetched the live main catalog and downloaded both public
assets; no fixture transport or production user installation was used.
