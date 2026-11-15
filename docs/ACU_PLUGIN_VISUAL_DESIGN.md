# ACU TapNow Visual Design

## Product Direction

Companion and Backup are working tools, not promotional surfaces. Use a shared
charcoal interface with compact typography, stable control sizes and deliberate
orange accents. Keep the user's canvas and media visually primary. Do not tint,
filter or darken original media to fit the theme.

The previous interfaces mixed blue/white settings, teal review panels and green
backup/viewer screens. This revision unifies their appearance without changing
credentials, native-message contracts, inference payloads or backup formats.

## Visual Rules

- Background `#111214`, surface `#191b1e`, controls `#222529`, separators `#35383e`.
- Primary text `#f2f3f5`, secondary `#c4c7ce`, muted `#9a9fa9`.
- ACU orange `#ff9c42`, with dark foreground on filled primary buttons.
- Orange identifies primary actions, active views, focused nodes and progress.
  Mint and red remain reserved for success and failure, alongside status text.
- Shared Lucide icons, 6px control corners and visible keyboard focus rings.
- No decorative gradients, glow, ornamental animation or nested floating cards.
- Main theme source: `viewer/acu-theme.css`, also consumed inside the Companion
  shadow root. The standalone local viewer serves this file from its own root.

## Surfaces Implemented

1. Companion popup: shared brand/version header, native checkbox switches,
   Runtime connection, team rules, collapsed model/advanced/import settings.
   Internally scrolling content and a persistent save footer fit Chrome's
   600px popup height. Save failures are visible and leave retry available.
2. Companion canvas: matching movable launcher and review panel, restrained
   result colors, readable content fields, fixed header/footer and scrolling
   results. Closing, dragging, detecting and lifecycle logic remain intact.
3. Backup popup: one primary backup command, secondary local-library command,
   Runtime connection and explicit no-model-Key status.
4. Backup center: numbered source/destination/execution sections, aligned
   controls, tabular metrics and orange progress. Narrow layouts become linear.
5. Local library: matching toolbar, tabs, graph, inspector, file lists and
   integrity-check controls. Node status colors and selection remain distinct.
6. Both connection pages: shared branding, local connection status, retry and
   success actions. No model request is made by connection.

## Validation And Distribution Boundary

`scripts/check-acu-ui.mjs` exercises built output with isolated browser APIs and
non-secret fixtures. It tests keyboard switches/disclosures, save success/failure,
connection retry/success, scan guards, graph/list navigation, responsive layouts
and the actual injected Companion bundle. Local library fixtures use browser
OPFS directory handles, including actual IndexedDB directory persistence.

Run `npm test`, `npm run backup:typecheck`, `npm run extension:zip`, then
`node scripts/check-acu-ui.mjs`. The release workflow now runs this browser check
before publication and uploads fixture-only screenshots.

Local ZIPs retain the existing version solely as development candidates. They
must not replace published 0.1.30 assets. A public release needs a new version,
verified ZIP identities, publication, and subsequent runtime-channel activation.
No public tag, release, catalog activation or installed user profile was changed
for this design task.
