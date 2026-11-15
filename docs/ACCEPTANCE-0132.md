# TapNow 0.1.32: Popup Layout And Recall Evidence

## Changes

- Companion action popup uses an intrinsic 560px width and 580px height rather
  than constraining its width to the initially negotiated viewport. Header,
  tabs and Save stay outside the content scroller. Backup keeps its 380px width.
- General settings and API configuration are separate accessible keyboard tabs.
  Protocol, model, endpoint and Key are visible together above Save. Advanced
  prompt/import controls remain available in an independently scrolling section.
- Header offers an extension-owned full settings page for longer editing, using
  the same storage and save code, without extra permissions or Key URLs.
- Companion returns real creative-assist evidence from background to panel,
  preserving server order and showing at most five adopted references in a
  collapsed section, including source quote, scope and application when present.
- No-match, disabled, absent or unavailable recall has no user-facing section
  or added warning; its state remains in developer information. No fabricated
  vector scores or claim of raw vector ranking. Existing server order is the
  advisor's grounded selection order, not a separately measured similarity score.
- Official ACU endpoint normalization now enables the existing recall path for
  acu.best and official Console subdomains as well as api.acucompute.com.

## Verification

The new intrinsic-width regression failed against 0.1.31 (380 instead of 560).
Browser regression covers all four API inputs above Save, successful saving,
keyboard tabs, expandable advanced controls, full settings at desktop/mobile,
and the built background/content roundtrip with six grounded fixture references.
It asserts first-five ordering, collapsed default and no-match disappearance
with status retained in developer JSON. No paid calls or real user data.

98 unit tests pass. Backup typecheck passes. Companion baseline comparison
against f5372e7 has the same seven existing diagnostics, zero additions.
Release must pass the tagged workflow, public ZIP digest/identity verification
and Runtime's public channel/native-message checks before activation is complete.
