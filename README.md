# TapNow ZIP Distribution And Runtime Setup

TapNow 0.1.25 adds native connection directly inside both Chrome action popups,
without externally navigating to chrome-extension pages. It retains official
login-source endpoint compatibility, including
`console.acucompute.com`, for the Runtime installation flow. Based on upstream `f3df6c6`
and native-connection source `b51fc5d`. Release assets are available only after
the tagged plugin workflow completes successfully.
Selected installation is ZIP extraction plus Chrome Load Unpacked. Chrome Web
Store is not required. No trial/shared production Key is bundled.

Runtime handles ZIP download, SHA-256/size verification, extraction to a stable
directory, current-user Native Messaging registration and opening Chrome's
extension page. Users still enable developer mode and confirm Load Unpacked the
first time, or Reload after updates. No enterprise policy, protected preferences,
browser termination or claim of invisible installation is used.
Runtime provides progress, three-step loading guidance, copy-directory and reopen
controls, cancellation and continuation using retained files. The post-connection
page links directly to TapNow. User action in Runtime authorizes preparation and
configuration without an additional consent checkbox.

On first install, `connect.html` opens automatically. User authorizes in Runtime;
the extension claims the five-minute grant over `com.acucompute.tapnow`, saves the
selected Key/model/endpoint locally, reads fields back and sends a receipt. Backup
rejects credentials. No Key copy/paste or configuration file is needed. Connection
makes no inference request. Existing rules, prompt and image choices remain.
Popup's JSON import is an advanced fallback; such files contain credentials.

`extension-identities.json` has public keys and derived IDs for each edition.
WXT includes the same key in each ZIP, and build checks the derived ID. Do not
regenerate them on update. They identify unsigned unpacked extensions, not signed
authenticity: any local code can copy a public key. Trust verified release bytes
and the local account, not ID alone. Existing old copies with other IDs must be
disabled explicitly; storage does not migrate between IDs automatically.

Supported ACU endpoints use HTTPS under `acucompute.com` or `acu.best`, including
official subdomains and existing `/acu/v1` API paths. Imported and inference URLs
reject credentials, queries, fragments, nonstandard ports and lookalike domains.
The exact selected provider origin is retained. Key/config live in
local storage only; team settings stay user-owned. Native connection pages use a
browser lock, single-use grant and idempotent receipt for retries. Managed popup
settings remain editable; manual save exits managed-model mode.

## Publish And Update

```sh
npm ci
npm test
npm run extension:zip
node scripts/runtime-channel.mjs
node scripts/export-runtime-source.mjs EMPTY_DIRECTORY
```

Export selects source only for `jerry0012009/acu-tapnow`, excluding old history,
real canvas data, old releases and trial keys. Build/test new ZIPs there, publish
assets to the exact catalog URLs, then activate `runtime-channel.json` in main.
Both editions have independent versions. For one-edition updates retain the
other edition's verified catalog entry. Never replace existing release assets.

Runtime updates the same extracted path; user reloads in Chrome. Same ID preserves
storage. User backups are elsewhere and must never be deleted. ZIP extensions do
not receive automatic Chrome Web Store updates. Browser-compatible/plugin-contract
changes require testing; ordinary compatible releases need no Runtime rebuild.

Local native smoke tests use the actual built keys and isolated Chromium, not a
real user's Chrome installation. Windows/macOS Load Unpacked, update/storage
retention, Runtime current-user host registration and real authorized canvas
acceptance remain public release gates. Existing content/LLM type diagnostics are
reported separately from successful builds/tests.
