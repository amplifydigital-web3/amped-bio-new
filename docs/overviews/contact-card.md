# Amped Card: your Amped.Bio page as a QR code in your Wallet

Build Board #58. Drafted by Claude for Rob Frasca, 2026-10-27. Updated 2026-11-03 after Full QA. Spec: `docs/features/contact-card.md` (revision 3). Area: Creator.

## Why this exists

People meet in person every day. A creator at an event, a DJ after a set, an agency at a booth. Today they say "find me on Amped.Bio" and spell a handle. Most of those contacts are lost.

Amped Card fixes that in two moves. The owner keeps a QR code in Apple Wallet or Google Wallet. The other person points their camera at it and saves the owner as a contact, with every Amped.Bio link already inside the contact. No app on either phone.

## What it does

**For the owner.** A Share card button in the top bar opens the owner's QR code, ready to scan. Under it sit the Wallet button for the phone (Add to Apple Wallet on iPhone, Add to Google Wallet on Android), Copy link, Share link and Save QR. Page, Card picks what goes into the contact: name, photo, bio line, the Amped.Bio page and the page's links. Phone, email, company, title, website and location are optional, shared with the Save contact block, and empty until the owner types them in.

**For the person scanning.** The camera opens the owner's card page in the browser. It shows the photo, name, the Verified chip when the owner is verified, and one large button: Save contact. On iPhone the contact sheet opens with the owner's details filled in, and Create New Contact saves it. On Android the phone opens the contact in the Contacts app to save. The saved contact carries the owner's Amped.Bio page and each link as labeled web addresses.

Under the button sit Follow on Amped.Bio (the existing Follow, with an unticked choice for email updates) and View full page.

**Always current.** The QR code points to a short link that never changes, even if the owner renames their handle. When the owner edits links, the next person who saves the contact gets the new set. The Wallet pass keeps working with no reissue.

## How it works

1. **One stable link per account.** Each card gets a random short token, `amped.bio/c/k7Q2xd`. The QR encodes only that link and a source letter, so the code stays small and scans fast from a phone screen.
2. **The card page.** A light page on the public site. It loads fast on event Wi-Fi and has no heavy theme effects.
3. **The contact file.** Save contact downloads a standard vCard 3.0 file built on request from the owner's current page.
4. **Wallet passes.** Amped.Bio signs an Apple Wallet pass and a Google Wallet pass for the owner. Each shows the owner's name, handle, photo and QR code in the owner's theme colors. The pass carries no phone, email or Verified claim, because a phase 1 pass never updates.
5. **What stays out.** Hidden blocks, gated or paid links, and anything 18+ never go into the card or the contact. The account email is never used.

## Who it is for

- Creators who meet fans and brands in person: events, shows, pop ups, conferences.
- Fans who keep a public page and want to share it.
- Agencies handing out cards for their roster.

## Key marketing

- Headline: **Your Amped.Bio, in your Wallet.**
- Line: Show the code, and they save you with every link.
- Proof points: no app on either phone; works on iPhone and Android; always current; free on every account.
- Guardrails: no claims about earning or rewards on the card or pass. Referral credit from scans follows the referral program's existing counsel status.

## Phases

- **Phase 1.** Card screen, stable link, card page, Save contact, Download QR, Apple Wallet and Google Wallet passes, add confirmation, scan analytics. Behind the `ampedCard` feature flag.
- **Phase 2.** Pass updates pushed to phones when the name, photo or verification changes (the Verified line returns on the pass); Share my details; agency roster cards.
- **Phase 3.** Printed NFC cards that open the same link.

## What Rob needs to decide or start

- D5: the Wallet issuer entity, then the Apple Developer account (Pass Type ID, certificate) and the Google Wallet issuer account with a publishing access request.
- D13: the Android memory phrase.
- Counsel: the privacy notice items in spec section 11.
