# AI auto builder: research

Build Board #14 "AI Amped bio builder". Research for Rob Frasca, 28 Oct 2026. Drafted by Claude.
Baseline: `main` at 1b498c9 (production), same code as `development` at a3ce333 plus the Broadcast flag.

## 1. The ask

Rob, 28 Oct: an auto builder that runs inside Amped.Bio. It gathers a person's links, walks them through a short guided process, and builds their page. It must migrate an existing link-in-bio page from any competitor. It is separate from building a page through Claude or ChatGPT over MCP.

## 2. What the code has today

| Area | Where | State |
| --- | --- | --- |
| MCP server | `apps/server/src/routes/mcp.ts`, mounted at `/mcp` | Four read tools only: `whoami`, `rns_lookup`, `rns_reverse_lookup`, `list_creator_pools`. No tool creates blocks, themes or bios. A page building MCP server is not in `amplifydigital-web3/amped-bio-new`, `CosimoRob/amped-bio-new` or `CosimoRob/AmpedBioWebSite`. |
| Block schema endpoint | `apps/server/src/routes/blocks-schemas.ts`, `GET /api/blocks/schemas` | Publishes link, media, text, pool and referral schemas for agents. Out of date with `packages/constants/src/blocks.ts` (no follow, followers, RNS ID or Telegram blocks). |
| Link platforms | `packages/constants/src/platforms.ts` | 24 link platforms (twitter, instagram, tiktok, youtube, linkedin, github, patreon, onlyfans, email, custom and others) and 14 media platforms (spotify, youtube, twitch, substack and others). No URL to platform detector shared by client and server. |
| Theme | `packages/constants/src/theme.ts` `themeConfigSchema` | Button style, container style, background, button, container and font colors, font family and size, transparency, three effects. System themes by category in `themeGallery`. Theme Engine v2 (#28, PRs #360 to #367) adds the registry. |
| Onboarding | `apps/server/src/trpc/onboarding.ts`, `apps/client/.../home/SetupChecklist.tsx`, `MakeYourPageCard.tsx` | Home checklist (photo, block, URL, share). No guided builder. |
| Avatar | `trpc/upload.ts` `requestAvatarPresignedUrl`, `confirmProfilePictureUpload` | Browser upload only. No server side fetch of an image by URL. |
| Outbound fetch | none | No SSRF guarded fetch utility. Block Review v2 plans `picks.preview` with an SSRF guard (not built). |
| LLM | none | No LLM SDK in any app or package. |
| Link safety | `docs/features` link URL scheme fix (D57) | `linkConfigSchema` accepts `javascript:` today. Fix is priority 1 on Step 1. |
| Rate limits | `utils/rateLimit.ts` | Redis limiter exists. `docs/features/rate-limiting.md` covers coverage. |

## 3. Competitors

### 3.1 Import from another link-in-bio

- No major vendor (Linktree, Beacons, Stan, Komi, Later, Milkshake, Taplink, Lnk.Bio, Carrd) documents an import from a competitor URL. (Linktree homepage, Beacons What's New.)
- Small players do: Jemi "Import links" block takes a Linktree or Solo.to URL (help.jemi.so); Vista Social "Import link in bio (Beta)" picks a provider and takes a URL (support.vistasocial.com); own.page offers a one click Linktree import (own.page). Field coverage is not documented for any of them.
- UniLink publishes a manual migration guide only (unil.ink).

### 3.2 Shutdowns: migration moments

| Service | Event | What users got |
| --- | --- | --- |
| Tap Bio | Shuts down 31 Oct 2026 | No export, no tool. Told to copy links by hand (taplink.at) |
| Bento.me | Linktree bought it June 2023; shut 13 Feb 2026 | A zip export of images, links and copy; Linktree Pro offer (alternativeto.net, taplink.at) |
| Koji | Shut 31 Jan 2024 after Linktree bought it | Linktree Pro trial, no transfer tool (techcrunch.com) |
| Linkpop (Shopify) | Shut 7 Jul 2025 | No tool, data deleted (taplink.at) |
| Fingertip | Linktree bought it; site shuts 1 May 2026 | Not verified |

### 3.3 AI builders

| Product | Input | Output | Review before publish |
| --- | --- | --- | --- |
| Linktree Enhance, Suggested Titles, Restyle image (Sep 2025) | Existing profile, a link, the avatar | Suggestions, link titles, a restyled avatar | Suggestions (netinfluencer.com) |
| Beacons AI Website Builder (Nov 2023), AI onboarding (Oct 2025), Beam chat (Sep 2026) | A "vibe" description; chat | Sections, blocks, appearance edits | Beam asks to confirm before publishing; Link in bio generation "coming soon" (beacons.ai) |
| Taplink AI | A business description, 5+ words, 33 languages | Sections, blocks, copy, colors in 10 to 15 s | Yes; required fields before Publish (taplink.at) |
| Stan "Stanley" (Apr 2026) | Instagram | Content strategy, not a page builder (techintelpro.com) | n/a |

Gap: no vendor builds a page from a name plus an existing page or handles, with links, bio, avatar and a theme matched to the avatar. No vendor documents a full competitor import that keeps titles, order, socials and look.

## 4. Gathering social links: platform limits

| Platform | Route | Limit |
| --- | --- | --- |
| Instagram | Instagram API with Instagram or Facebook Login | Professional (Business or Creator) accounts only since Basic Display ended 4 Dec 2024 (developers.facebook.com). Personal accounts cannot be read. |
| TikTok | Login Kit `user.info.basic`, `user.info.profile` | Avatar, display name, bio, username with user OAuth (developers.tiktok.com) |
| YouTube | Data API `channels.list` with `forHandle` | Public channel by handle, 1 quota unit (developers.google.com) |
| X | None without paid API | Terms since 29 Sep 2023 ban crawling or scraping without written consent (techcrunch.com) |

Result: the user types handles; we build canonical URLs from them. YouTube can be read publicly. OAuth for TikTok, YouTube and Instagram professional accounts is a later phase.

## 5. Legal and policy points on importing a competitor page

- Linktree terms clauses 6 and 13 bar scripts, bots or scraping tools that access, download or extract profile content. Clause 7: users keep the rights in their content (linktr.ee/s/terms).
- linktr.ee robots.txt disallows every user agent it does not name (`Disallow: /`). An Amped fetcher is an unnamed agent.
- Beacons terms 2.3(e) bar scrapers; 2.3(f) bars access "to build a similar or competitive" service; 9.1 bars bypassing robot exclusion; 7.2 the user owns their content (beacons.ai/i/terms). beacons.ai robots.txt has no Disallow rules.
- Meta v. Bright Data (N.D. Cal., Jan 2024): logged off scraping of public data did not breach terms that govern a user's own use. hiQ v. LinkedIn ended with a breach of contract finding and a settlement with an injunction (fbm.com, proskauer.com).
- Reading of the above, for counsel: a one time, user started, logged off fetch of the user's own page is closer to Bright Data, but Linktree's robots.txt and both vendors' terms still create exposure. The low risk routes are: the user pastes their page or links; the user uploads an export (Bento zip); the fetch honours robots.txt with an honest user agent.
- Linktree pages are reported to embed a Next.js `__NEXT_DATA__` block with links and socials (scrapecreators.com; github.com/benkaiser/linktree-scraper). Not verified; not used by this design.

## 6. Market

| Figure | Value | Source |
| --- | --- | --- |
| Instagram accounts with a link in bio | 31M, Linktree about 80% (24.7M), Milkshake 3.7%, Beacons 2.4%, 62 vendors (Nov 2024 scan) | influencers.club |
| Linktree users | 70M+ (self reported, 2025); its own FAQ says 50M+ | techcrunch.com, linktr.ee |
| Beacons | 10M+ creators (self reported) | beacons.ai |
| Stan | 85K active creators, $30M revenue (Aug 2026) | research.contrary.com |
| Link-in-bio tools market | $0.4B (2025) to $0.95B (2034); methods undisclosed | marketintelo.com |

## 7. Findings that shape the design

1. Switching cost is the barrier. Every shutdown above left users to copy links by hand. An importer that keeps titles, order, socials and look is a real gap.
2. Linktree is 80% of the market and its terms and robots.txt bar automated reading. The importer must work without fetching Linktree unless counsel clears it. Paste and file paths come first.
3. The builder should produce a plan the user reviews, not a page it publishes. Beacons and Taplink both stop for review.
4. One plan format should serve the in app builder now and MCP write tools later, so the two do not drift.
5. Three fixes gate launch: the link URL scheme fix (D57), rate limits (D11) and an SSRF guarded fetch.
