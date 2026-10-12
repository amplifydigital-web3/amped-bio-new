# Batch 20: Facet request, an app asks for a proof (Screen Review 107)

Each batch PR documents itself in its own file under `docs/prism/`, so open PRs never conflict on `docs/PRISM.md`.

Rob asked for the full UI now, ahead of the server work. Everything new sits behind `VITE_SHOW_FACET_REQUEST`, which is `false` in every client env file. The flag also needs `VITE_SHOW_RNS` and `VITE_RNS_IDENTITY`. All data goes through one client module whose only implementation today is a stub that answers "not available". No server endpoint is added and no request or proof data is invented.

## Rows

| Row | Screen | Result |
|---|---|---|
| 107 | Facet request: an app asks for a proof (dialog over the RNS name page) | UI built behind the flag. Server, Authbase and counsel items wait (see Waits) |

## Decisions applied

Row 107 has no decisions. The approved boards (dialog, consent page, states, mobile 390) are the source of truth, with the evaluation board fixes already drawn.

## What changed

### 107

| Piece | File | Rule |
|---|---|---|
| Facet scopes and lists | `packages/ui/src/oauth/facet-scopes.ts` | `facet:<key>` scopes, the facet catalog (Over 18 at the standard check, Lives in the US at the Enhanced check), `buildFacetLearnLists` from every scope in the request: profile moves Your name and profile picture and Your wallet address to THEY LEARN and leaves Your ID number in THEY DO NOT LEARN; email adds Your email address; a facet only request keeps the board lists (I03). Copy per I12: Authbase checked it, Made for this request only. `formatProofLifetime` renders the expiry from the server value (I07) |
| One card | `packages/ui/src/oauth/facet-request-card.tsx` | `FacetRequestCard`, shared so the consent page and the editor Dialog never drift (I01). Header with the 44 art tile r13 (logo or initials), title 20/23 700 with tabindex -1, host from client_uri. Facet slab (G2 r21, 44 icon tile on nav tint, 26/33 fact, 13/16 source). Two neutral wells r13 padding 13 on rgba(22,21,43,0.04) with the line ring, 13 caps headings, 16/20 items, success green on the check icons only (I11). Expiry line 13/16 with the info icon. Decline ghost 44, Share proof primary 55 last (I09). Channel `consent` reads asks you to sign in and prove one fact |
| Requester line | same | Requested by `<rnsName>`. with the Verified owner badge (26 r8, nav tint) only when the server marks the owner verified and sends an RNS name. Otherwise the solid warning notice: This app is not verified. Only share if you trust `<host>`. The app's own name is never the trust signal (I02) |
| States | same | Ready; working (spinner in Share proof, both buttons disabled, the dialog cannot be dismissed); error (Could not create the proof. Try again. Nothing was shared. with Decline and Retry); cannot prove (Authbase cannot confirm this for you. with Close); owner not verified (You need a verified identity to share this. with Verify with Authbase); tier too low (This needs the Enhanced check. with Get the Enhanced check); request expired (This request expired. Go back to the app and try again. with Close) (I04, I06, I07, I08) |
| Data seam | `apps/client/src/components/panels/wallet/rns/identity/facetRequestApi.ts` | `FacetRequestApi`: `lookup(id)`, `approve(id)`, `decline(id)` with typed results (found, expired, not found, unavailable; shared with redirect, failed, expired; declined with redirect). The request record carries the scopes, the facet scope, the requester from verified data, the owner status, `proofTtlSeconds` and `requestExpiresAt`. The client never sends the audience or the nonce. `facetRequestApi` is the stub: every call answers `unavailable`. Wiring the real API replaces that one export |
| Editor Dialog | `apps/client/src/components/panels/wallet/rns/identity/FacetRequestDialog.tsx` | D21 Dialog (G1 raised, r21, padding 34, 508, close 44). Focus opens on the title and follows it when the content changes (I09). Escape, the close button, outside click, Decline, Close on cannot prove and Close on expired all call the same `decline`, so the app gets one answer (I04, I09). Share proof shows the toast Proof shared with `<app>` and follows the server redirect (http or https only) (I06). A clock expires the request at `requestExpiresAt` (I07). Loading skeleton. Not available (the stub): Proof requests are not available yet. Not found and unsupported facet states. Below 640 the shared Dialog is the bottom sheet with r34 top corners and the 44 grab handle; the wells stack and the actions go full width with Decline above Share proof (I10) |
| Route | `rns/route.ts`, `rns/useRnsRoute.ts` | `/wallet?tab=rns&name=<label>&view=facets&request=<id>`. `request` joins the RNS params, `clearRequest` closes the dialog, switching the tab drops the request |
| Name page | `rns/name/NamePage.tsx` | Renders the dialog only for the name's owner and only with the flag on. Verify with Authbase and Get the Enhanced check open the Identity tab (row 103) |
| Flag | `config/rns/flags.ts`, `vite-env.d.ts`, `apps/client/.env.*` | `RNS_FLAGS.facetRequest` = `VITE_SHOW_RNS` and `VITE_RNS_IDENTITY` and `VITE_SHOW_FACET_REQUEST`. `VITE_SHOW_FACET_REQUEST=false` in development, staging, production, testing and client-only |
| Tests | `apps/server/src/__tests__/facet-learn-lists.test.ts` | Facet only lists match the board; profile and email move items to THEY LEARN; no item is in both columns; the expiry line reads the server value |

