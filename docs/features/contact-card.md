# Amped Card spec: QR contact card and Wallet passes

Build Board #58. Drafted by Claude for Rob Frasca, 2026-10-27. Revision 2, 2026-10-27, after design QA. Revision 3, 2026-11-03, after Full QA (findings AC2-Q1 to AC2-Q40, `qa2/card/qa.md`). Overview: `docs/overviews/contact-card.md`. Design page: Amped Card Boards, https://claude.ai/artifact/MKgoGGj2aPvLGA9raRdwnF. Status: design done. D5 and D13 decided by Rob on 3 Nov.

## 1. Goal

An owner shows a QR code from Apple Wallet or Google Wallet. A person scans it with the phone camera and saves the owner to their address book, with the owner's Amped.Bio page and links inside the contact. No app on either side. Fewest taps possible.

Tap count target for the scanner:

| Platform | Steps |
|---|---|
| iPhone, Camera app | Scan, tap the link banner, tap Save contact, tap Create New Contact |
| Android, Camera or Google Lens | Scan, tap the link, tap Save contact, open the file in Contacts, tap Save |

## 2. What exists in the code today

Checked against `amplifydigital-web3/amped-bio-new`, branch `development` at 98db33f.

- `User` has `name`, `handle` (`littlelink_name`), `description`, `image` and `image_file_id`, `revo_name`, `rns_display`, `page_status`. There are no public phone, email, company or title fields. The account `email` is private and must stay private (#16 fix-email-exposure).
- `Block` holds links as `type: "link"` with `config: { platform, url, label, hidden? }` (`packages/constants/src/blocks.ts`). Other block types (media, text, pool, rnsid, and the messaging door) are not contact data.
- The Save contact block (#54, `docs/features/block-review-v2-wave2-design.md` section Save contact) is specified against this card: one contact record, one vCard builder, the QR on `amped.bio/c/{token}?s=b`. Not built yet.
- The client already ships `qrcode.react` (wallet Receive dialog, 2FA). It can render the on-screen QR.
- The server is Express plus tRPC (`apps/server/src/services/API.ts`). Plain REST routes already exist (`/api/analytics`, `/api/blocks/schemas`), so the vCard and pass downloads fit as REST routes.
- First-party analytics events exist (#11 analytics foundation) for the new card events.
- Follow (`apps/server/src/trpc/follow.ts:55`) accepts the sources `page`, `explore`, `pool`, `broadcast`, `qr`, `block`. Email consent is `Follow.email_updates` (`schema.prisma` model Follow); a follow alone is never email consent.
- Public identity: `computeRnsIdentity` (`apps/server/src/services/rnsIdentity.ts`) returns chip `verified`, `name` or `none`, read live with a cache that never outlives `validUntil`. The shipped chip text is "Verified" (`packages/ui/src/prism/rns-identity.tsx:69`).
- Feature flags live in `site_settings` through `packages/constants/src/feature-flags.ts` and `apps/server/src/services/featureFlags.ts` `isFeatureOn`.
- `UserOnboarding` (`schema.prisma`) has no card fields yet.

## 3. Decisions

Each decision has the recommended answer, why, and the alternatives. D1 to D4, D6 to D12 were approved with the recommendations on 28 Oct (Screen Review rows 289 to 298). Revision 3 changes D6 and D10 to match platform rules and the shipped verification code; see section 15.

**D1. What does the QR code hold?**
- Recommended: a stable short link, `https://amped.bio/c/{token}`, that opens the card page. Each surface adds a source: `?s=w` on passes, `?s=p` on print files, `?s=a` on the in app share sheet, `?s=b` on the Save contact block.
- Why: small code that scans fast from a screen; survives handle renames; the contact stays current; scans are counted; the Wallet pass never needs reissue.
- Alternative: the whole vCard inside the QR. One step on scan and works offline, but the code gets dense with many links, cannot change after print or pass issue, has no analytics, and Google Lens can drop URL fields.
- Alternative: the plain page URL `amped.bio/{handle}`. Breaks printed codes and passes when the handle changes.

**D2. What does the scanner see?**
- Recommended: a light card page with one large Save contact button, then Follow and View full page.
- Why: one clear action. The page also carries Follow, which turns a scan into a follower, and counts saves.

**D3. Which links go into the contact?**
- Recommended: the Amped.Bio page URL first, then the website from the contact record, then up to 12 visible link blocks in page order, each with its label. The owner can switch any link off for the card.

**D4. Phone and email.**
- Recommended: optional phone, email, company, title, website and location (city and country) in the shared contact record (D12), empty by default. The account email is never used.

**D5. Wallet issuer. Decided 3 Nov.**
- Decision: Apple Developer account and Google Wallet issuer under the operator named in `docs/legal` (Oneiro N.A., Inc., dba Amplify Digital), with "Amped.Bio" as `organizationName` and `cardTitle` on the pass.
- Why: the legal texts and the account emails already name that entity, so the pass issuer matches the privacy notice.
- Rejected: a separate Amplify Digital entity.

**D6. Pass design (revised in revision 3).**
- Recommended: Apple generic pass and Google Wallet generic pass. Front shows avatar, name, @handle and a square QR. Background and text colors come from the owner's theme, checked for contrast, with Prism defaults as fallback. Phase 1 passes carry no Verified line, because a phase 1 pass never updates and a verification or name can lapse. The card page shows the live Verified chip. The Verified line returns on the pass in phase 2, when passes update on every verification change.

**D7. Exchange back.** Phase 1 ships Follow under Save contact. Share my details comes in phase 2.

**D8. Referral credit from scans.** The card token resolves to the owner, so the server attributes a signup that starts on the card page to the owner's referral. Rewards follow the existing referral program and its counsel status; the card and pass make no reward claims.

**D9. Who gets a card.** Every account with a published page, while the `ampedCard` flag is on. Accounts with no public page see a prompt to publish first.

**D10. Where it lives in the app (revised in revision 3).**
- Recommended: a Share card button in the top bar opens a sheet with the QR, Copy link, Share link, Save QR and the Wallet button for the device: Add to Apple Wallet on iPhone and iPad, Add to Google Wallet on Android. Never both on a phone. Desktop uses the handoff code (section 9.6). An unknown platform sees both badges. Card settings sit in Page, Card.
- Why: an Apple pass only installs on Apple devices and Google Wallet only runs on Android. A second badge is a dead end.

**D11. Adult content.** The card, contact and pass never include 18+ links, gated links, paid links or hidden blocks. A creator with 18+ items still gets a card for the public page only.

**D12. Relation to the Save contact block.** One contact record and one vCard builder for both. The record fields are name, first and last name, title, company, email, phone, website and location. The block's QR points to the card's stable link; `amped.bio/{handle}/contact` redirects to it. The block's access rule (SC3) applies to its typed details on both surfaces.

**D13. Android memory phrase. Decided 3 Nov.**
- Decision: iPhone keeps "Double press. Show. Saved." Android uses "Open Wallet. Show. Saved." in the guide, success and Home reminder.
- Why: double pressing the side button opens Apple Wallet on every iPhone. Android has no gesture that opens Google Wallet on every device.
- Rejected: one phrase for both; "Double press" on Android.

## 4. Data model

```prisma
// New entities use UUID v7 BINARY(16) keys (AGENTS.md)
model ContactCard {
  id         Bytes     @id @db.Binary(16)
  user_id    Int       @unique
  token      String    @unique @db.VarChar(16)   // base62, 8 chars, url safe, random
  // { photo, bio, page, links: { [blockId]: boolean } }. Contact details
  // come from the shared contact record (D12), not from this table.
  fields     Json?
  // optional overrides; null uses theme colors
  style      Json?
  revoked_at DateTime?
  created_at DateTime  @default(now())
  updated_at DateTime? @updatedAt
  user       User      @relation(fields: [user_id], references: [id], onDelete: Cascade)
  passes     WalletPass[]
  handoffs   CardHandoff[]
  @@map("contact_cards")
}

// The shared record (D12). One per account. Personal data.
model ContactRecord {
  id         Bytes     @id @db.Binary(16)
  user_id    Int       @unique
  first_name String?   @db.VarChar(60)
  last_name  String?   @db.VarChar(60)
  title      String?   @db.VarChar(60)
  company    String?   @db.VarChar(60)
  email      String?   @db.VarChar(120)
  phone      String?   @db.VarChar(32)     // E.164 on save
  website    String?   @db.VarChar(200)    // https only
  location   String?   @db.VarChar(60)     // city and country only
  updated_at DateTime? @updatedAt
  user       User      @relation(fields: [user_id], references: [id], onDelete: Cascade)
  @@map("contact_records")
}

enum WalletPlatform { APPLE GOOGLE }

model WalletPass {
  id          Bytes          @id @db.Binary(16)
  card_id     Bytes          @db.Binary(16)
  platform    WalletPlatform
  serial      String         @unique @db.VarChar(64)  // Apple serialNumber or Google object suffix
  auth_token  String?        @db.VarChar(64)          // Apple authenticationToken, phase 1 (registration only)
  added_at    DateTime?      // Apple device registration or Google save callback
  removed_at  DateTime?      // Apple unregister or Google del callback
  created_at  DateTime       @default(now())
  card        ContactCard    @relation(fields: [card_id], references: [id], onDelete: Cascade)
  @@index([card_id])
  @@map("wallet_passes")
}

model CardHandoff {
  id         Bytes       @id @db.Binary(16)
  card_id    Bytes       @db.Binary(16)
  nonce_hash String      @db.VarChar(64)
  expires_at DateTime    // created_at plus 10 minutes
  used_at    DateTime?
  card       ContactCard @relation(fields: [card_id], references: [id], onDelete: Cascade)
  @@index([card_id])
  @@map("card_handoffs")
}
```

Phase 2 adds `AppleDeviceRegistration { device_id, push_token, pass_id }` push use and Google object updates on change.

`UserOnboarding` gains `card_guide_seen_at DateTime?` and `card_uses Int @default(0)`. `card_uses` counts `card_view` events with source `w` or `a` (the owner showed the code). The Home reminder shows while `card_uses < 3`.

Contact record fields are personal data. They are deleted on account deletion (`docs/features/account-deletion.md`).

## 5. Routes

Every route checks `isFeatureOn("ampedCard")`. Off: owner routes answer 404 and the card page shows the inactive page.

| Route | Auth | Returns |
|---|---|---|
| `GET amped.bio/c/{token}` | Public | Card page (client route). Revoked or unknown token, suspended or deleted owner, unpublished page or flag off: one inactive page with neutral copy (section 7). |
| `GET /api/card/{token}.vcf` | Public, rate limited | `text/vcard; charset=utf-8`, `Content-Disposition: inline; filename="{Name}.vcf"`. With `?block={id}` the Save contact block's access rule runs first (403 with the hint when locked). |
| `GET /api/card/me/apple.pkpass` | Owner | `application/vnd.apple.pkpass`, signed pass |
| `GET /api/card/me/google` | Owner | 302 to `https://pay.google.com/gp/v/save/{signedJwt}` (skinny JWT, section 8) |
| `GET /api/card/me/qr.png` and `.svg` | Owner | Print quality QR on `?s=p`, 1024 px PNG and vector SVG |
| `GET /api/card/me/print.pdf` | Owner | Print sheet: 10 cards, 85 by 55 mm, QR on `?s=p` |
| tRPC `card.get`, `card.update`, `card.rotateToken` | Owner | Card settings |
| tRPC `card.addHandoff` | Owner | A `CardHandoff` with a signed link to `app.amped.bio/card/add?h={nonce}`, valid 10 minutes, single use |
| tRPC `card.public({ token })` | Public | Display data for the card page, switched on fields only |
| Apple pass web service, registration only in phase 1: `POST` and `DELETE /v1/devices/{deviceId}/registrations/pass.bio.amped.card/{serial}`, `POST /v1/log` | Pass auth token | Sets `WalletPass.added_at` and `removed_at` |
| `POST /api/card/google/callback` | Google signed callback | Save and delete events from the class `callbackOptions`; sets `added_at` and `removed_at` |
| Phase 2: `GET /v1/devices/.../registrations/...`, `GET /v1/passes/...` | Pass auth token | Serve updated passes |

Rate limits through the shared limiter (`hitRateLimit`, `docs/features/rate-limiting.md`): vCard 30 per minute per IP, shared with the Save contact block; `card.public` standard public limit; `card.addHandoff` 10 per hour per owner.

Why some routes are REST: `AGENTS.md` prefers tRPC. The vCard, `.pkpass`, QR, PDF and pass callbacks must be fetched by the browser, Wallet or Google as files or webhooks, so they are plain routes like the existing `/api/analytics` and `/api/blocks/schemas`. Everything else is tRPC.

## 6. The vCard

One builder, shared with the Save contact block. vCard 3.0, UTF-8, CRLF line endings, lines folded at 75 octets, values escaped (comma, semicolon, backslash, newline).

```
BEGIN:VCARD
VERSION:3.0
N:Reyes;Maya;;;
FN:Maya Reyes
NICKNAME:@mayareyes
NOTE:DJ and producer. Saved from Amped.Bio.
PHOTO;ENCODING=b;TYPE=JPEG:{base64, 256x256, under 40 KB}
ORG:{company, if set}
TITLE:{title, if set}
TEL;TYPE=CELL:{phone, if set}
EMAIL;TYPE=INTERNET:{email, if set}
ADR;TYPE=WORK:;;;{city};;;{country}
item1.URL:https://amped.bio/mayareyes
item1.X-ABLabel:Amped.Bio
item2.URL:https://mayareyes.com
item2.X-ABLabel:Website
item3.URL:https://instagram.com/mayareyes
item3.X-ABLabel:Instagram
REV:2026-10-27T13:00:00Z
END:VCARD
```

Rules:
- `N:;{display name};;;` unless first and last name are set in the record.
- Labels come from the block label, falling back to the platform name.
- Only `https` links are written (#57 link URL scheme fix applies).
- `X-SOCIALPROFILE` is not used in phase 1.
- The photo is best effort. Some iOS versions drop `PHOTO` on import; the contact still saves.
- SC3: while the Save contact block's Who can open this is not Everyone, the card vCard without a passing block check leaves out phone, email, website and location.
- The handler never reads `user.email`.

## 7. The card page

- Route `amped.bio/c/{token}`, server rendered or prerendered shell so it paints fast.
- Content: avatar, name, @handle, the shipped identity chip (`computeRnsIdentity`, chip `verified` shows "Verified" with the shipped sheet and its endorsement line), bio line, Save contact (primary), Follow, View full page.
- Save contact is a plain link to the vCard route, so it works in every browser. On iPhone Safari and Chrome it opens the contact sheet directly.
- After the tap the page shows a platform hint for 30 seconds. iPhone: scroll to the bottom of the contact and tap Create New Contact. Android: tap Open in the bar at the bottom, then tap Save.
- When the visitor returns to the tab, Follow becomes the primary under the line "Next, follow {name}", with Save contact again and Not now. The page cannot know the contact was saved, so it never says it was.
- Follow from the card page uses the Fan Graph follow with source `card` (add `card` to `FOLLOW_SOURCES` in `apps/server/src/trpc/follow.ts`). A signed out visitor goes through sign up or sign in and returns to the card page with the follow done. The follow sheet carries the unticked choice "Email me {name}'s updates", which writes `Follow.email_updates` and `email_updates_at`. No copy promises emails unless that box is ticked.
- vCard answers 429: "Too many saves from this network. Try again in a minute." with Try again.
- In-app browsers (Instagram, TikTok, X) may block the file. The page shows "Open in your browser to save" with Open in browser and Copy link, as the checkout does.
- Inactive page copy, one for every inactive case: "This card is not active. Ask the owner to show you their current code." with Search Amped.Bio and Get your own card. No owner data, no reason.
- Desktop visitors see the same page plus a hint to scan with their phone.
- Theme: Prism 2.2 frame with the owner's accent color. No particles or motion layer.
- Open Graph tags carry name and avatar so a shared card link previews well. No 18+ content in previews.

## 8. Wallet passes

**Apple.**
- `formatVersion: 1`, `passTypeIdentifier: "pass.bio.amped.card"`, `teamIdentifier` from the Oneiro N.A., Inc. Apple Developer account (D5), `serialNumber` = `WalletPass.serial`, `organizationName: "Amped.Bio"`, `description: "Amped Card for {name}"` (VoiceOver reads it), style `generic`.
- `barcodes: [{ format: "PKBarcodeFormatQR", message: "https://amped.bio/c/{token}?s=w", messageEncoding: "iso-8859-1", altText: "amped.bio/c/{token}" }]`.
- Fields: header "AMPED CARD", primary name, secondary @handle. No Verified field in phase 1 (D6). Back fields: "Show this code" how-to, Your page, Card link, Change what is on it (`app.amped.bio/page?tab=card`). No "Last updated" field.
- Images: `icon.png`, `logo.png` (Amped.Bio mark), `thumbnail.png` (avatar), each at 1x, 2x, 3x.
- `webServiceURL` and `authenticationToken` are set in phase 1 so device registration confirms the add (`added_at`). Phase 1 never pushes.
- Signed on the server with the Pass Type ID certificate, its key and the Apple WWDR certificate. Library: `passkit-generator` (Node). Certificates live in the secrets store, never in the repo.
- Badge: the official Add to Apple Wallet artwork, unaltered, shown only on Apple devices.

**Google.**
- One Generic class for Amped.Bio, created once, with `callbackOptions.url` set to the callback route.
- One Generic object per owner, inserted through the REST API before the save link is issued. The save JWT carries only the object id (skinny JWT) and `origins: ["https://app.amped.bio"]`.
- Object: `cardTitle` "Amped.Bio", `subheader` @handle, `header` name, `logo` avatar, `hexBackgroundColor` from theme, `barcode: { type: "QR_CODE", value: "https://amped.bio/c/{token}?s=w", alternateText: "amped.bio/c/{token}" }`, `state: "ACTIVE"`. No Verified text in phase 1.
- JWT signed with the Google Cloud service account key authorized in the Wallet console.
- Generic, not Generic Private: the pass carries no sensitive data.
- Badge: the official Add to Google Wallet artwork, shown only on Android.

**Rotation, deletion, suspension.** `card.rotateToken` issues a new token and revokes the old one. The old QR and passes open the inactive page. Rotation, account deletion and suspension also patch every Google object to `state: "EXPIRED"` and clear `header`, `subheader` and `logo` through the REST API, so Google holds no name or photo for a closed card. Apple passes cannot be removed from a device; they open the inactive page. In phase 1 the owner re-adds the pass after rotation.

## 9. Owner UI

Prism 2.2. Boards C1 to C8 at 390 and D1, C4D at 1440. Shell: top bar with title, Share card, bell and avatar on phones; the Prism rail, top bar with save status, View page, Copy page link, Help, Share card, bell and avatar at 1440. Dock: Home, Page, Inbox, Wallet, More.

1. **Share sheet** (Share card in the top bar on every screen, the Home Amped Card card, Page, Card). Large QR (at least 240 px, alt text "QR code for amped.bio/c/{token}") on `?s=a`, the short link, Copy link, Share link, Save QR, and the Wallet button for the device (D10). After `added_at` is set, the button becomes the In Apple Wallet or In Google Wallet row.
2. **Guide.** Three steps, shown the first time the share sheet opens and from How Amped Card works. iPhone: Put it in your Wallet, Double press to show it, They scan. You are saved. Android: Put it in Google Wallet, Open Wallet to show it, They scan. You are saved. The platform phrase (D13) heads every step. The last step ends on the device's Wallet button.
3. **Success.** Shown when the owner returns from the Wallet sheet. With `added_at` set: Your card is in Wallet, the phrase, and Try it now. Without it after 10 seconds: Did it add? with Try again and Done.
4. **Home.** An Amped Card card with 7 day Scans, Downloads (vCard served) and Follows, and Show my card. Empty: "No scans yet. Show your code at your next event." The reminder line shows while `card_uses < 3`.
5. **Page, Card.** Page gets two tabs: Content (today's screen) and Card. Preview of the contact as the scanner will save it. Switches: photo, bio line, page link, each link. Gated, paid, hidden and 18+ links show locked off with the reason. Contact details: first and last name, phone, email, company, title, website, location, with the line "Shared with your Save contact block" when the page has one, and the SC3 line "Your Amped Card leaves these out while that block is locked" when it is locked. Pass colors: From my theme (default) or custom, contrast checked at 4.5:1. Get a new card link with a confirm.
6. **Desktop.** The share dialog shows the private handoff code (For you, not to share) with "Works for 10 minutes" and New code, the expired state, the public card link with Copy, and Card QR PNG, SVG and Print sheet.

## 10. Analytics

| Event | When | Properties |
|---|---|---|
| `card_view` | Card page loads | token owner, source (`w` wallet, `p` print, `a` app, `b` block, none for a typed link), platform |
| `card_contact_saved` | vCard served | platform |
| `card_follow` | Follow from card page | follow source `card` |
| `card_wallet_added` | `added_at` set by Apple registration or Google callback | `apple` or `google` |
| `card_qr_downloaded` | QR or print file downloaded | format |

Owners see card views, downloads and follows on Home and in Analytics, Overview.

## 11. Security and privacy

- The token is random, not derived from the user id.
- Public routes return only fields the owner switched on.
- Hidden blocks, gated links, paid links and 18+ items are filtered on the server.
- Contact phone and email are never shown on the public page itself, only inside the downloaded contact, and only when the owner set them.
- vCard route rate limited and served with `Cache-Control: private, max-age=60`, or `private, no-store` when the Save contact block is not open to Everyone.
- Suspended accounts (`docs/features/suspended-pages.md`) serve the inactive page and expire their Google objects.
- Passes carry name, @handle, avatar and the card link. No phone, email or Verified claim.

### For counsel

`docs/legal` is counsel text and is not edited here. Before launch counsel adds to `docs/legal/privacy-parameters.md` and the visitor notice:
- Contact record fields (phone, email, website, location) and their deletion on account close.
- Card scan events (`card_view`, `card_contact_saved`, `card_wallet_added`) and their retention (25 months, as visit events).
- Apple and Google as recipients of pass data (name, @handle, avatar, card link) when the owner adds a pass, and the Google object expiry on close.
- Whether the change is material for `CONSENT_POLICY_VERSION`.

## 12. Dependencies and setup

- `ampedCard` public flag in `packages/constants/src/feature-flags.ts`, default off, checked on the server in every card route.
- Apple Developer Program membership under Oneiro N.A., Inc., dba Amplify Digital (D5), Pass Type ID, signing certificate.
- Google Wallet issuer account under the same entity (D5).
- Google Wallet issuer account, business profile, a Generic class with callbacks, then Request Publishing Access. Until approved, passes reach test accounts only and their titles start with TEST ONLY.
- #16 fix-email-exposure, #57 fix-link-url-scheme, #11 analytics foundation, #22 Fan Graph (Follow), #54 Save contact block, rate limiting, suspended pages, account deletion.

## 13. Build steps

1. Schema: `ContactCard`, `ContactRecord`, `WalletPass`, `CardHandoff`, `UserOnboarding.card_guide_seen_at` and `card_uses`. Migration.
2. Flag: add `ampedCard` to `FEATURE_FLAGS` (scope public). Server: `isFeatureOn("ampedCard")` in every card route and procedure.
3. `apps/server/src/services/card/vcard.ts` `buildVCard(record, card, links, { blockCheck })`, shared with the Save contact block.
4. `apps/server/src/services/card/apple.ts` `buildApplePass(card)` and the registration routes; `google.ts` `upsertGoogleObject(card)`, `saveLink(objectId)`, `expireGoogleObjects(cardId)` and the callback route.
5. `apps/server/src/trpc/follow.ts`: add `card` to `FOLLOW_SOURCES`.
6. `apps/server/src/services/moderation/suspend.ts` `suspendUser` and the account deletion job call `expireGoogleObjects`.
7. Rate limits through `hitRateLimit` with the keys in section 5.
8. Client: Share sheet, guide, success, Home card, Page, Card, desktop dialog, card page, inactive page, per boards.

## 14. Acceptance tests

1. A published account opens Share and sees a QR that scans to `amped.bio/c/{token}?s=a`.
2. iPhone Camera scan, Save contact: the contact sheet shows name, photo and every switched on link with its label; Create New Contact saves it.
3. Android Camera and Google Lens scan, Save contact: the Contacts app imports the same fields.
4. A hidden block, a gated link, a paid link and an 18+ item never appear in the vCard, the card page or the pass.
5. Renaming the handle keeps the QR and pass working, and the contact uses the new page URL.
6. Editing a link changes the next saved contact with no pass reissue.
7. Add to Apple Wallet adds a pass with the owner's colors, name, handle and QR on `?s=w`; device registration sets `added_at`.
8. Add to Google Wallet saves the pass (test account until publishing access); the save callback sets `added_at`.
9. Rotate link: the old link shows the inactive page; the new QR works; the Google object is EXPIRED with no name or logo.
10. With phone and email empty, the vCard has no TEL or EMAIL lines; the account email never appears anywhere.
11. In Instagram's in-app browser, the page offers Open in your browser.
12. Each event in section 10 records once per action.
13. The vCard route returns 429 above its limit and the page shows the rate limited state.
14. The guide opens once on the first share sheet open, never again unless How Amped Card works is tapped.
15. After Save contact, the iPhone or Android hint matches the visitor's platform.
16. The desktop handoff code opens Add to Wallet on a signed in phone, works once, and expires after 10 minutes.
17. An iPhone never shows Add to Google Wallet and an Android phone never shows Add to Apple Wallet.
18. No pass shows a Verified line in phase 1. The card page shows Verified only while `computeRnsIdentity` returns chip `verified`.
19. Follow from the card page records source `card` with `email_updates` false unless the box is ticked.
20. With `ampedCard` off, the top bar has no Share card button and every card link shows the inactive page.
21. A suspended or deleted owner's card link shows the inactive page and the Google object is EXPIRED.

## 15. Revision 3 changes (Full QA, 3 Nov)

- D6: no Verified line on phase 1 passes (AC2-Q21).
- D10: one Wallet button per device (AC2-Q1).
- D12: website and location join the record, matching the Save contact block spec (AC2-Q18).
- D13 added: Android phrase (AC2-Q7). D5 and D13 decided by Rob on 3 Nov as recommended.
- QR sources `w`, `p`, `a`, `b` and the Apple and Google QR values (AC2-Q4, AC2-Q23).
- Apple required keys; Google skinny JWT, origins, alternateText and layout (AC2-Q22, AC2-Q24, AC2-Q25).
- Wallet add confirmed by Apple registration and Google callbacks (AC2-Q11).
- Google objects expire on rotation, deletion and suspension (AC2-Q26).
- Follow source `card` and the `email_updates` choice (AC2-Q28, AC2-Q29).
- One neutral inactive page and a rate limited state (AC2-Q35, AC2-Q36).
- `ampedCard` feature flag (AC2-Q5).
- Privacy items moved to For counsel (AC2-Q27).

## 16. Sources

- Apple, Creating a generic pass: https://developer.apple.com/documentation/walletpasses/creating-a-generic-pass
- Apple, Pass keys (Pass.json): https://developer.apple.com/documentation/walletpasses/pass
- Apple, Add to Apple Wallet guidelines: https://developer.apple.com/wallet/Add-to-Apple-Wallet-Guidelines.pdf
- Google Wallet, Working with JWTs: https://developers.google.com/wallet/generic/use-cases/jwt
- Google Wallet, Generic pass template and fields: https://developers.google.com/wallet/generic/resources/template
- Google Wallet, Callbacks: https://developers.google.com/wallet/generic/use-cases/use-callbacks-for-saves-and-deletions
- Google Wallet, Issuer account setup: https://developers.google.com/wallet/generic/getting-started/issuer-onboarding
