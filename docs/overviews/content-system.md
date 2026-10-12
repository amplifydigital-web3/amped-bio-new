# Content system and creator store: overview

Build Board #20 (Content system), with the storefront for #18 (Paid content) and the creator side of #25 (Memberships). Drafted by Claude for Rob Frasca, 2026-10-12. Spec: docs/features/content-system.md. Design QA: docs/features/content-system-design-qa.md. Boards: cs1 to cs8 and st1 to st10.

## What it does

Creators upload their work to Amped.Bio once: videos, audio, photos, PDFs, ebooks and ZIP files. Each item can be free, for followers, for paying members, for pool fans, for sale on its own, or in the membership and for sale at once.

Every creator gets a store on their own page at amped.bio/handle/store. It looks like their page: their colors, fonts, buttons and background, with a banner, a store name and a tagline they choose. The store leads with the membership, then featured products, then everything else for sale, then free items. A fan who taps Buy or Join pays the creator from their Amped.Bio wallet in a checkout that carries the creator's brand. The item opens at once and stays in the fan's Library.

Creators sell single items or bundles (a course, a sample pack, a photo set), for good or for 30 or 365 days. They see every sale, refund from the same screen, and export a monthly CSV. They can give a promoter a code, and the promoter's share is paid in the same transaction as the sale.

## How it works

- **Cloudflare end to end.** Video goes straight from the creator's browser to Cloudflare Stream. Everything else goes straight to a private Cloudflare R2 bucket. Our servers never carry the bytes. There is no fee for data leaving R2.
- **Checked before it goes live.** Every upload is scanned for known child abuse imagery and malware, and images run through an adult content classifier, before the creator can publish. Location data is stripped from photos.
- **One locked door.** Every file a viewer gets passes through our media gateway on a separate domain, with a token our server signs only after the access engine says yes. Videos play with a Stream token. Tokens are short lived: minutes for locked items, hours at most for a video or song in play. Taking an item down stops it within a minute.
- **Sell what you uploaded.** A product is a price over items already in the library. One upload can be free on the bio, part of the membership and sold on its own.
- **The fan pays the creator.** Payment is a USDC transfer from the fan's wallet to the creator's wallet. A split contract pays the creator, any promoter or partner, and Amped.Bio's 5% in one transaction. The fan never pays Amped.Bio and never holds a balance with Amped.Bio. No gas for fans.
- **The wallet is loaded in one place.** A fan with too little USDC sees how much more is needed and a link to Wallet. Buying USDC happens only there.
- **One brand.** The store, the product pages and the checkout all use the creator's page theme. Amped.Bio appears only as a small Powered by Amped.Bio mark and the fee line.

## Who it is for

- Creators who already post free work and want to sell the best of it without leaving their link in bio.
- Creators who run a membership elsewhere and want the membership, the extras and the free funnel in one place.
- Fans who want to pay a creator directly and keep what they bought in one Library on every device.

## Competition

| | Fee to the creator | Monthly fee | Store look | Membership and sales together | Payout |
| --- | --- | --- | --- | --- | --- |
| Gumroad | 10% plus 50 cents, plus card processing | None | Limited branding | No | On a schedule |
| Stan Store | 0%, plus card processing | $29 or $99 | Mobile store in the link in bio, more on the $99 plan | Courses and products, memberships on Pro | Through Stripe |
| Patreon | 5% on shop products, 5% to 12% on post sales, plus processing | None | Inside Patreon | Yes, posts sold alone and in tiers | On a schedule |
| Fourthwall | 5% on digital and memberships (0% on Pro), plus processing | $0 or $19 | Branded site, domain on Pro | Yes | Through processors |
| Amped.Bio | 5%, no processing fee | None | The creator's own page theme | Yes, one item can be both | To the creator's wallet in the same transaction |

What is different: no monthly fee and no card processing fee; the creator is paid the moment the fan pays; the store is the creator's own page, not a template; a promoter is paid in the same transaction. What is the same on purpose: amounts in dollars, Buy and Join in one tap each, receipts, refunds by the creator.

Where the market is going: Patreon now sells single posts and collections next to tiers. Stan Store sells from the link in bio. Fourthwall puts memberships and products in one branded store. Amped.Bio does all three on dollar rails with instant settlement.

## Key marketing

- **Headline.** Your page is your store. Sell your work, run your membership, get paid in dollars the moment a fan buys.
- **Proof points.** Upload once, sell it any way you want. Your brand on the store and the checkout. 5%, no monthly fee, no processing fee. Paid to your wallet with every sale. Promoters paid automatically.
- **For fans.** Buy from the creator, not a platform. Everything you buy in one Library, on every device.
- **Safety in the copy.** "Every upload is scanned before it goes live." "Streams through a protected player." Never "100% safe", never "cannot be copied", never DRM.
- **Compliance in the copy.** No earn, yield, return, income or invest words anywhere in the store. No staking, pool or tREVO words on store or checkout screens. Amounts read 3 USDC. Recurring and refund terms shown before the fan signs. Promoters disclose their code. 18+ items never appear in marketing or on public pages.
- **Launch motion.** 25 pilot creators for free content first, then the store with 10 creators who already sell on Gumroad, Stan or Patreon, with help moving their catalog.
- **Not yet.** No physical goods, no discount codes, no custom store domains, no card checkout without USDC. Say Later with no date.

## Decisions for Rob

Answered: Cloudflare all in (12 Oct), Stream for video (8 Oct), adult content behind age verification (8 Oct), counsel review in parallel (8 Oct), quotas (8 Oct), store on the creator page (12 Oct), payment flow rules (8 Oct), split table (10 Oct), vocabulary (10 Oct).

Open, each with a recommendation in the spec: images on R2 with our own renditions; PhotoDNA as the launch gate with the Cloudflare tool as a second layer; ClamAV for malware; a third party adult classifier; Store as a tab in Content; store inherits the page theme; single items and bundles; items in the membership and for sale; forever access by default; a Free section; promoter codes in Phase 4; partners set by admin; store goes live after a checklist; store pages indexed; a daily download cap; creators fund refunds except Amped.Bio's share.
