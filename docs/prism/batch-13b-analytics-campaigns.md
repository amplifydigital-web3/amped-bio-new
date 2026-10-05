# Prism batch 13b: Analytics, Campaigns tab (Screen Review 093)

Stacked on #259 (batch 13a, branch `ui/prism-analytics`). Merge #259 first, then this PR.

Restyle in place. No feature flag.

## Scope

| Item | What changed |
| --- | --- |
| I30 | Create form on Prism fields. One row at 1440 (name, channel select 233, Create link), one column at 390. Name validates on blur: "Use at least 2 characters." Server errors (the 200 limit, name conflicts) show under the form, not in a toast. The new campaign opens after it is created. |
| I31 | Campaign rows are G0 rows 55 with name, channel and figures (Views and Click-through only at 390). One open row at a time, drawn as the G3 lens with rim: link well, Copy link (Copied for 2 seconds), QR code with a 144 QR and Download PNG, Archive, and "Campaign ID {id}". |
| I32 | Archive has no confirm. Toast "Campaign archived" with Undo for 8 seconds. Restore on archived rows. "Show N archived" / "Hide archived" ghost button. Archived rows show the Archived badge and ink 2 text, no opacity. |
| I33 | Empty state "No campaigns yet" with the how to open. Two 55 skeleton rows after 400ms. Error card "Campaigns did not load" with Retry. |
| I37 | Pixel settings must load before any form shows. A failed load shows "Pixel settings did not load" with Retry and no Save. Each save sends only the fields that changed, so a failed or partial load can no longer wipe stored IDs or tokens. |
| I38 | Ad pixels section: eyebrow, intro, three provider rows (Google Analytics 4, Meta, TikTok) with Connected or Not connected. One opens at a time. Token field under the pixel ID, "Server-side events active.", Remove token, and one Save per provider. |
| I39 | Pixel IDs validate on blur with the server schema messages verbatim. |
| I40 | The responsibility notice, verbatim, on the solid compliance notice at the top of every open provider panel. |
| D2 | Required terms checkbox under the notice until the current terms version is on record. Save stays disabled with "Accept the terms to save." Creators with pixels from before are asked once at the top of the section. Approved token help lines for Meta and TikTok. Toast "Pixels saved. Terms accepted." |
| I41 | Campaign and pixel guides open by default only when the section is empty. |

## Server and data

- Migration `20261002120000_add_tracking_pixels_terms`: adds `terms_version VARCHAR(32) NULL` and
  `terms_accepted_at DATETIME(3) NULL` to `tracking_pixels`. Existing rows stay null.
- `trackingPixels.update` accepts `termsVersion` (`CREATOR_TRACKING_TERMS_VERSION`). A save that
  sets any ID or token is refused with PRECONDITION_FAILED unless the current version is on
  record or sent with it. Clearing an ID or removing a token is always allowed.
- `trackingPixels.get` returns `termsAccepted`.
- Pixels already live for creators who have not accepted keep loading. Counsel has not decided
  whether to pause them (D2 counsel question 1).

## Before release

- Publish the Creator Analytics and Tracking Terms at `CREATOR_TRACKING_TERMS_PATH`
  (`/terms/analytics` on the public site). The checkbox links there. The addendum is still the
  draft in `docs/legal/` and the page does not exist yet.
- Bump `CREATOR_TRACKING_TERMS_VERSION` when the published terms change.

## Strings not in the approved wording

- "Token removed" is not used. Removing a token shows the existing "Tracking settings saved".
- Token labels drop "(optional)", since the approved help lines start with "Optional.":
  "Meta Conversions API access token", "TikTok Events API access token".
- Provider Save labels for the other two providers follow the approved "Save Meta settings":
  "Save Google Analytics settings", "Save TikTok settings".
- The pixel how to drops its first step, which is now the section intro.
- Card title "Campaign links" per the board.

## Checks

- Typecheck (turbo), client `tsc -b`, client and server builds, eslint on changed files.
- Harness at 1440 and 390: no horizontal scroll, blur validation, archive with Undo, 200 limit
  message under the form, Save disabled until the terms box is ticked, no Save reachable when the
  settings fail to load.