## Instruction coverage

| Id | Status | Where |
|---|---|---|
| I01 | Partly. The card is in `packages/ui` and the editor Dialog uses it. The consent page branch in `OAuthConsentScreen` is not wired: the server does not issue facet scopes yet and the landing page has no flag for it | `facet-request-card.tsx`, `FacetRequestDialog.tsx` |
| I02 | Client done. The verified flag and RNS name must come from `oauthApps.publicRequester`, which waits | `facet-request-card.tsx` |
| I03 | Done | `facet-scopes.ts`, tests |
| I04 | Client done: Close and Decline call the same function. Identical response and timing to the app is server work | `FacetRequestDialog.tsx` |
| I05 | Not built. Server change in `auth.ts`, waits on the facet scopes | |
| I06 | Client states done. The FacetProof row and the Authbase proof wait | `FacetRequestDialog.tsx`, `facet-request-card.tsx` |
| I07 | Client done. Both values come from the request record; the server sends them once it exists | `facet-scopes.ts`, `FacetRequestDialog.tsx` |
| I08 | Done. The primary opens the Identity tab; the Identity tab has no way yet to open at Review with Enhanced set | `facet-request-card.tsx`, `NamePage.tsx` |
| I09 | Done | `FacetRequestDialog.tsx` |
| I10 | Done, except drag to dismiss: the shared Dialog has no drag gesture. Escape and the close button decline | shared `Dialog`, `facet-request-card.tsx` |
| I11 | Done | `facet-request-card.tsx` |
| I12 | Done | `facet-scopes.ts` |

## Notes

- The dialog is the editor variant over the RNS name page, as row 107 routes it. The board draws it over the Facets tab; any `view` works, and links should use `view=facets`.
- A visitor or a signed in account that does not own the name never sees the dialog. The owner must have the wallet that owns the name.
- Done follows the redirect the server returns. In the editor variant without a redirect, the toast confirms and the dialog closes.
- The facet catalog holds the two facets the boards draw. More facets are added to `FACET_CATALOG` after counsel reads them.
- Privacy: the card shows only what the server returns about the request. It stores nothing. Before release, check the lists and the requester line against `docs/legal/privacy-parameters.md`.

## Waits

1. Authbase proof API. There is no Authbase facet credential and no proof API; the only Authbase call is the public status endpoint (`apps/server/src/services/authbase.ts`). Authbase has not confirmed the proof scheme in writing. Until then `facetRequestApi` stays the stub.
2. Facet scopes. `apps/server/src/utils/auth.ts` has no `facet:<key>` scopes in `OAUTH_SCOPES`, no `FACETS_ENABLED` server flag, and no rule that forces consent for facet scopes for trusted clients and `skipConsent` clients (I05). `customUserInfoClaims` does not return facet proofs.
3. Consent hook. Nothing writes a `FacetProof` row (the model does not exist in `schema.prisma`), asks Authbase for the proof with the client_id as audience and the request nonce, or answers cannot prove with the same `access_denied` as Decline. There is also no request lookup by id and no `oauthApps.publicRequester` (app name, host, owner RNS name, verified) with its server side reverse RNS lookup.
4. Counsel review. The THEY LEARN and THEY DO NOT LEARN strings, the facet list and labels, and the unverified requester notice need counsel before the flag turns on anywhere.

## How to test on staging

The flag is off on staging, so the dialog does not render at https://app.staging.amped.bio. To see it:

1. Build the client with `VITE_SHOW_FACET_REQUEST=true` (staging env otherwise) and deploy or preview it.
2. Sign in with the wallet that owns an RNS name. Open https://app.staging.amped.bio/wallet?tab=rns&name=<your name>&view=facets&request=test.
3. The dialog reads Proof requests are not available yet with Close. Close removes `request` from the URL. This is the stub answer and the only state reachable until the server work ships.
4. At 390 the dialog is the bottom sheet with the grab handle.
5. Open the same URL for a name you do not own: no dialog.
6. With the flag off (the default): no dialog for anyone.

The ready, working, error, cannot prove, not verified, tier too low and expired states render only when `lookup` returns a request, which needs the API in Waits.

Screenshots are not included.
