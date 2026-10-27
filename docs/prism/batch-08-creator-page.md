# Batch 8: Public creator page (Screen Review 039, 040, 041)

Each batch PR documents itself in its own file under `docs/prism/`, so open PRs never conflict on `docs/PRISM.md`.

Stacked on #248 (public header, footer and room). Merge #248 first, then retarget this PR to `development`.

The creator keeps every color, font, background and effect they chose. Amped redraws only the frame and the rendering discipline around it (section 17).

## 039 Creator page frame

| Piece | File | Rule |
|---|---|---|
| Column | `components/ProfileView.tsx` | One centered column, 610 max. Padding top 55 (34 at 390), 21 gutters at 390. Bottom padding 89 plus the safe area, plus the consent card height and 13 while the card shows |
| Background | same | Fixed layer under the column: color, gradient, image or video. The video pauses while the tab is hidden |
| Header | same | Photo 144 (89 at 390). Name h1 26/33 700, three lines then clamp, the only element with the hero effect. RevoName row with a 44 copy button that announces Copied (role status). Bio 16/26 |
| Blocks | same | 34 below the bio, 13 apart. Only renderable blocks (`isRenderable`). Each block sits in its own error boundary, so one broken embed renders nothing instead of taking the page down |
| Footer | same | Made with Amped.Bio in the creator's text color, Pause motion 13 to its right when motion loops. Second line: Privacy choices (visitors only, once consent is read) and Privacy Policy |
| Frame capsule | same | One G1 clear capsule, 21 from the bottom. View pool for visitors when the creator has a pool and no pool block on the page. Edit page for the signed in owner. Hides on scroll down, returns on scroll up. Not rendered when empty |
| Consent card | `components/TrackingConsentBanner.tsx` | Prism G1 clear card, max 508, r21, a region (not a dialog). Reject all and Accept all at equal weight, Choose and Save my choices as ghost buttons. Visit counting is locked on. Sits under the capsule, 13 apart. Owners never see it |
| Not found | `app/[handle]/not-found.tsx`, `components/HandleNotFoundCard.tsx` | HTTP 404, noindex. Room, public header and footer. "No page at @handle yet", "This name is available on Amped.Bio.", Claim @handle (`/register?handle=`), Go to Amped.Bio |
| Canonical | `lib/seo.ts` | `https://amped.bio/<handle>` with no @, per Rob's call |
| Server | `apps/server/src/trpc/handle.ts` | `getHandle` returns `hasCreatorPool` and `creatorPoolAddress` from the creator's newest listed pool (wallet owned, has an address, not hidden). It was hard coded to false |

## 040 Blocks as rendered

| Piece | File | Rule |
|---|---|---|
| Shared parts | `components/blocks/frame.tsx` | `CreatorButton` (min 55, 21 icon, centered label, two lines then truncate), `EmbedFrame` (r13, final size before load, skeleton until load, titled iframe), `SelfSizingFrame` (377 reserve), `Caption` (16/26, 8 below), creator focus outline, font clamped to 16 to 20 |
| Media | Spotify, YouTube, Vimeo, Instagram, Facebook, TikTok, X, NFT, Uniswap, Substack | No label rows. Spotify 152, or 352 for playlist, album, show and artist. YouTube via youtube-nocookie at 16:9. Invalid input renders nothing; visitors never see editor errors |
| X | `blocks/TwitterBlock.tsx` | Theme follows the container's luminance. Nothing renders when the post is invalid or missing |
| Not real yet | `blocks/MediaBlock.tsx`, `blocks/text/TextBlock.tsx` | Token price and email collect render nothing on the public page (D07) |
| Text, Telegram, Team | `blocks/text/TextBlock.tsx`, `TelegramBlock.tsx`, `TeamBlock.tsx` | Creator colors only, no white panels. Team renders nothing without members |
| Referral | `blocks/ReferralBlock.tsx` | "Create your own Amped.Bio page" as a creator button. Nothing renders when the reward is 0 or missing |
| Pool | `blocks/CreatorPoolBlock.tsx` | Creator button surface, art 55, name, @handle. Total staked (tREVO), Fans, Creator share ("X% of pool rewards" or Not set). Network Reward Rate with its helper, or the 100% creator line in its place (046 D1). One View pool to `/i/pools/<address>` in the same tab, then the testnet line. Staking runs on the pool page (D12) |

## 041 Particles and hero effects

| Piece | File | Rule |
|---|---|---|
| Engine | `components/ParticlesBackground.tsx`, `ParticlesProvider.tsx` | The engine loads on demand after first paint, only on pages with particles. Pages without particles never download it |
| Behavior | same | 60 fps cap, paused when the tab is hidden or the canvas is off screen, no spawn on click, hover only for fine pointers, still under reduced motion or Pause motion. The canvas never takes taps. Matrix is retired and renders nothing |
| Pause motion | `components/ProfileView.tsx` | Shown when the page has particles or a looping name effect (Gradient, Wave, Rainbow, Glitch). aria-pressed, Pause motion and Play motion labels. The choice is remembered in this browser (`amped.motion.paused`) |
| Name effects | `lib/styles.ts` | Every effect maps to a class that exists. Fade in and Slide up run once over 610ms. Typewriter renders as Fade in. Paused shows the settled name |
| Button effects | same | Play once per hover or keyboard focus over 233ms, move only transform, opacity or shadow, return on leave. Removed under reduced motion |

## Fixed on the way

- `packages/ui/src/prism/tailwind-preset.js`: the landing app's CSS minifier dropped the standard `backdrop-filter` when it came before the prefixed one. Chrome ignores the prefixed property, so every Prism glass surface on the landing app had no blur in Chrome. The prefixed property now comes first. Both apps now ship both properties.

## Removed

- `components/blocks/BlockErrorFallback.tsx`. The block error boundary now renders nothing for visitors and logs the block context.
- The white Stake button inside the pool block.

## Not in this PR

- The shared renderer between the editor preview and the public page (D10). The client `Preview.tsx` keeps its own renderer for now, so the preview Fix chip (040 I01, I14) and the referral duplicate (I17) wait for that change.
- Server side favicon fetch on save (040 I06). Custom links still use the Google favicon service.
