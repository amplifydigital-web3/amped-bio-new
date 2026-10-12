# Content system and creator store

Status: spec for approval, 2026-10-12. Full rewrite of the 26 Sep spec. Build waits for Rob's answers to the open decisions in section 2 and the Phase 0 setup in 3.17.
Owner: Rob Frasca. Drafted by Claude, 2026-10-12.
Build Board: #20 Content system. This spec also carries the storefront for #18 Paid content and #16 Paid links, and the creator side of #25 Memberships.
Overview: docs/overviews/content-system.md. Design QA: docs/features/content-system-design-qa.md.
Parents and neighbors: Access gating engine (#21) owns who can open what. USDC wallet and on-ramp (#29, #5, docs/features/usdc-wallet-onramp.md) own the wallet and the relayer. Memberships and payments (#25, #15) own the contracts, the split table, Purchase, Membership and PaymentEvent. Fan Library (#26) owns the fan's cross creator views. Live streaming (#27) owns live events and tickets. Adult content (#28) owns age assurance. This spec owns content items, storage, processing, delivery, the content blocks, the store, the product catalog and the store branding. Section 3.18 lists every edit it makes to the others.

Direction from Rob:

- 26 Sep: "we'll need a content system where people can upload various forms of content."
- 8 Oct: Cloudflare Stream for video and live. Adult content allowed behind age verification. All payments in stablecoin. The payment flow rules (section 2).
- 10 Oct: Coinbase and Circle hold and move USDC. The server signed split table pays the creator, promoters, partners and Amped.Bio (5%) in one transaction.
- 12 Oct: all in on Cloudflare. Creators sell content directly. The spec includes creator memberships and store branding, where fans buy memberships and content from the creator. The store lives on the creator page.

## 1. Research

### 1.1 What is on development now (0b0382d, 12 Oct 2026)

| Area | State | Source |
|---|---|---|
| Content models | None. No `ContentItem`, `ContentAsset`, `AccessRule`, `AccessGrant`, `MembershipPlan`, `Membership`, `Offer`, `Purchase`, split or payment models | `packages/database/prisma/schema.prisma` |
| Uploads | `UploadedFile` (Int id, `s3_key`, `bucket`, status). `upload.ts` presigns PUTs for avatars, backgrounds and pool images on the public bucket `amped-bio`. Confirm calls HeadObject only: no size or real type check | `apps/server/src/trpc/upload.ts`, `services/S3Service.ts` |
| AWS SDK | v2 still signs PUTs (`getSignedUrlPromise`). v3 is used for HeadObject and GET | `S3Service.ts`, `apps/server/package.json` |
| Cloudflare | No R2, Stream, Images or Workers code. No `CF_` or `R2_` env | repo search |
| Blocks | `link`, `media` (embed only), `text`, `pool`, `referral`, `follow`, `followers`, `rnsid`. No content, store or membership block | `packages/constants/src/blocks.ts` |
| Public site | `[handle]` has `page.tsx`, `not-found.tsx` and `opengraph-image.tsx`. No subroutes | `apps/landingpage/src/app/[handle]` |
| Email exposure | Fixed. `getHandle` returns no email | `apps/server/src/trpc/handle.ts` |
| Reserved handles | None. Not needed for this spec: every new public route sits under `/{handle}/` | handle checks |
| Wallet | `UserWallet` (one address per user). Chains: Libertas Testnet and Revochain Devnet. No Base, no USDC | `packages/web3/src/index.ts` |
| Payments | Docs only. The USDC wallet spec merged as docs in #301. No contracts, relayer or routers | `docs/features/usdc-wallet-onramp.md` |
| Fan Graph | `Follow`, `FollowBlock`, `FollowRemoval` live. Follow and Followers blocks merged | schema, #293 |
| Inbox | `BroadcastDelivery` is the inbox row. No `InboxItem` | schema |
| Account deletion | None | admin users router |
| Server hosting | Express in a Docker container (`apps/server/Dockerfile`). Long running, so webhooks and jobs run in process | `apps/server` |
| Rules | New tables use UUID v7 `Bytes @id @db.Binary(16)`. Migrations applied by hand. Vitest tests with every change. Privacy changes follow `docs/legal/privacy-parameters.md` | `AGENTS.md` |

### 1.2 What changed since the 26 Sep spec

| Topic | 26 Sep spec | Now | Why |
|---|---|---|---|
| Files, audio, images | AWS S3 private bucket and CloudFront | Cloudflare R2 private bucket behind our media gateway Worker | Rob, 12 Oct: all in on Cloudflare. No egress fee |
| Video | Mux, then Cloudflare Stream (8 Oct) | Cloudflare Stream, uploaded straight from the browser | Rob, 8 Oct |
| Processing | SQS, Lambda, GuardDuty, Rekognition | R2 event notifications, Cloudflare Queues, a processor Worker and a Cloudflare Container (ffmpeg, sharp, ClamAV, pdfium) | One vendor. GuardDuty only scans S3 |
| Selling | "Payments on hold. Paid is Later" | Creators sell items and bundles and run a membership, paid in USDC from the fan's wallet to the creator's wallet | Rob, 8 to 12 Oct |
| Store | None | A storefront on the creator page, in the creator's brand | Rob, 12 Oct |
| Visibility | Public or Members only (stake rules) | Public, Followers, Members, Pool fans, Fans with a minimum stake, Paid, and any of these combined | Gating engine and memberships specs |
| Adult content | None in v1 | Allowed behind age verification (#28) | Rob, 8 Oct |
| Fan side | Bio block and a content page | Plus the creator feed page, the store, the shared player, progress and the Library (#26) | Fan Library spec |
| Live | Out of scope | Kind `live` and replays (#27) | Live streaming spec |
| Ids | Int autoincrement | UUID v7 `Binary(16)` | `AGENTS.md` |

### 1.3 The Cloudflare pieces we use, and what each one controls (checked 12 Oct 2026)

| Piece | What we use it for | What it controls | Key limits |
|---|---|---|---|
| R2, one private bucket `amped-content` | Originals of images, audio, documents and files. Renditions, previews, waveforms, covers, store banners | No public access and no `r2.dev` URL. Reads only through the gateway Worker binding. Writes through presigned PUTs on the S3 endpoint | $0.015 per GB month, Class A $4.50 and Class B $0.36 per million, egress free. Presigned URLs work only on `<account>.r2.cloudflarestorage.com`, never on a custom domain. Multipart: 5 MiB to 5 GiB parts, 10,000 parts |
| R2 event notifications and Queues | `object-create` on `incoming/` starts processing | Prefix filters. At least once delivery, so every step is idempotent | 5,000 messages a second per queue |
| Media gateway Worker on `media.ampedusercontent.com` | Serves every R2 byte to viewers | Verifies our short lived token, streams from the R2 binding with Range, sets security headers, caches by object key after the token check, honors the takedown list | Cached file size 512 MB below Enterprise. Larger files stream uncached |
| Stream | All video: upload, encode, signed HLS and DASH, preview clips, captions, MP4 downloads, live (#27) | `requireSignedURLs` on every video. RS256 tokens we sign with our own key. `allowedOrigins` amped.bio and app.amped.bio. One signed webhook | $5 per 1,000 minutes stored (prepaid), $1 per 1,000 minutes delivered, encoding free. Token `exp` at most 24 hours. Audio only files are refused (`ERR_NON_VIDEO`). Basic upload under 200 MB, TUS above. Max 30 GB |
| Containers | ffmpeg (audio, keyframes), sharp (images), ClamAV (malware), pdfium (page previews) | Called only by the processor Worker | Workers Paid plan. Instance up to 4 vCPU, 12 GiB |
| CSAM Scanning Tool | Second layer on the media zone | Hashes images as they pass through the cache and blocks matches | Not a pre publish check. Private and uncached content is not scanned |
| WAF and rate limits | Gateway abuse limits | Per IP request limits on `media.ampedusercontent.com` | |

Not used: R2 presigned GET for viewers (no custom domain, no headers, no takedown check), Cloudflare Images (decision 10), WAF HMAC token auth (needs Pro and makes the bucket public on that domain).

### 1.4 How creator stores work elsewhere

| Product | Fee to the creator | Store and branding | Take | Avoid |
|---|---|---|---|---|
| Gumroad | 10% plus 50 cents per direct sale, plus card processing. 30% on its marketplace | One storefront, limited branding | Product page with what is included. Bundles | 13% to 15% all in. Fees kept on refunds |
| Stan Store | 0% platform fee, $29 or $99 a month, plus processing | Mobile first store in the link in bio. Custom domain on the $99 plan | The store is the link in bio. One tap from bio to product | A monthly fee before the first sale |
| Patreon shop and post sales | 5% on shop digital products. Post sales 5% to 12% by plan, plus processing. $3 minimum | Inside the Patreon page. Members whose tier includes a post keep access; others buy or upgrade | Item sold alone and also included in the membership | Selling public posts. App store markup on iOS |
| Fourthwall | Digital products 5% (0% on Pro at $19 a month). Memberships 5%. Plus processing | Branded site, free domain on Pro | Membership and products in one branded store | Merch and fulfilment scope |
| Ko-fi | 0% to 5% on shop and memberships, plus processing | Shop tab on the profile | Simple shop tab | Monthly only memberships |
| Linktree | Payment Lock and digital products, plus processing | Inside the Linktree page | Selling from the link in bio | Handing over a raw link anyone can share |
| Amped.Bio | 5% taken in the same transaction, no processing fee, no monthly fee | The store is the creator's page, in the creator's theme, and the checkout carries the creator's brand | | |

Prices and fees are from the vendors' pages or reviews read on 12 Oct 2026 (sources at the end).

### 1.5 Patterns we adopt

1. **Private by default.** Every byte lands private. Nothing is served until scans pass and the creator publishes.
2. **Bytes never touch the API.** Browsers upload straight to R2 or Stream. The API signs and records.
3. **Stream, do not hand over.** Video and audio play through signed streams, documents in a viewer. Downloads are a per item choice.
4. **One access path.** Every byte a viewer gets is behind a token that the API signs only after the gating engine says yes.
5. **User content on its own domain.** `ampedusercontent.com`, never amped.bio. A hostile file cannot read amped.bio cookies.
6. **Scan before publish.** Malware, CSAM and the adult classifier run before an item can go live.
7. **The store is the page.** The store renders in the creator's theme at the creator's own address. Every checkout names the creator, and the fan pays the creator.
8. **Sell what is already uploaded.** A product is an offer over items in the library. One upload can be free, in the membership and for sale at once.

### 1.6 Monthly cost estimate

Same assumptions as the 26 Sep spec, so the numbers compare: 30% of creators active in a month. Each active creator stores 20 video minutes and 0.3 GB of other files, fans watch 200 minutes and pull 2 GB of other files per active creator, 10 images per active creator go through the classifier. List prices on 12 Oct 2026.

| Line | 1k creators (300 active) | 10k (3,000 active) | 100k (30,000 active) |
|---|---|---|---|
| Stream storage ($5 per 1,000 min) | $30 | $300 | $3,000 |
| Stream delivery ($1 per 1,000 min) | $60 | $600 | $6,000 |
| R2 storage ($0.015 per GB, 10 GB free) | $1 | $13 | $135 |
| R2 operations (Class A and B, free tier applied) | $0 | $2 | $81 |
| R2 egress | $0 | $0 | $0 |
| Workers Paid, gateway requests, Queues | $5 | $5 | $20 |
| Containers for processing and malware scans | $5 | $30 | $250 |
| Adult classifier (about $0.001 per image) | $3 | $30 | $300 |
| PhotoDNA | $0 | $0 | $0 |
| **Total** | **about $104** | **about $980** | **about $9,790** |
| 8 Oct stack (S3, CloudFront, GuardDuty, Stream) | about $106 | about $1,480 | about $14,990 |

- The saving is CloudFront egress and GuardDuty. It grows with scale: about $500 a month at 10k creators and $5,200 at 100k.
- Stream is about 90% of the total. Delivered minutes drive it. Volume pricing is available from Cloudflare above that scale.
- Base gas for purchases and renewals is a payments cost (#29 admin gas ledger), under a cent per payment.
- A heavier usage model (every creator active, 600 minutes delivered each) costs about $1 per creator a month at every scale, still about 90% Stream.

## 2. Overview

Creators upload video, audio, images, documents and files once. Each item can be free, for followers, for members, for pool fans, for sale, or several of these at once. Fans watch and read on the creator's page, on the item page and in their Library. Creators open a store on their own page, in their own brand, where fans join the membership and buy items and bundles. Fans pay in USDC from their Amped.Bio wallet straight to the creator's wallet. Amped.Bio takes 5% in the same transaction.

### What ships

1. **Content library.** Upload from any device, resumable, with a storage meter. Item editor with title, description, cover, chapters, captions, download choice, 18+ label and Who can open this.
2. **Cloudflare media stack.** R2 for files, Stream for video, the media gateway for delivery, Queues and a Container for processing. Malware, CSAM and adult classifier checks before publish.
3. **Content on the page.** A content block on the bio, the item page `amped.bio/{handle}/c/{publicId}` and the creator feed page `amped.bio/{handle}/content`.
4. **Gated content.** Locked cards, previews, and unlock through the gating engine for Followers, Members, Pool fans, Fans with a minimum stake and Paid.
5. **The store.** `amped.bio/{handle}/store` in the creator's theme: header, membership card, featured products, products by kind, free items, live tickets when #27 ships, About and the refund line. A Store block puts the best products on the bio.
6. **Products.** A single item or a bundle of items, sold once, for good or for a set period. Each product has its own page at `amped.bio/{handle}/store/{slug}`.
7. **Store branding.** Store name, tagline, banner, layout, section order, featured products, About, refund line and thank you note. Colors, fonts, buttons and containers come from the creator's page theme, so the page, the store and the checkout carry one brand.
8. **Membership in the store.** The creator sets up the membership plan from the Store tab. The membership card leads the store. Items marked Members open for members. An item can be in the membership and for sale.
9. **Checkout.** The creator branded pay sheet and join sheet from the memberships spec (#25). Purchases open the item at once and appear in the fan's Library.
10. **Sales and promoters.** A Sales view for the creator with refunds and CSV. Promoter codes that pay a share to a promoter through the split table.
11. **Trust and safety.** Report, admin queue, DMCA tools, repeat infringer policy, hash blocklist, CSAM evidence handling, 18+ rules.

### Decisions already made

| # | Decision | Answer | When |
|---|---|---|---|
| 1 | Storage and delivery | Cloudflare all in: R2 private bucket, media gateway Worker, Stream for video. Replaces S3 and CloudFront | Rob, 12 Oct |
| 2 | Video vendor | Cloudflare Stream, signed tokens, no DRM | Rob, 8 Oct |
| 3 | Adult content | Allowed behind age verification, rules on #28 | Rob, 8 Oct |
| 4 | Stake gated content and counsel | Ship and review in parallel | Rob, 8 Oct |
| 5 | Default quotas | 5 GB and 300 video minutes per creator. 2 GB per video, 500 MB per audio or ZIP, 100 MB per document, 25 MB per image. All configurable | Rob, 8 Oct |
| 6 | Where the store lives | On the creator page, `amped.bio/{handle}/store`, in the creator's theme | Rob, 12 Oct |
| 7 | Payment flow rules | The on-ramp only loads the wallet and lives only in Wallet. The fan pays the creator, not Amped.Bio. Creator payments run in a creator branded sheet. Amped.Bio's own goods use the Amped.Bio gateway | Rob, 8 Oct |
| 8 | Split | Server signed split table: creator, promoters, partners, Amped.Bio at 5%, in one transaction | Rob, 10 Oct |
| 9 | Vocabulary | Members means paid membership. Stake rules read Pool fans and Fans with a minimum stake | Rob, 10 Oct |

### Decisions for Rob (recommended answer first)

10. **Images.** Recommended: R2 with our own renditions made in the Container (320, 640, 1280 and full, WebP and JPEG, metadata stripped). Why: one access path through the gateway, EXIF removal under our control, no delivery fee. Alternative: Cloudflare Images at $5 per 100k stored and $1 per 100k delivered with signed URLs. A second access model, and signed URLs cannot use flexible variants.
11. **CSAM detection.** Recommended: Microsoft PhotoDNA as the pre publish match in the processor (free for vetted organizations, apply now), plus the Cloudflare CSAM Scanning Tool turned on for the media zone as a second layer. Why: the Cloudflare tool only sees images as they pass through the cache, after serving, and never sees private uncached files or video. Launch waits for PhotoDNA. Alternative: Thorn Safer (paid, adds video hashing and direct NCMEC reporting).
12. **Malware scanning.** Recommended: ClamAV in the Container on documents, files and every downloadable item, plus a hash lookup against our blocklist. Why: R2 has no built in scanning and GuardDuty only covers S3. Alternative: a hosted scanning API, priced per file.
13. **Adult classifier.** Recommended: a third party image moderation API behind an adapter (Hive first, priced by quote, about $0.001 an image assumed). Why: no Cloudflare product does this. Alternative: AWS Rekognition on the existing AWS account.
14. **Where the store lives in the editor.** Recommended: the Content destination gains tabs Library, Store and Live (#27). Store holds Storefront, Products, Membership and Sales. The Members list stays in People. Why: products are built from the library, and the rail has no room for a Store item. Alternative: a Store destination in the rail.
15. **Store branding.** Recommended: the store inherits the page theme (colors, fonts, buttons, containers, background) and adds store fields only: name, tagline, banner, layout, section order, featured products, About, refund line, thank you note. Why: one brand from bio to store to checkout, nothing new to keep in sync. Alternative: a separate store theme. Two brands to maintain, and the checkout would have to pick one.
16. **Product kinds in v1.** Recommended: single item and bundle (2 to 50 items). Why: courses, sample packs and photo sets are bundles, and a bundle is one Offer with several items. Alternative: single items only, bundles later.
17. **In the membership and for sale.** Recommended: an item may be both. Its rule is `any(member, paid)`. Members open it at once and are never asked to pay. Others see Buy and Join. Why: the Patreon pattern, and the gating engine ships `any` in v1. Alternative: an item is either in the membership or for sale.
18. **Access period.** Recommended: Forever by default. The creator may choose 30 or 365 days per product. Why: matches the access period chips in #25 3.3 and what buyers expect for digital goods. Alternative: always forever.
19. **Free items in the store.** Recommended: the store shows a Free section with the creator's public items. Why: free items are the top of the funnel. Alternative: paid items only.
20. **Promoter codes.** Recommended: in Phase 4. A creator gives a promoter (an Amped.Bio account) a code with a share from 1% to 30% on all or chosen products. Store links carry `?via=code`. The fan sees Referred by @promoter on the Review step. Why: the split table already pays n recipients, and promoters are how creators sell beyond their own audience. Alternative: no promoters in v1.
21. **Partners.** Recommended: partner rows are set by an Amped.Bio admin with the creator's written consent (a label, agency or manager), on the creator's plan and products, and shown to the creator in Sales. Why: partners are commercial agreements, not a self serve feature. Alternative: creators add partners themselves.
22. **Store visibility.** Recommended: a store goes live when the creator accepts the seller terms, has a USDC address on Base, has a verified email and has one active product or an active plan. Before that, the Store tab shows a checklist and the public route returns not found. Why: no empty stores and no store that cannot be paid. Alternative: a store page that says Coming soon.
23. **Store SEO.** Recommended: store and product pages are indexable, with JSON-LD Product and Offer, and appear in the sitemap and `llms.txt`. 18+ products never do. Why: products are what people search for. Alternative: noindex until the pilot ends.
24. **Downloads after purchase.** Recommended: when the creator allows downloads, a buyer may download each file up to 10 times a day. Each download link is valid 2 minutes, and file links work once. Why: buyers expect to keep files, and the cap limits link sharing. Alternative: unlimited.
25. **Refunds with promoters or partners.** Recommended: the creator funds the whole refund except Amped.Bio's share, which the treasury returns; promoter and partner shares are not reversed on chain. Why: nobody can pull USDC back from a promoter's wallet without their signature, and the creator chose the promoter. Alternative: promoters pre approve clawbacks, which every promoter must sign and keep funded.

### Out of scope

- Physical goods, shipping and print on demand.
- Discount codes, pay what you want, free trials and gift purchases.
- Tips (memberships spec phase C adds a Tip block).
- Custom domains for stores (Phase 5).
- Card checkout without USDC. The fan always pays from the wallet (payment flow rule 1).
- Membership tiers beyond one plan (#25 decision 6).
- DRM. Stream has none. Visible watermarking and PDF stamping are Phase 5.
- Comments and likes on content.
- Moving existing avatars and backgrounds from the public S3 bucket to R2 (Phase 5).

## 3. Detailed spec

### 3.1 Screens

Existing boards cs1 to cs5 (Prism 2.2, 2 Oct) stay with the changes the design QA lists. New boards cs6 to cs8 and st1 to st10 are drawn after the decisions above are answered. Screen Review rows 151 to 163 are proposed in the design QA.

| Board | Surface | What it shows | State |
|---|---|---|---|
| cs1 | Content, Library tab, desktop | Storage and video minutes meter, filter chips, item grid with one status each: Public, a rule name (Followers, Members, Pool fans, Paid 3 USDC, Members or Paid), Processing, Draft, In review. Tabs Library, Store, Live | Update: tabs and rule names |
| cs2 | Upload dialog | Limits and space left, rights and scanning notice, per file stage (Uploading, Scanning, Processing, Ready, Blocked with the fix). Closing keeps uploads going | Update: no change to layout, Stream TUS progress for video |
| cs3 | Item editor, desktop | Title, description, cover, chapters, captions file, Allow downloads, 18+ label, Who can open this (the gating picker with Everyone, Followers, Members, Pool fans, Fans with a minimum stake, Paid, and Any of), preview length, Sell in store shortcut, live preview as a member and as a locked fan | Update: picker, 18+, Sell in store |
| cs4 | Content block on a bio, phone | Creator theme only. Public items play inline. Locked items show a blurred cover and the rule. Paid items show the amount. Report content | Update: Paid label |
| cs5 | Locked item page, phone | Preview player, unlock card naming the rule and the fan's state, the right action per rule (Follow, Join, Buy, Go to the pool), disclosures only for stake rules | Update: Join and Buy actions in the creator branded sheet |
| cs6 | Creator feed page, phone and desktop | `amped.bio/{handle}/content`, newest first, kind chips, locked cards with no media reference | New (from #26) |
| cs7 | Item page after purchase, phone | Player or viewer, Download when allowed, Part of {bundle}, Resume, Save | New |
| cs8 | Upload and library empty, loading and error states | Build QA states, drawn this time | New |
| st1 | Store tab, Storefront, desktop | Store name, tagline, banner upload and crop, layout chips (Grid, List, Feature), section order list, featured picker (up to 3), About, refund line, thank you note, live phone preview in the creator theme, Store live switch with the readiness checklist | New |
| st2 | Store tab, Products, desktop | Product list with cover, kind (Item, Bundle), amount, access, status, sales count, sort handle. New product | New |
| st3 | Product editor, desktop | Kind, items picker from the library (bundle up to 50), title, slug, description, cover, amount in USDC, access period chips (Forever, 30 days, 365 days), Also in membership switch, 18+ inherited from items, preview of the product card and page | New |
| st4 | Store tab, Membership, desktop | The #25 plan editor moved here: name, benefits, monthly and yearly amounts with the saving line, status, member count switch, link to People, Members | New (moves mb1 plan card) |
| st5 | Store tab, Sales, desktop | Totals (sales, members, net this month), orders list (buyer name and handle, product, amount, fee, promoter, net, date, status, transaction link), Refund in the row menu, Export CSV, link to Wallet Activity | New |
| st6 | Storefront, phone, creator theme | Banner, avatar, store name, tagline, Follow, membership card, Featured, products by kind with chips, Free, About, refund line, Powered by Amped.Bio | New |
| st7 | Storefront, desktop, creator theme | Same sections, 3 column product grid, membership card in the right column | New |
| st8 | Product page, phone, creator theme | Cover or preview player, title, what is included (kinds, lengths, pages, sizes), access line, amount, Buy, Join when also in membership, Report. Owned state: Open and Download | New |
| st9 | Pay sheet for a bundle, phone, creator theme | mb6 extended: bundle line with item count, Referred by @promoter when attributed, Includes the Amped.Bio fee of 5%, required checkbox, Pay 12 USDC, wallet note, Powered by Amped.Bio | New (extends mb6) |
| st10 | Store block on a bio, phone | Row or grid of up to 6 products with amounts and Visit store | New |

The join sheet (mb3), the paid unlock sheet (mb6), the membership card (mb2, mb10) and the four locked cards (mb5) come from the memberships spec unchanged except where this table says so.

### 3.2 Shared constants (`packages/constants/src/content.ts` and `store.ts`)

```ts
export const CONTENT_KINDS = ["video", "audio", "image", "document", "file", "live"] as const;

export const CONTENT_ALLOWED_TYPES = {
  video: { mimes: ["video/mp4", "video/quicktime", "video/webm", "video/x-matroska"], exts: ["mp4", "mov", "webm", "mkv"] },
  audio: { mimes: ["audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp4", "audio/x-m4a", "audio/aac", "audio/flac"], exts: ["mp3", "wav", "m4a", "aac", "flac"] },
  image: { mimes: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic"], exts: ["jpg", "jpeg", "png", "webp", "gif", "heic"] },
  document: { mimes: ["application/pdf", "application/epub+zip"], exts: ["pdf", "epub"] },
  file: { mimes: ["application/zip"], exts: ["zip"] },
} as const;

export const CONTENT_PREVIEW_MAX_SECONDS = 60;
export const CONTENT_TITLE_MAX = 140;
export const CONTENT_DESCRIPTION_MAX = 2000;

export const STORE_PRODUCT_KINDS = ["single", "bundle"] as const; // #27 adds "ticket", #25 phase C adds "tip"
export const STORE_BUNDLE_MAX_ITEMS = 50;
export const STORE_FEATURED_MAX = 3;
export const STORE_LAYOUTS = ["grid", "list", "feature"] as const;
export const STORE_SECTIONS = ["membership", "featured", "products", "free", "live", "about"] as const;
export const STORE_ACCESS_PERIODS = [null, 30, 365] as const; // null = forever
export const STORE_AMOUNT_MIN_UNITS = 500_000n;          // 0.50 USDC (#25 decision 7)
export const STORE_AMOUNT_MAX_UNITS = 1_000_000_000n;    // 1,000 USDC
export const PROMOTER_BPS_MIN = 100;  // 1%
export const PROMOTER_BPS_MAX = 3000; // 30%
export const PLATFORM_FEE_BPS = 500;  // 5%, server config, adjustable after the pilot
```

- Not accepted: SVG, HTML, executables, scripts, Office files, RAR, 7z, AVI.
- HEIC images are converted to JPEG and WebP. The original is not kept.
- Limits come from env: `UPLOAD_LIMIT_CONTENT_VIDEO_MB` (2048), `..._AUDIO_MB` (500), `..._IMAGE_MB` (25), `..._DOCUMENT_MB` (100), `..._FILE_MB` (500), `CONTENT_QUOTA_DEFAULT_MB` (5120), `CONTENT_QUOTA_VIDEO_MINUTES` (300).
- Zod schemas for every input sit beside these constants. Amounts are entered as USD with two decimals and stored as USDC units (6 decimals) in `BigInt`.

### 3.3 Data model (Prisma, `packages/database/prisma/schema.prisma`)

New tables use UUID v7 `Bytes @id @db.Binary(16)` per `AGENTS.md`. User ids stay `Int` because `User` is an existing table. Public ids are random 16 character strings used in URLs and object keys.

```prisma
enum ContentKind { VIDEO AUDIO IMAGE DOCUMENT FILE LIVE }
enum ContentStatus { UPLOADING PROCESSING READY FAILED BLOCKED DELETED }
enum ContentPublishState { DRAFT PUBLISHED ARCHIVED }
enum ModerationState { PENDING CLEAR HELD BLOCKED }
enum ContentAssetRole { ORIGINAL RENDITION COVER BLUR PAGE_PREVIEW WAVEFORM AUDIO_PREVIEW STREAM PREVIEW_CLIP CAPTION BANNER }
enum ContentAssetStorage { R2 STREAM }
enum ScanStatus { PENDING CLEAN INFECTED SKIPPED ERROR }

model ContentItem {
  id               Bytes               @id @db.Binary(16)
  publicId         String              @unique @map("public_id") @db.VarChar(16)
  userId           Int                 @map("user_id")
  kind             ContentKind
  title            String              @db.VarChar(140)
  description      String?             @db.Text
  status           ContentStatus       @default(UPLOADING)
  processingStep   String?             @map("processing_step") @db.VarChar(40)
  failureReason    String?             @map("failure_reason") @db.VarChar(255)
  publishState     ContentPublishState @default(DRAFT) @map("publish_state")
  accessRuleId     Bytes?              @map("access_rule_id") @db.Binary(16) // null = public. Gating engine contract. The effective rule
  baseAccessRuleId Bytes?              @map("base_access_rule_id") @db.Binary(16) // the creator's own rule, kept while products override it
  previewConfig    Json?               @map("preview_config")   // { seconds } | { pages } | { blur: true }
  allowDownload    Boolean             @default(false) @map("allow_download")
  adult            Boolean             @default(false)          // creator label 18+ (#28)
  moderationState  ModerationState     @default(PENDING) @map("moderation_state")
  moderationReason String?             @map("moderation_reason") @db.VarChar(255)
  durationMs       Int?                @map("duration_ms")
  pageCount        Int?                @map("page_count")
  width            Int?
  height           Int?
  totalBytes       BigInt              @default(0) @map("total_bytes")
  sha256           String?             @db.Char(64)
  chapters         Json?                                        // [{ startMs, title }] (#26)
  publishedAt      DateTime?           @map("published_at")
  deletedAt        DateTime?           @map("deleted_at")
  purgeAfter       DateTime?           @map("purge_after")
  createdAt        DateTime            @default(now()) @map("created_at")
  updatedAt        DateTime            @updatedAt @map("updated_at")

  user       User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  assets     ContentAsset[]
  reports    ContentReport[]
  offerItems OfferItem[]

  @@index([userId, status])
  @@index([userId, publishState, publishedAt])
  @@index([accessRuleId])
  @@map("content_items")
}

model ContentAsset {
  id            Bytes               @id @db.Binary(16)
  contentItemId Bytes               @map("content_item_id") @db.Binary(16)
  role          ContentAssetRole
  storage       ContentAssetStorage
  r2Key         String?             @map("r2_key") @db.VarChar(255)
  streamUid     String?             @map("stream_uid") @db.VarChar(64)
  lang          String?             @db.VarChar(8)     // captions
  variant       String?             @db.VarChar(16)    // 320 | 640 | 1280 | full | webp | jpg
  mimeType      String?             @map("mime_type") @db.VarChar(100)
  size          BigInt?
  width         Int?
  height        Int?
  durationMs    Int?                @map("duration_ms")
  scanStatus    ScanStatus          @default(PENDING) @map("scan_status")
  createdAt     DateTime            @default(now()) @map("created_at")

  contentItem ContentItem @relation(fields: [contentItemId], references: [id], onDelete: Cascade)

  @@index([contentItemId, role])
  @@index([streamUid])
  @@map("content_assets")
}

model UserStorageQuota {
  id                Bytes    @id @db.Binary(16)
  userId            Int      @unique @map("user_id")
  bytesLimit        BigInt   @map("bytes_limit")
  bytesUsed         BigInt   @default(0) @map("bytes_used")
  bytesReserved     BigInt   @default(0) @map("bytes_reserved")
  videoMinutesLimit Int      @map("video_minutes_limit")
  videoMinutesUsed  Int      @default(0) @map("video_minutes_used")
  updatedAt         DateTime @updatedAt @map("updated_at")
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@map("user_storage_quotas")
}

model StoreSettings {
  id              Bytes     @id @db.Binary(16)
  userId          Int       @unique @map("user_id")
  status          String    @default("draft") @db.VarChar(12)   // draft | live | paused
  name            String?   @db.VarChar(60)                     // null = display name
  tagline         String?   @db.VarChar(80)
  bannerAssetId   Bytes?    @map("banner_asset_id") @db.Binary(16)
  layout          String    @default("grid") @db.VarChar(12)
  sectionOrder    Json      @map("section_order")               // STORE_SECTIONS order, hidden sections omitted
  featuredOfferIds Json     @map("featured_offer_ids")          // up to 3 Offer ids as hex
  about           String?   @db.VarChar(600)
  refundLine      String    @default("creator_discretion") @map("refund_line") @db.VarChar(24) // creator_discretion | no_refunds | within_7_days | within_30_days
  thankYouNote    String?   @map("thank_you_note") @db.VarChar(280)
  wentLiveAt      DateTime? @map("went_live_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@map("store_settings")
}

model Offer {
  id               Bytes     @id @db.Binary(16)
  publicId         String    @unique @map("public_id") @db.VarChar(16)
  creatorUserId    Int       @map("creator_user_id")
  kind             String    @db.VarChar(12)                  // single | bundle | ticket (#27) | tip (#25) | link (#16, never listed in the store)
  status           String    @default("draft") @db.VarChar(12) // draft | active | paused | archived
  slug             String    @db.VarChar(60)
  title            String    @db.VarChar(80)
  description      String?   @db.VarChar(2000)
  coverAssetId     Bytes?    @map("cover_asset_id") @db.Binary(16)
  amountUnits      BigInt    @map("amount_units")
  accessPeriodDays Int?      @map("access_period_days")       // null = forever
  alsoInMembership Boolean   @default(false) @map("also_in_membership")
  adult            Boolean   @default(false)                  // true when any item is 18+
  sortOrder        Int       @default(0) @map("sort_order")
  salesCount       Int       @default(0) @map("sales_count")  // confirmed purchases, kept by the indexer
  createdAt        DateTime  @default(now()) @map("created_at")
  updatedAt        DateTime  @updatedAt @map("updated_at")

  creator   User             @relation(fields: [creatorUserId], references: [id], onDelete: Cascade)
  items     OfferItem[]
  splits    SplitRecipient[]
  purchases Purchase[]

  @@unique([creatorUserId, slug])
  @@index([creatorUserId, status, sortOrder])
  @@map("offers")
}

model OfferItem {
  id            Bytes @id @db.Binary(16)
  offerId       Bytes @map("offer_id") @db.Binary(16)
  contentItemId Bytes @map("content_item_id") @db.Binary(16)
  position      Int
  offer       Offer       @relation(fields: [offerId], references: [id], onDelete: Cascade)
  contentItem ContentItem @relation(fields: [contentItemId], references: [id], onDelete: Restrict)
  @@unique([offerId, contentItemId])
  @@index([contentItemId])
  @@map("offer_items")
}

model PromoterCode {
  id             Bytes     @id @db.Binary(16)
  creatorUserId  Int       @map("creator_user_id")
  promoterUserId Int       @map("promoter_user_id")
  code           String    @unique @db.VarChar(16)
  bps            Int                                          // PROMOTER_BPS_MIN to MAX
  scope          Json                                         // "all" | Offer ids as hex
  status         String    @default("active") @db.VarChar(12) // active | paused | ended
  expiresAt      DateTime? @map("expires_at")
  createdAt      DateTime  @default(now()) @map("created_at")
  @@index([creatorUserId, status])
  @@index([promoterUserId])
  @@map("promoter_codes")
}

model SplitRecipient {
  id        Bytes   @id @db.Binary(16)
  offerId   Bytes?  @map("offer_id") @db.Binary(16)     // one of offerId or planId
  planId    Bytes?  @map("plan_id") @db.Binary(16)
  role      String  @db.VarChar(12)                    // partner (admin set). Promoters are added per payment
  userId    Int?    @map("user_id")
  address   String  @db.VarChar(42)                    // Base address, screened on save
  bps       Int
  consentAt DateTime @map("consent_at")                // creator's written consent recorded by admin
  createdAt DateTime @default(now()) @map("created_at")
  offer Offer? @relation(fields: [offerId], references: [id], onDelete: Cascade)
  @@index([offerId])
  @@index([planId])
  @@map("split_recipients")
}

model ContentReport {
  id             Bytes    @id @db.Binary(16)
  contentItemId  Bytes?   @map("content_item_id") @db.Binary(16)
  offerId        Bytes?   @map("offer_id") @db.Binary(16)
  reporterUserId Int?     @map("reporter_user_id")
  reason         String   @db.VarChar(20)                // copyright, csam, adult, harassment, malware, scam, other
  details        String?  @db.Text
  status         String   @default("open") @db.VarChar(20)
  createdAt      DateTime @default(now()) @map("created_at")
  contentItem ContentItem? @relation(fields: [contentItemId], references: [id], onDelete: Cascade)
  @@index([status, createdAt])
  @@map("content_reports")
}

model CopyrightNotice {
  id              Bytes     @id @db.Binary(16)
  contentItemId   Bytes?    @map("content_item_id") @db.Binary(16)
  targetUserId    Int       @map("target_user_id")
  claimantName    String    @map("claimant_name") @db.VarChar(255)
  claimantContact String    @map("claimant_contact") @db.Text      // encrypted at rest, admin only
  workDescribed   String    @map("work_described") @db.Text
  swornStatement  Boolean   @map("sworn_statement")
  valid           Boolean?
  validatedAt     DateTime? @map("validated_at")
  signature       String    @db.VarChar(255)
  receivedAt      DateTime  @default(now()) @map("received_at")
  actionedAt      DateTime? @map("actioned_at")
  counterNoticeAt DateTime? @map("counter_notice_at")
  restoredAt      DateTime? @map("restored_at")
  isStrike        Boolean   @default(true) @map("is_strike")
  @@index([targetUserId, receivedAt])
  @@map("copyright_notices")
}

model BlockedContentHash {
  id        Bytes    @id @db.Binary(16)
  sha256    String   @unique @db.Char(64)
  reason    String   @db.VarChar(20)                     // dmca, malware, policy
  createdAt DateTime @default(now()) @map("created_at")
  @@map("blocked_content_hashes")
}
```

- **Gate.** `accessRuleId` is the gating engine column. The content system registers `registerAccessResourceResolver("content", { getGate })`, returning `{ ownerUserId, accessRuleId, adult }`. Resource ids are `content:{publicId}`.
- **Product rule.** Saving an active product writes the `paid` rule `{ offerId }` onto every item in it. When the product has Also in membership on, the item rule becomes `any(member { planId }, paid { offerId })`. An item in several products gets `any` over each `paid` leaf. The engine's v1 limit is 4 leaves and the `member` leaf counts, so an item can be in 4 products, or 3 when Also in membership is on; one more is refused with the reason. The creator's own rule is kept in `baseAccessRuleId`, and removing an item from its last product restores it.
- **Payments tables are owned elsewhere.** `Purchase`, `PaymentEvent`, `MembershipPlan` and `Membership` are defined by #25 and #15. This spec adds two columns to `Purchase`: `promoterCodeId Bytes?` and `splitHash String @db.Char(66)` (the hash of the signed split, 3.9). Those tables move to UUID v7 keys too (3.18).
- **Banner.** The store banner is a `ContentAsset` with role BANNER on a hidden ContentItem of kind IMAGE owned by the creator, stored under `derived/{publicId}/BANNER/`, so it goes through the same scans and the same path. A replaced banner's item is deleted after 7 days.
- **Migrations per PR.** Each PR adds its models with their back relations only (PR 2: content tables without `offerItems`; PR 9: `StoreSettings`, `Offer`, `OfferItem` and the `offerItems` back relation; PR 10: `SplitRecipient` and the `Purchase` columns; PR 12: `PromoterCode`).
- `UploadedFile` is not used for content. The storage meter sums `ContentItem.totalBytes` plus the existing `UploadedFile` sizes.
- CSAM matches are not stored in these tables. They go to the restricted evidence store (3.11).

### 3.4 Storage layout

**R2 bucket `amped-content`** (production) and `amped-content-staging`. Standard storage class, automatic location with the North America hint. Public access and `r2.dev` off. Bucket CORS allows `PUT` from `https://app.amped.bio` (and the staging app host) with `Content-Type`, exposes `ETag`, max age 3600.

| Prefix | Contents | Written by | Read by | Lifecycle |
|---|---|---|---|---|
| `incoming/{publicId}/original.{ext}` | Raw upload | Browser (presigned PUT or multipart) | Processor only | Deleted when processing ends. Incomplete multipart aborted after 1 day |
| `originals/{publicId}/original.{ext}` | Clean original, kept for documents, files and downloadable items | Processor | Gateway (signed) | Deleted with the item |
| `audio/{publicId}/{variant}.m4a` | AAC rendition and the preview cut | Processor | Gateway (signed) | Deleted with the item |
| `derived/{publicId}/{role}/{variant}` | Image renditions, covers, blur, page previews, waveforms, poster frames | Processor | Gateway (signed) | Deleted with the item |
| `quarantine/{publicId}/...` | Malware positives | Processor | Trust and safety only (no gateway route) | Expire after 30 days |

- Keys never contain the numeric user id or the email.
- Video bytes never land in R2. The browser uploads to Stream (3.5). A downloadable video uses Stream's MP4 download, not a kept original.
- The R2 API token used by the server has Object Read and Write on this bucket only. The gateway reads through a Worker binding. The processor has its own binding.
- The existing public S3 bucket `amped-bio` is unchanged until Phase 5.

**Stream.** One Stream library on the same Cloudflare account. Every video is created with `requireSignedURLs: true`, `allowedOrigins: ["amped.bio", "app.amped.bio"]` (staging hosts on staging) and `meta: { publicId, env }`. Preview clips are separate videos created with the clip API and carry `meta.clipOf`. One signing key (`POST /stream/keys`), its private key in the server secret store.

### 3.5 Upload pipeline

```
browser                 API (tRPC)                         R2 / Stream                  Queue -> processor Worker -> Container
  | createUpload ------> | allowlist, size, quota reserve  |                             |
  |                      | ContentItem UPLOADING            |                             |
  |<-- target -----------| R2: presigned PUT or multipart  |                             |
  |                      | video: Stream TUS upload URL     |                             |
  | bytes --------------------------------------------------> incoming/ or Stream          |
  | completeUpload ----> | HeadObject size, 4 KB magic     |                             |
  |                      | status PROCESSING                |-- object-create event ----->| hash, blocklist, CSAM,
  |                      |                                  |                             | malware, normalize, previews,
  |                      |<---------------- signed callback POST /internal/content/processed  classifier
  |                      |<---------------- Stream webhook (ready or error) for video
  |<-- READY ------------|                                  |                             |
```

1. **createUpload** `{ kind, fileName, mimeType, size, durationSec? }`. Checks kind, MIME, extension and size against 3.2. Reserves bytes in `UserStorageQuota` in a transaction and refuses when used plus reserved plus size passes the limit. Creates `ContentItem` (UPLOADING, DRAFT). Returns one target:
   - Non video under 100 MB: a presigned R2 PUT on the S3 endpoint, 15 minutes, with `Content-Type` and `Content-Length` signed.
   - Non video 100 MB and over: an R2 multipart upload id and part count (10 MB parts). `signParts` presigns up to 50 part URLs at a time, 15 minutes each.
   - Video: a Stream direct creator upload through TUS (`POST /stream?direct_user=true`) with `maxDurationSeconds` set to the creator's video minutes left (capped at 4 hours), `requiresignedurls`, an expiry of 6 hours and `meta.publicId`. The browser uploads with `tus-js-client`, 50 MB chunks, resumable. The returned `stream-media-id` is stored as the STREAM asset.
2. **completeUpload** `{ publicId, parts? }`. For R2: completes the multipart upload, calls HeadObject and refuses when the length differs from the declared size, reads the first 4 KB and checks the signature matches the kind. A mismatch deletes the object and sets FAILED. For video: confirms Stream has the upload. Sets PROCESSING.
3. **Processor.** R2 `object-create` on `incoming/` goes to the Queue `content-ingest`. Video items are queued by the API when the Stream webhook reports `readyToStream`, because keyframes and clips need an encoded video. The processor Worker runs these steps, writes each step to the API callback, and is idempotent on `publicId` and step:
   1. SHA-256. Refuse when the hash is in `BlockedContentHash`.
   2. **CSAM match** (decision 11) on images, GIF frames, video keyframes (one per 5 seconds, at most 60, taken from the Stream thumbnail endpoint with a short token) and document page renders. A match stops everything (3.11).
   3. **Malware scan** (decision 12) with ClamAV in the Container for documents, files and any item with downloads allowed. ZIP archives also fail above 10 times compression or 2 GB uncompressed. INFECTED moves the object to `quarantine/`, sets BLOCKED and adds the hash to the blocklist.
   4. **Normalize** in the Container:
      - Images: sharp re-encode, EXIF, GPS and XMP removed, longest side capped at 4096, renditions 320, 640, 1280 and full in WebP and JPEG. HEIC converted. The original is not kept.
      - Audio: ffmpeg to AAC in m4a at 160 kbps, metadata removed, waveform JSON, and the preview cut (first `previewConfig.seconds`) as a separate file. The upload is kept in `originals/` only when downloads are allowed.
      - Documents: pdfium renders pages 1 to 3 as previews, metadata removed, original kept in `originals/`. EPUB gets a cover render only.
      - Video: Stream encodes. When the item has a preview, the processor calls `POST /stream/clip` from 0 to the preview length and stores the clip uid as PREVIEW_CLIP. A poster frame is copied into `derived/`.
   5. **Blur cover** at 32 px for locked cards.
   6. **Adult classifier** (decision 13) on images and 5 video frames. Explicit on an item labeled 18+ continues. Explicit on an unlabeled item sets HELD until a reviewer clears it or the creator labels it 18+ with 18+ enabled (#28).
   7. READY. Reserved bytes move to used. Video minutes are added from Stream's `duration`. An in app notice goes to the creator.
4. **Callbacks.** The processor posts each result to `POST /internal/content/processed`, signed with HMAC SHA-256 over the body and a timestamp (`CONTENT_PROCESSOR_SECRET`, 5 minute window). The API is the only writer of item state.
5. **Stream webhook.** `POST /webhooks/cloudflare-stream` verifies `Webhook-Signature` (HMAC SHA-256 of `time.body`, 5 minute window). `readyToStream: true` queues the video steps for the processor. `status.state: "error"` sets FAILED with the Stream error code. Clips and live recordings (#27) raise their own events.
6. **Failures.** Each step retries 3 times with backoff (Queue retries, then a dead letter queue). Items in UPLOADING for 24 hours or PROCESSING for 2 hours are failed by a sweep job and their reserved bytes released. `retryProcessing` lets the creator retry once an hour.

### 3.6 Delivery

**Media gateway** (`apps/media-gateway`, a Worker on `media.ampedusercontent.com`, a separate registrable domain). Every R2 byte a viewer receives passes through it.

- **Token.** The API signs `v1.{kid}.{payload}.{sig}`: payload base64url JSON `{ k: r2Key, r: role, exp, dl, fn?, j? }`, signature HMAC SHA-256 with the key named by `kid`. Two keys are active during rotation (`MEDIA_TOKEN_KEYS` in the API secret store and as Worker secrets). URL: `https://media.ampedusercontent.com/{r2Key}?t={token}`.
- **Worker steps.** Verify the signature and `exp`. Confirm the path equals `k`. Check the takedown list (Workers KV `blocked:{publicId}`, written by the API on block and delete). Look up the cache by key without the token. On a miss, `env.CONTENT.get(key, { range, onlyIf })` and stream the body. Cache objects up to 512 MB: the Worker stores its own copy with `Cache-Control: public, max-age=86400` under the token free key (the Cache API refuses `private` responses) and sends the viewer the headers below. Return 403 with no body on any failure.
- **Headers.** `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox; default-src 'none'`, `Cross-Origin-Resource-Policy: cross-origin`, `Cache-Control: private, max-age=300` on gated responses, `Content-Disposition: attachment; filename="{fn}"` when `dl` is set, `Accept-Ranges: bytes`, and `Access-Control-Allow-Origin` for `https://app.amped.bio` and `https://amped.bio` (staging hosts on staging) so the PDF viewer and waveform fetches work.
- **Abuse.** WAF rate limit per IP on the zone. Logs keep the key and status, never the token.

**Video.** The shared player (#26) plays the Stream HLS manifest (hls.js, native HLS on Safari) with a Stream token: RS256 JWT with `sub` video uid, `kid`, `exp`, `nbf`, signed with our Stream key. Thumbnails use the same token. MP4 downloads use a token with `downloadable: true`. The Stream iframe player is not used in the app.

**Audio** plays in an `audio` element from a gateway URL with Range support. **Documents** open in the in app PDF viewer from a gateway URL. **Images** load renditions by width.

| Asset | Public item | Gated item |
|---|---|---|
| Image renditions, covers, posters | 24 hours, expiry rounded to the hour so server HTML stays cacheable | 5 minutes |
| Blur cover | 24 hours, served to everyone | 24 hours, served to everyone |
| Document viewer | 1 hour | 5 minutes |
| Audio | 24 hours | duration plus 10 minutes, at most 4 hours |
| Stream playback token | duration plus 30 minutes, at most 6 hours | duration plus 10 minutes, at most 4 hours |
| Preview clip token, audio preview | 1 hour | 1 hour |
| Download, R2 original | 2 minutes, single use | 2 minutes, single use |
| Download, Stream MP4 | 2 minutes | 2 minutes |
| Store banner and product covers | 24 hours, rounded | 24 hours, rounded (covers are never gated) |

- **Access check** follows the gating engine contract. The client calls `access.check({ resource: { type: "content", id: publicId } })` for the state, then `access.issueGrant` and `content.getReadUrl({ publicId, grant })` to open. `getReadUrl` calls `verifyAccessGrant` and signs with expiry `min(TTL above, grant expiry)`, except the stream rule. Public items need no grant.
- **Stream rule.** Stream checks the token on every segment and stops at expiry, and the browser fetches audio in Range requests through the gateway for the whole play. So a Stream token and a gated audio URL both live the item duration plus 10 minutes (4 hours at most) even though a grant lives 10 minutes. A fan who loses access finishes that play session and is refused on the next. The gating engine spec records this exception for video and audio.
- **Previews.** A locked viewer never holds a token for the full video or audio. `content.getPreview` signs the clip uid or the audio preview key only.
- **Downloads.** `getReadUrl({ download: true })` counts downloads per buyer per item per day in Redis (decision 24) and puts a `jti` in the token. The gateway enforces single use with a Durable Object keyed by `jti` (KV is eventually consistent, so it cannot). Stream MP4 downloads are not single use: they carry a 2 minute token with `downloadable: true`, and the processor turns on the MP4 download (`POST /stream/{uid}/downloads`) only for videos with downloads allowed.
- **Takedown.** Block or delete writes the KV entry and purges the cache key. R2 tokens stop working within KV propagation (about 60 seconds). Stream videos are set `requireSignedURLs` already, so a blocked video is also deleted from Stream or has its signing denied by `getReadUrl`.
- **Server rendering.** Bio, feed, store and product pages render gated items locked, with blur covers only. Full URLs are fetched by the browser after hydration and never appear in server HTML, page caches, JSON-LD, share tags, the sitemap or `llms.txt`.
- **18+.** `getReadUrl`, `getPreview` and every public list refuse 18+ items for viewers without a passed age check (#28).
- **Broadcast attachments.** A broadcast references items by `publicId`. `getReadUrl` accepts a grant for `{ type: "broadcast", id }` and confirms the item is attached to that broadcast. Emails never carry media URLs.

### 3.7 Content on the creator page

Three new block types in `packages/constants/src/blocks.ts` (`BaseBlockType` gains `content`, `store`, `membership`; the union is listed in five places per the Telegram readiness note, all five change):

```ts
export type ContentBlock = BaseBlock<"content", { label?: string; layout: "featured" | "grid" | "list"; publicIds: string[] }>; // 1 to 12
export type StoreBlock = BaseBlock<"store", { label?: string; layout: "row" | "grid"; offerIds: string[]; showVisitStore: boolean }>; // 1 to 6
export type MembershipBlock = BaseBlock<"membership", {}>; // singleton, renders the #25 membership card
```

- Saves confirm every id belongs to the block owner. Unpublished, deleted, paused or 18+ entries are skipped at render. A block with nothing left hides itself.
- The landingpage renders blocks on the server from `content.listForBio` and `store.listForBio`, in the creator's theme (Prism 2.2 section 17: creator font, colors, container and button style, no Prism color).
- Add block gains a Sell section (Store, Membership) beside Content.

**Public routes** (`apps/landingpage/src/app/[handle]/`):

| Route | Renders | Index |
|---|---|---|
| `/{handle}/c/{publicId}` | Item page. Public: the player or viewer. Locked: preview and the unlock card. Paid: Part of {product} with Buy. Owned: Open, Download | Public items only |
| `/{handle}/content` | Creator feed page (#26): every published item newest first, kind chips, locked cards with no media reference | Yes when the creator has a public item |
| `/{handle}/store` | Storefront (3.8) | Yes when live |
| `/{handle}/store/{slug}` | Product page (3.8) | Yes when active and not 18+ |

All four use the same `getHandle` path and return not found for an unpublished page, a suspended account or a store that is not live.

### 3.8 The store

**Storefront** at `/{handle}/store`, rendered on the server in the creator's theme.

| Section | Shows | Hidden when |
|---|---|---|
| Header | Banner (3:1, cropped at 4:3 on phones), avatar, store name, tagline, Follow button (Fan Graph), member count from the plan rule (null under 10) | never |
| Membership | The #25 membership card (mb2 and mb10 states), with "Includes N items" counted from items whose rule includes the plan | no active plan |
| Featured | Up to 3 products in the large card | none chosen |
| Products | All active products in the creator's sort order, kind chips (All, Video, Audio, Downloads, Bundles), product cards with cover, title, kind, length or item count, amount, access line | none active |
| Free | Public items, newest 6, View all opens `/{handle}/content` | none public |
| Live | Upcoming ticketed and members only streams from #27 | #27 not live or none scheduled |
| About | The About text and the refund line | always shows the refund line |
| Footer | Powered by Amped.Bio mark, Report store | never |

- The creator picks the section order in Storefront settings. Header and Footer are fixed.
- Product cards never show staking words, pool figures or tREVO. Amounts read `3 USDC`. The word price is not used in copy.
- Layouts: Grid (2 columns on phones, 3 on desktop), List (one row per product), Feature (first product full width, then grid).
- Signed out fans see the full store. Buy and Join open sign up with `?next=` back to the product.
- The owner sees an Edit store chip that opens Content, Store.
- 18+ products are listed only to signed in viewers with a passed age check and are never in server HTML for anyone else.

**Product page** at `/{handle}/store/{slug}`:

- Cover or the preview player (the first previewable item), title, description.
- What is included: one row per item with kind, length, pages or file size, and a lock or check per the viewer's access.
- Access line: Yours to keep, or Access for 30 days, or Access for 365 days.
- Amount and Buy. When Also in membership is on: Join to open this and N more, beside Buy.
- Members of the plan see Included in your membership and Open.
- Owners (buyers with access) see Open, and Download per item when allowed. A bought bundle opens a list of its items.
- JSON-LD `Product` with an `Offer` (`priceCurrency: "USD"`, amount, availability). No media URL.
- Share tags use the cover rendition only.

**Storefront settings** (Content, Store, Storefront, st1). Fields per `StoreSettings`. The phone preview renders the real store in the creator theme as fields change. Autosave like the rest of the editor. The Store live switch is enabled when the checklist passes (decision 22):

1. Seller terms accepted (`User.payment_terms_accepted_at`, #25).
2. USDC on Base ready in the wallet (#29).
3. One active product or an active membership plan.
4. Email verified (the verification grace rule ends at go live, because sales send receipts).

Pausing the store hides it and stops new sales. Existing buyers and members keep access.

**Products** (Content, Store, Products, st2 and st3).

- New product: pick kind, pick items from the library (published, READY, moderation CLEAR, owned by the creator), set title, slug (auto from title, editable, unique per creator), description, cover (from an item or an upload), amount (0.50 to 1,000 USDC), access period, Also in membership (only with an active plan).
- Activating a product writes the item rules (3.3) and makes the product visible. An item with Public visibility cannot be in a product; the editor offers to change it.
- Editing the amount affects new buyers only. Removing an item from an active bundle is refused while the bundle has buyers within access; the creator archives the product and makes a new one.
- Archive hides the product from the store. Buyers keep access for their period.
- Sell in store in the item editor creates a single item product with the item's title and cover.

**Membership** (Content, Store, Membership, st4). The plan editor (board mb1, placed in People by #25 decision 9) moves here: name, benefits, monthly and yearly amounts, the saving line, status, Show member count. People, Members keeps the member list.

**Sales** (Content, Store, Sales, st5). Reads `Purchase`, `Membership` and `PaymentEvent` through `store.sales`. Rows show buyer display name and handle, never email or wallet. Refund opens the #25 refund flow. Export CSV per month. Links to Wallet Activity with the Sales filter.

### 3.9 Checkout, access and the split

**The sheets.** Buy opens the pay sheet and Join opens the join sheet, both from #25 3.8 and both in the creator's theme (payment flow rule 3): Paying @handle, the figures, Includes the Amped.Bio fee of 5%, the required checkbox, the commit button with verb and amount, the wallet note and the Powered by Amped.Bio mark. A short balance shows Your wallet needs 3 USDC more and the Add USDC link to Wallet, Fund, which returns to the product (rule 1). This spec adds to the pay sheet:

- A bundle line: Bundle, 12 items.
- Referred by @promoter on the Review step when a promoter code is attributed.
- The access line from the product.
- The thank you note on the result step, then Open.

**Purchase flow.**

1. `payments.quote({ offerId, via? })` returns amount, fee, balance, short by, and the attributed promoter.
2. `payments.pay.prepare` builds the split (below) and the EIP-3009 `receiveWithAuthorization` typed data for the total.
3. The fan signs. `payments.pay.submit` sends it through the relayer (#29 CDP Server Wallet) to AmpedPay with the signed split.
4. The indexer confirms the `Paid` event, sets the Purchase `confirmed`, increments `Offer.salesCount`, calls `invalidatePurchase`, writes the follow with `source = payment` (#25 decision 14) and the Library row (#26).
5. The sheet polls `payments.status` and opens the product without a reload.

**The split** (decision 8, contract owned by #15 and #25). For each payment the API builds and signs an EIP-712 `SplitTable`:

```
SplitTable {
  bytes32 paymentRef;        // Purchase id or Membership charge id
  address payer;
  uint256 amount;            // USDC units
  Recipient[] recipients;    // creator, partners, promoter, platform; at most 6
  uint64 validBefore;        // now + 10 minutes
}
Recipient { address to; uint16 bps; uint8 role; } // role: 0 creator, 1 platform, 2 promoter, 3 partner
```

- Platform bps comes from `PLATFORM_FEE_BPS` (500 for the pilot). Partner rows come from `SplitRecipient`. The promoter row comes from an active, in scope, unexpired code. The creator gets the remainder.
- Rules checked by the API and enforced by the contract: bps sum to 10,000; platform bps at least the on chain floor; creator bps at least 5,000; one promoter at most; every address screened (#29 3.4).
- The signer is a CDP Server Wallet account used only for split signing, with a policy that allows EIP-712 signing only. The contract stores the signer address and verifies the signature, `validBefore` and the payer.
- `Purchase.splitHash` stores the hash of the signed table. Sales and receipts read the recipients from the `Paid` event, not from the database.
- **Memberships.** Renewals are keeper pulls with no fresh signature, so the split for a membership is signed once at join and stored by AmpedMemberships with the subscription (recipients and bps; `validBefore` applies to the join only). Every renewal pays the stored recipients. The promoter row lasts for the life of that subscription; partner rows are as they were at join. A creator's later partner change applies to new members only.
- **Refunds** (decision 25). The fan gets the full amount back in one AmpedPay call: the creator's wallet funds the creator, promoter and partner shares, and the treasury returns the platform share (#25 decision 11). Promoter and partner shares are not pulled back on chain. Sales shows them per refund, and a promoter code with refunds above 10% of its sales in 30 days pauses for the creator to review.

**Promoters** (decision 20, Phase 4).

- A creator creates a code in Sales, Promoters: choose an Amped.Bio account by handle, a share (1% to 30%), all products or chosen ones, an optional end date. The promoter gets an in app notice and sees the code in their own Sales view.
- Links: `amped.bio/{handle}/store?via={code}` and the same on product pages. The code rides in the URL through to checkout. Holding it in a 30 day first party cookie is attribution tracking, so it goes to the consent review under `docs/legal/privacy-parameters.md` first; until counsel classifies it, the cookie is set only after consent and the URL code is the fallback. The latest code wins.
- A creator cannot promote their own products. A promoter cannot buy through their own code.
- Promoters must disclose the relationship where they post (FTC). The code screen says so.

**Access after payment.** A confirmed Purchase with `accessUntil` null or in the future passes the `paid` leaf. A member passes the `member` leaf (#25 3.3). The item page, the store and the Library recheck with `checkAccessBatch`. Refund revokes within 60 seconds (#25 acceptance 11).

### 3.10 tRPC procedures

`apps/server/src/trpc/content.ts` and `store.ts`, registered in `apps/server/src/trpc/index.ts`. Public outputs select explicit fields and never include email, wallet address or numeric user id.

| Procedure | Auth | Purpose |
|---|---|---|
| `content.createUpload` | private | Validate, reserve quota, return the R2 or Stream target |
| `content.signParts` | private, owner | Presign R2 part URLs |
| `content.completeUpload` | private, owner | Verify size and type, start processing |
| `content.abortUpload` | private, owner | Abort and release quota |
| `content.retryProcessing` | private, owner | Retry a FAILED item, once an hour |
| `content.list` | private | Library, filters, cursor |
| `content.get` | private, owner | Item with assets and rule |
| `content.update` | private, owner | Title, description, cover, chapters, captions, downloads, preview, 18+, rule |
| `content.publish`, `content.unpublish` | private, owner | Publish needs READY and moderation CLEAR |
| `content.delete`, `content.restore` | private, owner | Soft delete, purge after 30 days, restore within 30 |
| `content.getStorage` | private | Quota and use by kind |
| `content.listForBio` | public | Cards for a content block |
| `content.feed` | public | Creator feed page (#26) |
| `content.getPublic` | public | Item page metadata |
| `content.getPreview` | public | Blur cover, preview clip token, audio preview |
| `content.getReadUrl` | public for public items, private with grant | Gateway URLs and Stream tokens |
| `content.report` | public, rate limited | Report an item |
| `store.settings.get`, `store.settings.update` | private | Storefront settings |
| `store.setLive` | private | Runs the checklist, sets live or paused |
| `store.products.list`, `get`, `upsert`, `setStatus`, `reorder` | private | Product catalog |
| `store.public` | public | Storefront payload for a handle (sections, products, plan summary, free items) |
| `store.product` | public | Product page payload, with the viewer's access when signed in |
| `store.listForBio` | public | Cards for a Store block |
| `store.sales` | private | Orders, totals, CSV |
| `store.report` | public, rate limited | Report a store or a product |
| `store.promoters.list`, `upsert`, `setStatus` | private | Promoter codes (Phase 4) |
| `store.promoter.mine` | private | A promoter's codes and attributed sales |
| `admin.content.queue`, `admin.content.decide` | admin | Held items, reports, clear, block, restore |
| `admin.copyright.*` | admin | Record notice, act, counter notice, restore |
| `admin.store.partners.*` | admin | Partner split rows with consent date |
| `admin.store.pause` | admin | Pause a store |

- `getReadUrl` refuses any item that is not READY, not moderation CLEAR, or has a served asset whose scan is not CLEAN or an allowed SKIPPED (re-encoded assets only).
- `getReadUrl`, `getPreview`, `report` and the public store procedures are rate limited per IP and per user (30 a minute).
- Payment procedures (`payments.quote`, `pay.prepare`, `pay.submit`, `payments.status`, `payments.refund`, `memberships.*`) are defined by #25 and #15. This spec adds `via` to `payments.quote` and `pay.prepare`.

### 3.11 Trust, safety and compliance

**Legal.**

- **DMCA.** Designated agent registered with the US Copyright Office ($6, renew every 3 years). Copyright policy page with a notice form. Valid notices disable the item and its products within 1 business day and notify the creator. Counter notices restore after 10 to 14 business days unless the claimant files suit (17 U.S.C. 512(g)). Buyers of a removed item see Removed after a copyright notice and the creator decides on refunds.
- **Repeat infringers.** Three valid strikes in 12 months ends the account and pauses the store.
- **Hash blocklist.** Items removed for copyright or malware add their SHA-256 to `BlockedContentHash`.
- **CSAM.** Matching is a launch requirement. A match blocks the item, suspends the account, pauses the store, stops all of the user's delivery (KV takedown on every item) and moves the file and required metadata to a separate evidence bucket (R2, its own token, bucket lock for 1 year). A report goes to the NCMEC CyberTipline (18 U.S.C. 2258A). Evidence is kept 1 year (REPORT Act 2024). Staff do not open matched files. Written procedures with counsel before launch.
- **Adult content.** Per #28. Creator labels, classifier backstop, 18+ items and products only for viewers with a passed age check, never on the public bio, store HTML, feed, SEO, share previews, email, push, Telegram or brand portal.
- **Seller terms.** The creator is the seller (#25 decision 12). Seller terms cover the license to sell, refunds, taxes and the content policy. Accepted before the store goes live.
- **Terms and content policy.** Terms of Service and a Content Policy cover prohibited content, rights warranty, the license to host and display, enforcement and selling.

**Technical.**

- Type allowlist enforced three times: declared type at `createUpload`, magic bytes at `completeUpload`, and re-encoding or transcoding.
- Image EXIF and location removed. Container and document metadata removed.
- Malware scan before any file is downloadable.
- User content on `ampedusercontent.com` with a sandbox CSP and `nosniff`. No SVG, HTML or scripts.
- No public bucket, no `r2.dev`, no presigned GET for viewers.
- Presigned uploads bind type and length.
- Quotas per user. `CONTENT_UPLOADS_ENABLED` and `STORE_SALES_ENABLED` stop uploads or sales during an incident.
- Secrets in the server secret store: R2 keys, Stream API token, Stream signing key, Stream webhook secret, media token keys, processor secret, PhotoDNA and classifier keys. Worker secrets set with `wrangler secret`.
- Logs never include tokens or full signed URLs.

**Copy rules** (product copy and marketing):

- No earn, yield, return, profit, invest, investment, passive income, income or gains on any content or store surface (`CONTENT_BANNED_TERMS` in `packages/constants/src/compliance.ts`). Store and checkout surfaces also ban stake, staking, pool and tREVO (#25 3.9). Locked states for stake rules follow `ACCESS_BANNED_TERMS` and show `ACCESS_STAKE_DISCLOSURE`.
- Amounts read `3 USDC`. The word price is not used in shipped copy.
- The fee line reads its percentage from `PLATFORM_FEE_BPS`. A change to the fee updates every sheet and receipt, and counsel reads the new line before it ships.
- Approved words: members only, membership, join, buy, yours to keep, access, support, library, drop, store.
- Protection claims: "streams through a protected player". Never "cannot be copied" or DRM.
- Safety claims: "every upload is scanned before it goes live". Never "100% safe".
- No "share anything".
- Recurring and one time terms per #25 3.9. Refund line on every product page and receipt.
- Featured creators who received perks disclose it (FTC). Promoters disclose their code (FTC).
- No em or en dashes.
- `scripts/check-compliance-copy.ts` scans content and store components in `apps/client` and `apps/landingpage` on every build. Any match fails the build. Exemptions: the fixed disclosures.

**Privacy.** New recipients for the privacy notice before production: Cloudflare (storage, delivery, video, processing), PhotoDNA (Microsoft), the classifier vendor. The promoter cookie is classified by counsel before Phase 4 and set only with consent until then. Store and sales views show name and handle only. `ContentItem`, `Offer`, `Purchase` and `PromoterCode` join the account export and deletion flow (#13). Check against `docs/legal/privacy-parameters.md` and bump `CONSENT_POLICY_VERSION` when the notice changes materially.

### 3.12 Retention and deletion

- **Item delete.** Soft delete sets DELETED and `purgeAfter = now + 30 days`. Delivery stops at once (KV takedown). A daily job deletes R2 objects, the Stream video and clips, `ContentAsset` rows and releases quota.
- **Items that buyers own.** Deleting an item inside a product with buyers within access asks the creator to confirm: Buyers lose access. Refund them from Sales if you promised access. The item is removed from the product and buyers see Removed by the creator.
- **Account delete** (#13). Delivery stops at once. Objects and Stream videos are gone within 30 days. The store closes. Purchases and payment events are kept as financial records for the period counsel sets, with the buyer's identity removed.
- **Legal holds.** CSAM evidence (1 year) and DMCA records (3 years) are kept outside user tables.
- **Export.** Item metadata, product catalog and sales CSV, and download links for originals that still exist.
- **Backups.** R2 has no versioning on the content bucket. Database backups age out on their schedule.

### 3.13 Analytics

Events follow the analytics registry (#11). No email. Viewer identity is hashed. Ids are public ids.

| Event | Properties |
|---|---|
| `content_upload_started`, `_completed`, `_failed`, `_aborted` | kind, size_bucket, upload_id, resumed, reason_code |
| `content_processing_failed` | kind, step, reason_code |
| `content_ready` | kind, size_mb, seconds_to_ready |
| `content_blocked` | kind, reason_code (malware, policy; CSAM only in the restricted system) |
| `content_unsafe_served` | kind, reason_code |
| `content_published` | kind, rule_kind |
| `content_viewed` | kind, gated, surface (bio, item, feed, store, library, broadcast) |
| `content_locked_impression`, `content_unlock_clicked`, `content_unlocked` | rule_kind, seconds_since_impression |
| `content_downloaded` | kind |
| `store_live`, `store_paused` | products, has_plan |
| `store_viewed` | source (bio, direct, share, promoter), layout |
| `product_viewed` | kind, source |
| `product_buy_clicked`, `product_join_clicked` | kind |
| `product_purchased` | kind, amount_bucket, promoter (true or false), seconds_from_view |
| `promoter_code_created`, `promoter_sale` | bps_bucket |
| `content_adoption_snapshot` | creators, uploading_creators_month, published_items, live_stores, active_products (daily) |

KPIs at 90 days after general availability (proposed):

| KPI | Target | Measurement |
|---|---|---|
| Creators who upload in a month | 30% | snapshot |
| Upload success | 98% | completed over started, excluding user aborts |
| Time to Ready for a 1 GB video | under 5 minutes at p95 | `seconds_to_ready` |
| Creators with a live store | 15% of creators with a published page | snapshot |
| Store view to purchase | 2% | `product_purchased` over `store_viewed` sessions |
| Share of sales through promoters | 10% | `product_purchased` with promoter true |
| Valid DMCA notices actioned in 1 business day | 100% | DMCA events |
| Unsafe files served | 0 | `content_unsafe_served` plus the restricted CSAM count |

### 3.14 Acceptance criteria

1. A 1 GB MP4 uploads from a phone to Stream, survives a dropped connection, resumes, and plays within 5 minutes.
2. A 300 MB WAV uploads to R2 in parts, resumes after a drop, and plays as AAC.
3. A PNG with GPS EXIF uploads. No served rendition carries EXIF.
4. A file renamed from `.exe` to `.pdf` fails at `completeUpload` and is never readable.
5. EICAR inside a ZIP is blocked, quarantined, and its hash blocks a re-upload.
6. A PhotoDNA test image blocks the item and raises the alert. No URL for it is ever issued.
7. Uploading past quota is refused before any bytes are sent.
8. A direct request to the R2 S3 endpoint or any `r2.dev` URL for a content key fails. A gateway request with an expired, altered or other key's token returns 403.
9. A gated item's page, the store and the product page contain no media URL in HTML, JSON-LD, share tags, the sitemap or `llms.txt`.
10. A fan without access gets the blur cover and the preview only. A preview token cannot play the full video.
11. A fan who buys a product opens every item in it without a reload, and the item appears in their Library as Purchased.
12. A member opens an item marked Also in membership without being asked to pay. A non member sees Buy and Join.
13. A refund revokes access within 60 seconds. The gateway refuses new URLs and the Stream session ends at its token expiry.
14. Every pay sheet renders in the creator's theme, names Paying @handle, shows Includes the Amped.Bio fee of 5%, and links to Wallet when short. No sheet embeds Buy USDC.
15. A purchase splits in one transaction to the creator, Amped.Bio and, when attributed, the promoter, at the bps in the signed table. A table with bps not summing to 10,000, platform below the floor, or an expired `validBefore` reverts.
16. A store goes live only after the checklist passes. A paused store returns not found and keeps buyers' access.
17. A promoter code pays its share only on in scope products and never on the promoter's own purchase.
18. Deleting an item stops delivery within 60 seconds. Objects and Stream videos are gone after the purge.
19. No content or store procedure returns an email, wallet address or numeric user id.
20. An unlabeled explicit image is HELD. A labeled 18+ item or product is never returned to a viewer without a passed age check, by any procedure, page, feed or preview.
21. A valid DMCA notice disables the item and its products, notifies the creator and records `within_one_business_day`.
22. The copy check finds no banned term, no price wording and no em or en dash on content and store surfaces.
23. Reduced motion, keyboard reachability, the 44 target rule and measured contrast hold on every new control.
24. Typecheck and build pass for `server`, `client`, `landingpage`, `admin`, `@repo/constants`, `@repo/database`, `@repo/ui` and both Workers. Vitest covers upload validation, processor callbacks, gateway token verify, Stream webhook signature, rule writing for products, store checklist, split building, promoter attribution and the copy scan.
25. No part of the upload path sends file bytes through the API server.

### 3.15 Phases

All dates are proposed. Each phase ships behind its flags and starts with the pilot creators.

| Phase | Ships | Needs first | Gate before production |
|---|---|---|---|
| 0. Prerequisites (October) | PR 1. Cloudflare setup (3.17). PhotoDNA application, DMCA agent, Content Policy, seller terms draft, classifier vendor. 25 pilot creators | Nothing | None |
| 1. Free content (November to December, 3 to 4 weeks of build) | PR 2 to PR 7: library, uploads, processing, gateway, item page, feed page, content block, trust and safety | Phase 0 | PhotoDNA live, DMCA agent and policy published, Terms and Content Policy updated, privacy notice recipients added |
| 2. Gated content | PR 8: rule picker, locked cards, previews, grants, broadcast attachments. Followers, Pool fans and Fans with a minimum stake | Gating engine core (#21 phases 0 and 1) on development | Counsel receives the stake copy in parallel (decision 4) |
| 3. Store and sales | PR 9 and PR 10: storefront, products, bundles, store block, pay sheet, Sales, refunds | #29 USDC wallet on development. AmpedPay with the split table deployed on Base Sepolia (#15). `paid` kind live in the engine | AmpedPay audit, counsel on seller terms, custody and tax (#25 3.12), privacy notice |
| 4. Membership in the store and promoters | PR 11 and PR 12: Membership tab, membership card and block, Members or Paid items, promoter codes, partner rows | AmpedMemberships deployed (#25 phase C) | AmpedMemberships audit, counsel on recurring consent copy |
| 5. Later | Custom store domains, AI captions, discount codes, watermarking and PDF stamping, move avatars and backgrounds to R2 and close the public S3 bucket, EU bucket if counsel asks | | |

The critical path is outside this spec: the gating engine has no build plan yet and lives only on the old fork branch, and AmpedPay with the split table is not started. Phase 1 needs neither and can start now.

### 3.16 PR plan

Thirteen PRs including this one. Each from a fresh `development`, each targeting `development`, reviewed by Gustavo, conventional commit prefixes, flags off in production. Every PR runs locally before opening: `pnpm run typecheck`, `pnpm run build`, `pnpm --filter server test`, `pnpm run format:check`, and for the Workers `pnpm --filter media-gateway test` and `pnpm --filter media-processor test`. A PR with a migration says "migration applied by hand after merge", and Gustavo applies it on staging before the flag goes on. No PR touches `main`. Sizes assume one engineer.

| PR | Branch | Size | Phase | Depends on |
|---|---|---|---|---|
| 0 | `docs/content-system-store` | done | | |
| 1 | `fix/uploads-sdk-v3-validation` | 1.5 days | 0 | |
| 2 | `feat/content-foundation` | 4 days | 1 | 1, Cloudflare setup |
| 3 | `feat/media-gateway` | 2.5 days | 1 | 2 |
| 4 | `feat/media-processor` | 5 days | 1 | 2 |
| 5 | `feat/content-library-ui` | 5 days | 1 | 2 |
| 6 | `feat/content-public-pages` | 3 days | 1 | 3, 5 |
| 7 | `feat/content-trust-safety` | 4 days | 1 | 4, 6 |
| 8 | `feat/content-gating` | 4 days | 2 | 7, #21 core |
| 9 | `feat/store-catalog` | 5 days | 3 | 8 |
| 10 | `feat/store-checkout` | 4 days | 3 | 9, #29, #15 AmpedPay |
| 11 | `feat/store-membership` | 3 days | 4 | 10, #25 phase C |
| 12 | `feat/store-promoters` | 3 days | 4 | 10, split table in AmpedPay |

About 44 engineer days in total. PRs 3, 4 and 5 can run in parallel after PR 2.

**PR 1. `fix/uploads-sdk-v3-validation`.** Replaces the v2 `getSignedUrlPromise` PUT signing in `S3Service` with `@aws-sdk/s3-request-presigner` and removes `aws-sdk` from `apps/server/package.json`. Confirm steps compare HeadObject `ContentLength` with the declared size and read the first 4 KB to check the real type. Tests for both. Closes the Build Board fix cards Remove AWS SDK v2 and Enforce upload size and file type. No user facing change.

**PR 2. `feat/content-foundation`.** Migration for `ContentItem`, `ContentAsset`, `UserStorageQuota`, `ContentReport`, `CopyrightNotice`, `BlockedContentHash`. `packages/constants/src/content.ts`. `apps/server/src/services/cloudflare/` with `r2.ts` (S3 client on the R2 endpoint, presigned PUT and multipart), `stream.ts` (TUS upload URL, clip, captions, downloads, token signing), `mediaToken.ts` (gateway token signer, shared format in `packages/constants/src/mediaToken.ts`). `content` router: createUpload, signParts, completeUpload, abortUpload, list, get, update, getStorage. Routes `POST /webhooks/cloudflare-stream` and `POST /internal/content/processed`. Env and secrets per 3.17. Flags `CONTENT_UPLOADS_ENABLED=false`, `VITE_CONTENT=false`. Tests: validation, quota reservation, webhook and callback signatures, token format.

**PR 3. `feat/media-gateway`.** New `apps/media-gateway` (Wrangler, TypeScript, R2 binding `CONTENT`, KV binding `TAKEDOWN`). Token verify with two key rotation, path match, takedown check, cache by key, Range, headers per 3.6. Tests with the Workers Vitest pool. CI gains typecheck and test for the Worker. Deploy is `wrangler deploy` run by Gustavo per environment until deploy automation exists.

**PR 4. `feat/media-processor`.** New `apps/media-processor`: Queue consumer Worker plus a Container image (ffmpeg, sharp, ClamAV with a daily signature update, pdfium). Steps per 3.5 with idempotent writes. PhotoDNA and classifier adapters with a mock adapter on staging until keys arrive. Callback client. Dead letter queue handling. Tests per step with fixture files (EICAR, GPS PNG, renamed EXE, zip bomb, 30 second MP3).

**PR 5. `feat/content-library-ui`.** Content destination with the Library tab (cs1), upload dialog with R2 multipart and `tus-js-client` for video (cs2), item editor with Public only (cs3; other rules show Later), storage meter, empty, loading and error states (cs8). Autosave. Flag `VITE_CONTENT`.

**PR 6. `feat/content-public-pages`.** `content` block type in the five places, block editor, landingpage routes `/{handle}/c/{publicId}` and `/{handle}/content`, `listForBio`, `feed`, `getPublic`, `getReadUrl` for public items, publish, unpublish, delete, restore, the purge job, Report content, JSON-LD for public items, sitemap and `llms.txt` entries. Boards cs4, cs6, cs7.

**PR 7. `feat/content-trust-safety`.** Admin content queue and decisions in `apps/admin`, DMCA tools, hash blocklist actions, CSAM evidence path and alerting, KV takedown writes and cache purge, the 18+ refusals in every public procedure (#28 hook), analytics events, the copy scan over content components. Phase 1 launch gate items are checked off in the PR description.

**PR 8. `feat/content-gating`.** Registers the `content` resolver, the rule picker in the item editor (Everyone, Followers, Members, Pool fans, Fans with a minimum stake, Paid, Any of), locked cards, `getPreview` with clip tokens and audio previews, grant to URL exchange, the stream rule, broadcast attachments, cs5. Members and Paid show Later until PR 10 and PR 11.

**PR 9. `feat/store-catalog`.** Migration for `StoreSettings`, `Offer`, `OfferItem` and the `offerItems` back relation on `ContentItem`. `store` router for settings, products, public, product, listForBio. Store tab with Storefront and Products (st1, st2, st3), storefront and product pages (st6, st7, st8), `store` block type (st10), product rule writing. The store renders for its owner in preview only while `STORE_SALES_ENABLED` is off.

**PR 10. `feat/store-checkout`.** Migration for `SplitRecipient` (read by the split builder, empty until admins add partners) and the `Purchase` columns. `via` on `payments.quote` and `pay.prepare`, the pay sheet additions (st9), purchase to access wiring, `Offer.salesCount` from the indexer, Library Purchased rows, the go live checklist and `store.setLive`, Sales view with CSV and refunds (st5), the store copy scan. Flag `STORE_SALES_ENABLED` plus the pilot allowlist.

**PR 11. `feat/store-membership`.** Membership tab with the plan editor (st4), membership card on the store and the `membership` block type, Also in membership on products, `any(member, paid)` rule writing, Join from the product page.

**PR 12. `feat/store-promoters`.** Migration for `PromoterCode`, promoter codes in Sales, the `via` cookie, attribution in the split, the promoter's own view, admin partner rows with consent dates, FTC line on the code screen.

### 3.17 Setup checklist (before PR 2 reaches staging)

1. Two Cloudflare accounts (production and staging) on Workers Paid. Containers enabled.
2. Register `ampedusercontent.com` and add it as a zone. Hosts `media.` (production) and `media-staging.`.
3. R2 buckets `amped-content` and `amped-content-staging`. Public access and `r2.dev` off. CORS per 3.4. Lifecycle: abort multipart after 1 day, `quarantine/` expires after 30 days.
4. R2 API tokens: one per environment, Object Read and Write on its bucket only.
5. Event notification on each bucket: `object-create`, prefix `incoming/`, to Queues `content-ingest` and `content-ingest-staging`, each with a dead letter queue.
6. KV namespaces `takedown` and `takedown-staging`.
7. Stream allows one webhook per account, so staging runs on its own Cloudflare account (its own Stream library, R2 bucket, Queue, KV and Workers). On each account: create the signing key, set the webhook URL to `https://{api host}/webhooks/cloudflare-stream`, record the webhook secret. Prepay storage for the pilot (start at 10,000 minutes) with an alarm at 80%.
8. WAF rate limit on the media hosts. Turn on the CSAM Scanning Tool for the zone.
9. Secrets in the server secret store: `CF_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `CF_STREAM_API_TOKEN`, `CF_STREAM_KEY_ID`, `CF_STREAM_KEY_PEM`, `CF_STREAM_WEBHOOK_SECRET`, `MEDIA_GATEWAY_ORIGIN`, `MEDIA_TOKEN_KEYS`, `CONTENT_PROCESSOR_SECRET`, `PHOTODNA_KEY`, `CLASSIFIER_API_KEY`. Worker secrets: `MEDIA_TOKEN_KEYS` (gateway), `CONTENT_PROCESSOR_SECRET`, `PHOTODNA_KEY`, `CLASSIFIER_API_KEY` (processor).
10. Apply for PhotoDNA Cloud Service. Open the classifier vendor account.
11. Register the DMCA agent. Publish the copyright policy page.
12. Wrangler access for Gustavo per environment.

### 3.18 Edits this spec makes to other specs

- **Gating engine (#21).** Content resources use `publicId`. The resolver returns `adult`. Gateway tokens replace CloudFront signed URLs in 3.1.4; the stream exception is unchanged. Products write `paid` leaves inside `any` (at most 4).
- **Memberships and payments (#25, #15).** The creator's plan editor moves to Content, Store, Membership (#25 decision 9, creator side). The rule builder's Set up a membership link opens Content, Store, Membership instead of People, Members. `memberParamsSchema.planId` and `paidParamsSchema.offerId` become UUID strings (hex of the Binary(16) id). This spec owns `Offer` with the catalog fields and kinds `single` and `bundle` (the old `one_time` becomes `single`). `Offer`, `Purchase`, `MembershipPlan`, `Membership`, `PaymentEvent` and `OnrampSession` move to UUID v7 keys per `AGENTS.md`. `Purchase` gains `promoterCodeId` and `splitHash`. AmpedPay and AmpedMemberships take the `SplitTable` in 3.9 (the 10 Oct split table edit, before the audit). `payments.quote` and `pay.prepare` take `via`. mb6 is extended by st9. The membership card is the `membership` block type.
- **USDC wallet (#29).** The CDP policy gains the split signer account (EIP-712 signing only) and AmpedPay. Privacy recipients gain Cloudflare.
- **Fan Library (#26).** Purchased reads `Purchase` joined to `Offer` and its items. The download cap is decision 24. The feed page route and `chapters` are as specified here.
- **Live streaming (#27).** Tickets are `Offer` kind `ticket` in this catalog and appear in the store's Live section. Replays become content items. The same Stream signing key and webhook.
- **Adult content (#28).** Products inherit 18+ from their items. Store rules per 3.8 and 3.11.
- **Paid content (#18).** Delivered by this spec (Phases 3 and 4). The card can archive when PR 10 merges.
- **Paid links (#16).** Paid links stay link blocks with a `paid` rule and are not store products in v1.
- **Fix cards Remove AWS SDK v2 and Enforce upload size and file type.** Delivered by PR 1.
- **Analytics (#11) and SEO (#10).** Events in 3.13. Store, product and feed pages join the sitemap and `llms.txt`.
- **App structure v2.** Content destination tabs Library, Store, Live. Add block gains a Sell section.
- **Theme Engine v2.** The store renders with the page theme. No theme change.
- **Privacy notice.** Recipients and the promoter cookie per 3.11.

## Sources

- Cloudflare R2 pricing: https://developers.cloudflare.com/r2/pricing/
- R2 presigned URLs: https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- R2 limits: https://developers.cloudflare.com/r2/platform/limits/
- R2 multipart uploads: https://developers.cloudflare.com/r2/objects/multipart-objects/
- R2 CORS: https://developers.cloudflare.com/r2/buckets/cors/
- R2 public buckets: https://developers.cloudflare.com/r2/buckets/public-buckets/
- R2 Workers API: https://developers.cloudflare.com/r2/api/workers/workers-api-reference/
- R2 event notifications: https://developers.cloudflare.com/r2/buckets/event-notifications/
- R2 object lifecycles: https://developers.cloudflare.com/r2/buckets/object-lifecycles/
- R2 bucket locks: https://developers.cloudflare.com/r2/buckets/bucket-locks/
- R2 data location: https://developers.cloudflare.com/r2/reference/data-location/
- Cache and R2: https://developers.cloudflare.com/cache/interaction-cloudflare-products/r2/
- Stream pricing: https://developers.cloudflare.com/stream/pricing/
- Stream signed URLs and tokens: https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/
- Stream direct creator uploads: https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/
- Stream webhooks: https://developers.cloudflare.com/stream/manage-video-library/using-webhooks/
- Stream clipping: https://developers.cloudflare.com/stream/edit-videos/video-clipping/
- Stream captions: https://developers.cloudflare.com/stream/edit-videos/adding-captions/
- Stream downloads: https://developers.cloudflare.com/stream/viewing-videos/download-videos/
- Stream FAQ and limits: https://developers.cloudflare.com/stream/faq/
- Stream audio only uploads refused: https://community.cloudflare.com/t/what-if-i-need-to-stream-audio-files-like-a-podcast-got-an-error-that-it-wasnt-video/595455
- Cloudflare Images pricing: https://developers.cloudflare.com/images/pricing/
- Cloudflare Images private images: https://developers.cloudflare.com/images/manage-images/serve-private-images/
- CSAM Scanning Tool: https://developers.cloudflare.com/cache/reference/csam-scanning/
- WAF token authentication: https://developers.cloudflare.com/waf/custom-rules/use-cases/configure-token-authentication/
- Workers pricing (Workers, Queues, Containers): https://developers.cloudflare.com/workers/platform/pricing/
- Containers limits: https://developers.cloudflare.com/containers/platform-details/limits/
- Microsoft PhotoDNA Cloud Service: https://www.microsoft.com/en-us/photodna/cloudservice
- Thorn Safer: https://safer.io/how-it-works/
- US Copyright Office DMCA Directory: https://www.copyright.gov/dmca-directory/faq.html
- Gumroad fees 2026: https://checkoutpage.com/blog/gumroad-fees
- Stan Store pricing 2026: https://schoolmaker.com/blog/stan-store-pricing
- Patreon selling posts and collections: https://support.patreon.com/hc/en-us/articles/28352305460749-Selling-posts-and-collections-FAQ
- Fourthwall pricing: https://ecomm.design/fourthwall-pricing/
- Memberships and payments spec (#25): claude/amped-memberships-payments-spec-2026-10-08.md
- USDC wallet and on-ramp spec (#29, #5): docs/features/usdc-wallet-onramp.md

## Revision log

- 2026-09-26: First spec. S3 and CloudFront, Mux, Public or Members only, payments on hold.
- 2026-10-08: Rob's decisions applied on the fork: Cloudflare Stream for video, adult content behind age verification, CSAM vendor to discuss, Phase 2 counsel review in parallel.
- 2026-10-12: Full rewrite on `development`. Rob chose Cloudflare all in (R2, the media gateway Worker, Stream, Queues, Containers) and a creator store on the creator page where fans buy memberships and content directly from the creator. Added the store, products and bundles, store branding, the membership tab, checkout through the creator branded sheet, the split table with promoters and partners, the Sales view, UUID v7 keys, the Fan Library and Live streaming amendments, a new cost model, 13 PRs and the Cloudflare setup checklist.
