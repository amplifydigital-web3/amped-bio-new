# Batch 15: Public pages (Screen Review 072, 073, 097)

Each batch PR documents itself in its own file under `docs/prism/`, so open PRs never conflict on `docs/PRISM.md`.

## Rows

| Row | Screen | Result |
|---|---|---|
| 097 | Not found and error pages | Built |
| 072 | Blog index and post | Built, except I18 (reCAPTCHA loads only with auth forms): it moves the script out of the root layout for every auth form, so it ships with 074 in 15b |
| 073 | Add network page | Built |
| 074 | Wallet message signing (/sign) | Next PR (15b) |
| 090 | Developer docs (/docs) | Next PR (15b) |

## What changed

| Piece | File | Rule |
|---|---|---|
| Public shell | `components/layout/PublicPage.tsx` | The D20 shell for public pages: the room, PublicHeader, the page, then PublicFooter 55 below. Exports the Bebas title class with the section 11 shadow and the eyebrow with the 13x3 marker |
| Not found | `app/not-found.tsx`, `components/NotFoundState.tsx` | HTTP 404 with the public shell. Eyebrow 404, Bebas PAGE NOT FOUND as the only h1 (focused on arrival), one line, Go to Amped.Bio primary 55, Explore pools and Read the blog secondary. noindex (097 I01, I07, I10) |
| Variants | `app/i/blog/[slug]/not-found.tsx`, `app/i/pools/[address]/not-found.tsx`, `pools/PoolDetailContent.tsx` | Post not found (All posts) and Pool not found (All pools) use the same hero (097 I04, I05) |
| Render error | `app/error.tsx`, `components/DestinationErrorCard.tsx` | Keeps the header and footer. G1 clear card 508: This page did not load, one line cause, Try again primary, Go to Amped.Bio ghost, Error ID with copy when Next gives a digest. After two failed retries the cause reads This keeps failing. Try again later. `error.message` is never shown (097 I02, I09) |
| Root error | `app/global-error.tsx` | Own html and body on the env color, no providers, no analytics, no remote fonts. Reload page and a plain Go to Amped.Bio link (097 I03) |
| Blog index | `app/i/blog/page.tsx`, `components/blog/BlogIndexClient.tsx`, `PostCards.tsx` | Bebas BLOG hero and one line on the room. Newest post as the one G3 lens with rim and halo; the rest as G1 clear cards, 3 columns at 1173, 2 at 890, 1 at 390. Each card is one link named by its title. Load more, 12 at a time. Posts did not load with Retry is separate from No posts yet (072 I01 to I09) |
| Load more route | `app/i/blog-posts/route.ts` | Returns one page of cards as JSON; the page number is validated with zod; a WordPress failure answers 502 |
| Post | `app/i/blog/[slug]/page.tsx`, `components/article/articleStyles.ts`, `PostClosingCard.tsx` | All posts, the meta row, the Bebas title, the 1.91:1 cover with the WordPress alt text, then the body on the shared article card (720, 610 column), More posts and the closing card (Create your page or Open editor, Copy link). Missing post answers 404 (072 I10 to I17) |
| Sanitizer | `lib/sanitizeHtml.ts` | Server side allowlist: only listed tags and attributes are written out, values escaped again, script and similar dropped with their content, links to other sites open in a new tab with rel noopener, iframes only from YouTube and Vimeo (072 I11) |
| Entities | `lib/htmlEntities.ts`, `lib/blog.ts` | Titles, excerpts and categories decode HTML entities once, for cards, posts, metadata and the og title (072 I10). WordPress page counts come from X-WP-TotalPages |
| Loading | `app/i/blog/loading.tsx`, `app/i/blog/[slug]/loading.tsx` | Skeletons at the final size after 400ms, static under reduced motion. Client components, because the shared Skeleton keeps its delay in state (072 I16) |
| Network | `app/i/network/page.tsx`, `components/network/AddNetworkContent.tsx`, `NetworkCard.tsx` | Bebas ADD THE NETWORK in a 610 column. Libertas Testnet as the G3 lens card: Add to wallet, Switch to Libertas Testnet, or Your wallet is on Libertas Testnet, read without prompting (eth_chainId, eth_accounts) and kept current from wallet events. Declined and failed show inline. No wallet shows the notice with Get MetaMask. Manual settings with a copy button per row. Testnet notice. Developer networks closed by default with Revochain Devnet as a G1 clear card (073 I01 to I13) |
| Sitemap | `app/sitemap.ts` | Reads posts from the new `getBlogPosts` result |

## Instruction coverage

| Row | Ids | Where |
|---|---|---|
| 097 | I01 to I11 | `not-found.tsx` files, `NotFoundState.tsx`, `error.tsx`, `global-error.tsx`, `DestinationErrorCard.tsx` |
| 072 | I01 to I17 (I18 in 15b) | `app/i/blog/*`, `components/blog/*`, `articleStyles.ts`, `lib/blog.ts`, `lib/htmlEntities.ts`, `lib/sanitizeHtml.ts` |
| 073 | I01 to I13 | `app/i/network/page.tsx`, `components/network/*` |

## Parity

- [x] Unknown routes, missing posts and missing pools answer 404 with a way forward
- [x] Render errors keep a way back and never show raw error text
- [x] Blog: every post reachable (Load more), post body, cover, date and category
- [x] Blog: share by link
- [x] Network: add or switch with one button, manual settings, explorer link, developer network

## Notes

- Brand casing is Amped.Bio in every new string and title.
- The testnet notice is the house verbatim line.
- Next 16 with Turbopack refuses symlinked `node_modules` in this sandbox; the build was run with `next build --webpack`. The standard build in CI is unaffected.

## Waits

None. No file in #210, #225 or #277 is touched.

## How to test on staging

1. Open https://staging.amped.bio/no-such-page: PAGE NOT FOUND with the header, footer and three ways forward; the response is 404.
2. Open https://staging.amped.bio/i/blog: BLOG hero, the newest post as the featured card, the grid, Load more until the last page.
3. Open a post: All posts, meta, title, cover, body, More posts, the closing card. Copy link raises Link copied.
4. Open https://staging.amped.bio/i/blog/no-such-post and https://staging.amped.bio/i/pools/0x0000000000000000000000000000000000000000: the blog and pool variants.
5. Open https://staging.amped.bio/i/network with MetaMask: Add to wallet, then Your wallet is on Libertas Testnet. Close the request once: You closed the wallet request. Without a wallet: the notice and Get MetaMask.
6. At 390 every page fits with 13 gutters and no sideways scroll.

Screenshots are not included.
