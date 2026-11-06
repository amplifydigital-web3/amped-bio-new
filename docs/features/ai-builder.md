# Amp Builder (AI auto builder): phase 1 spec

Status: spec for approval, 28 Oct 2026. QA fixes 3 Nov 2026 (Screen Review rows 299 to 307). AB-Q27 and AB-Q31 decided by Rob, 3 Nov. Build Board: #14 "AI Amped bio builder".
Owner: Rob Frasca. Drafted by Claude.
Baseline: `main` at 1b498c9 (production) and `development` at a3ce333.
Overview: `docs/overviews/ai-builder.md`. Research: `docs/features/ai-builder-research.md`. Design: AI auto builder screens, https://claude.ai/artifact/ERXtBxw8fBU7vVkpjMLPSe.
Working name: Amp Builder.

## 1. Scope

Phase 1 is a guided builder inside the editor app (`apps/client`). It gathers links from three sources, asks an AI model for a build plan, shows the plan for review, and applies it to the page.

In: import from an existing link-in-bio page by read, paste or file; typed social handles; a short description; AI plan for links, bio and look; review; apply as add or replace; 7 day undo.

Out: account connections by OAuth (phase 2), MCP write tools (phase 3), chat editing, image generation, paid blocks, store items.

## 2. Gates before launch

| Gate | Card | Why |
| --- | --- | --- |
| Link URL scheme fix | D57 (Step 1 priority 1) | The builder writes many links at once. `javascript:` must be refused on every save path first |
| Rate limiting | D11 (priority 7), `docs/features/rate-limiting.md` | The builder calls a paid AI model and fetches outside pages |
| Reserved handles | D2 (priority 5), `docs/features/reserved-handles.md` | The builder can suggest a handle from an old page |
| Counsel review | AB1 | Direct reading of pages whose terms bar automated access; each named link in bio host stays paste only until reviewed |
| Privacy notice update | AB-X4, AB-Q14 | `privacy.md` section 8 and 10 changes, `CONSENT_POLICY_VERSION` bump and a signed zero retention agreement before `BUILDER_ENABLED` turns on (section 12) |

## 3. Entry points

| Where | Who sees it | Copy |
| --- | --- | --- |
| After email verification, before the editor opens (AB0a) | New accounts with no blocks | "Build my page for me" (primary) and "Start with a blank page", with the AI disclosure line and a Privacy link |
| Home, inside the setup checklist (AB0b) | Accounts with fewer than 3 blocks while the checklist shows | The "Add your first block" row offers "Build my page for me". No separate card: the checklist is the one G3 lens on Home (PRISM.md, Setup checklist 015), so a second lens would break one rim per region |
| Page panel menu (AB0c) | Every creator | "Rebuild with Amp Builder", next to "History" |
| `register?import=<service>&from=<url>` | Visitors from switching pages on the marketing site | Sign up, then the builder opens on step 2 with the URL filled. Build step: `apps/landingpage/src/components/auth/RegisterForm.tsx` reads only `handle`, `email` and `error` today; it must also read `import` and `from` and carry them through verification |

Route (AB-X5): the client serves `/:panel?` and `/:handle/edit/:panel?` only. Add `build` to `EDITOR_PANELS` in `apps/client/src/types/editor.ts` and keep the step in the query string: `/build?step=page|socials|building|review|look|preview|done`. Deeper paths such as `/build/page` fall to `PublicSiteRedirect` and are not used.

AB1 primary is "Build my page for me" (decision AB9). The three paths are a multi select: checkbox tiles with `aria-pressed`, a 24 Prism Checkbox, Bring my page preselected. With none selected the primary is disabled with the helper "Pick at least one way to start." Describe me alone opens AB4 with About first (AB4c).

Fan accounts (unpublished pages from Follow, #22) see it on the Make your page card.

## 4. The flow

Step names match the design boards (AB0 to AB9). Steps AB2 to AB8 show the Prism `StepBar` (6 steps). Back buttons are 44 icon buttons.

| Step | Board | Data collected | Can skip |
| --- | --- | --- | --- |
| Start | AB1 | Chosen paths | n/a |
| Bring my page | AB2, AB3 | `sources.page`: url, provider, method (read, paste), `consentAt` (ISO time of the consent tick, required for read) | Yes |
| Add your socials | AB4 | `sources.handles`: platform and handle pairs; `sources.about`: up to 280 characters | Yes |
| Building | AB5 | none | No (cancel only) |
| Review your links | AB6 | Edits to `plan.links` | No |
| Look and bio | AB7 | Chosen theme option, chosen or edited bio | Yes (keeps current look and bio) |
| Preview and add | AB8 | Apply mode | No |
| Done | AB9 | none | n/a |

At least one source must hold something before Building starts. Until then Build my page is disabled with the helper "Add a page, a handle or a few words first." The flow survives a reload: state lives in the build session (section 6).

## 5. Gathering

### 5.1 Provider registry

`packages/constants/src/import/providers.ts`:

```ts
export type ImportMethod = "read" | "paste" | "file";
export type ImportProvider = {
  id: string;                  // "linktree", "beacons", "stan", "taplink", "carrd", "komi", "lnkbio", "milkshake", "later", "bento", "self"
  name: string;                // "Linktree"
  hosts: string[];             // ["linktr.ee"]
  methods: ImportMethod[];     // allowed methods, in order of preference
  fileFormat?: "bento-zip";
  note?: string;               // shown under the field
};
```

Starting values (AB1 recommended):

| Provider | Hosts | Methods | Reason |
| --- | --- | --- | --- |
| Linktree | linktr.ee | paste | Terms 6 and 13 bar automated extraction; robots.txt disallows unnamed agents |
| Beacons | beacons.ai | paste | Terms 2.3(e), 2.3(f) |
| Stan | stan.store | paste | Competitor; terms not yet reviewed by counsel |
| Taplink | taplink.cc, taplink.at | paste | Competitor; terms not yet reviewed by counsel |
| Carrd | carrd.co (subdomains) | paste | Competitor host; terms not yet reviewed by counsel |
| Komi | komi.io | paste | Competitor; terms not yet reviewed by counsel |
| Lnk.Bio | lnk.bio | paste | Competitor; terms not yet reviewed by counsel |
| Milkshake | msha.ke | paste | Competitor; terms not yet reviewed by counsel |
| Later | linkin.bio | paste | Competitor; terms not yet reviewed by counsel |
| Bento | bento.me | paste (Type links) | Shut down; pages no longer load. The zip export path is out of the first build (5.4) |
| Self hosted domain | any host not above and not a known link in bio or website builder host | read, paste | Read only if robots.txt allows `AmpedBioImporter` and the host is not on the deny list |

Tap Bio closed on 31 Oct 2026 and is removed from the registry and the AB1 list (AB-Q5). A new link in bio host is added as `paste` by default; robots.txt alone never clears a host's terms (AB-Q2).

The registry is data. Counsel can move a provider to `read` without a code change to the flow, one provider at a time after a terms review.

### 5.2 Read (one fetch, user started)

`services/import/fetchPage.ts` (new; there is no link preview service in the server today to share it with):

- Only after the consent tick, a 24 Prism Checkbox labelled with the spec sentence: "This is my page. Read it once to copy my links." The helper under it: "We keep the links we find for up to 7 days so you can undo. Our AI provider helps name them. Only bring a page you own." plus a Privacy link to `/privacy`. The consent time is stored as `sources.page.consentAt`. Never say "nothing else is kept" (AB-Q7).
- Before the tick, `detectProvider` makes no fetch, so the status line for a self hosted domain is "Your own site. We will try to read it once." It never promises a read before robots.txt is checked in `addSource` (AB-Q8).
- `https` only; DNS resolved and every resolved address checked against private, loopback, link local and cloud metadata ranges, before connect and after each redirect (max 3 redirects, same rules).
- User agent `AmpedBioImporter/1.0 (+https://amped.bio/importer)`. robots.txt fetched first and honoured for that agent and for `*`.
- 5 s timeout, 2 MB body cap, `text/html` only. One page per session. No following links to other pages.
- The raw HTML is parsed in memory and never stored.

Parser (new dependency: an HTML parser such as `node-html-parser`; the server has none today): anchors with `href`, their visible text and image, `og:title`, `og:description`, `og:image`, JSON-LD `sameAs`, and `<link rel="me">`. Navigation, footer and the provider's own links (sign up, report, privacy) are dropped by a per provider ignore list plus a rule: drop links to a registry provider's own host. On a self hosted domain, links to its own host are kept (they are the creator's pages).

Read failure states (boards AB2b, AB2c and the AB2 table). Each names the next step:

| Case | Copy | Next step |
| --- | --- | --- |
| Consent unticked | Tick the box to let us read your page. | Read my page disabled |
| robots.txt refuses | This site asks apps not to read it. Paste your page instead. | Paste my page |
| Timeout at 5 s | Your page took too long to answer. | Paste my page, Try again |
| Body over 2 MB | Your page is too large to read. | Paste my page |
| Not `text/html` | This link is not a web page. | Type links |
| Private or metadata address | We cannot read this address. | Type links |
| More than 3 redirects | This link redirects too many times. | Paste my page |
| No links found | We read your page but found no links. | Paste my page, Type links |
| 10 reads a day used | You have read 10 pages today. Reading opens again at {reset time}. You can paste your page now. | Paste my page, Type links |
| Offline | You are offline. Your link is saved. | Try again on reconnect |

### 5.3 Paste

The person opens their old page, selects all, copies, and pastes into the box (design AB3). The client reads the `text/html` clipboard flavour when present, which keeps every `href`, and falls back to `text/plain`. Plain text runs through a URL and handle extractor. On phones, where select all on a web page is awkward, the box also takes a typed or pasted list, one link per line.

The Paste my page and Type links switch is the Prism `Tabs` control at 44 with `role=tab` and `aria-selected` (AB-Q10). States (AB3b, AB3c): empty box with Use these links disabled and "Paste your page first."; a paste or clipboard with no links, or a clipboard with no HTML or text, shows "No links found in what you pasted. Type them instead." with a Type links button; the Type links view shows "{n} links found." More than 60 links follows section 9.

Paste needs no fetch, so it works on every provider on day one.

### 5.4 File

Out of the first build (AB-Q9). The export layout is not verified and the parser is blocked on open question 1, so B1 to B4 ship without the file path and AB2 shows no export link. Bento users use Type links. When a real export arrives, follow up PR B6 adds: unzip in the worker with size limits (20 MB zip, 200 files, 50 MB unpacked), the upload sheet, progress, and errors for each limit and for an unknown layout.

### 5.5 Handles

`packages/constants/src/import/handles.ts`: `toProfileUrl(platform, handle)` and `fromUrl(url)` for the 24 link platforms and the media platforms. Move the existing URL and handle helpers from `apps/client/src/utils/platforms.ts` (lines 276 to 301) into constants rather than rewrite them (AB-X6). Strips `@`, spaces and trailing slashes; rejects handles that fail each platform's pattern.

A bare handle cannot pick its platform (`@mayalin_` fits several), so each handle row has a platform `Select` (44 rows) before the well. Pasting a URL prefills the Select through `fromUrl` (AB-Q12). The existing client detector in `blockInfo.ts` works from URLs only.

YouTube handles are looked up with the Data API `channels.list?forHandle=` (public, 1 quota unit) to get the channel title and avatar. The lookup proves the handle exists, not that it belongs to the person: the pill is neutral "Found on YouTube" in todo colours. Never use "Checked" or "Verified" anywhere in the builder (AB-Q13). No other platform is called in phase 1.

Handle states (AB4b, AB4c): a handle that fails the pattern shows the platform rule under the row ("TikTok handles use letters, numbers, dots and underscores."); YouTube not found shows "No YouTube channel found for this handle. Check it or remove it."; every row has a 44 Remove button, and removing a prefilled handle shows Undo; About shows a counter out of 280; invalid handles are left out of the build.

### 5.6 Enrichment

For `custom` links with no title, the server reads `og:title` through the same guarded fetch (`fetchPage`), with the same robots rule, and only on the read path; no link preview service exists to reuse. Links to Linktree, Beacons, Instagram, TikTok and X are never fetched; their titles come from the platform name.

## 6. Build session

```prisma
model BuildSession {
  id          Bytes     @id @db.Binary(16)        // UUIDv7
  userId      Int       @map("user_id")
  status      String    @db.VarChar(16)           // gathering | planning | review | applied | undone | expired | failed
  sources     Json                                // page, handles, about; no raw HTML
  plan        Json?                               // BuildPlan, section 7
  snapshot    Json?                               // page before apply: block rows with ids, full theme config, description, image file id
  applyMode   String?   @map("apply_mode") @db.VarChar(8)   // add | replace
  model       String?   @db.VarChar(64)           // AI model id used
  costMicros  Int?      @map("cost_micros")       // AI cost, for the admin report
  createdAt   DateTime  @default(now()) @map("created_at")
  appliedAt   DateTime? @map("applied_at")
  expiresAt   DateTime  @map("expires_at")        // 7 days after apply, 24 h if never applied
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, createdAt])
  @@map("build_sessions")
}
```

A sweeper deletes expired sessions. Undo works until `expiresAt`.

## 7. The build plan

One format for the app now and MCP tools later. `packages/constants/src/build/plan.ts`:

```ts
export const buildPlanSchema = z.object({
  version: z.literal(1),
  profile: z.object({
    name: z.string().max(60).optional(),
    bioOptions: z.array(z.string().max(160)).max(2),
    avatar: z.object({ source: z.enum(["youtube", "upload", "page"]), url: z.string().url() }).optional(), // "page" only on the read path
  }),
  links: z.array(z.object({
    url: z.string(),                 // checked by the shared URL rule (D57): http, https, mailto, tel
    platform: z.enum(allowedPlatforms),
    label: z.string().min(1).max(80),
    kind: z.enum(["social", "button", "media"]),
    mediaPlatform: z.enum(mediaPlataforms).optional(),
    keep: z.boolean().default(true),
    source: z.enum(["page", "paste", "file", "handle", "about"]),
    warning: z.enum(["adult", "duplicate", "shortener", "unreachable"]).optional(),
  })).max(60),
  leftOut: z.number().int().min(0).default(0), // links past the first 60
  looks: z.array(z.object({
    themeId: z.number(),             // an existing system theme (user_id null); tiles are titled with theme.name
    overrides: themeConfigSchema.pick({ buttonColor: true, containerColor: true, fontColor: true, background: true }),
    reason: z.string().max(120),     // "Teal from your photo"; only reasons the palette can produce
  })).max(3),
  dropped: z.array(z.object({ url: z.string(), reason: z.enum(["unsafe_scheme", "provider_link", "blocked_host", "invalid"]) })),
});
```

The plan is validated with this schema, then every link with `linkConfigSchema` and every look with `themeConfigSchema`, before the review screen shows it. A plan that fails validation is never shown.

## 8. The AI step

### 8.1 Model

Recommended (AB2): Anthropic Claude through the API, called from `apps/server` only, with zero data retention and no training on inputs. Anthropic is already wired: `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` in `apps/server/src/env.ts` (lines 214 to 216), used by `services/analytics/insights.ts`. Reuse that client. Add `BUILDER_MODEL` (defaults to `ANTHROPIC_MODEL`) so the builder can change model without a release. The key is shared with analytics summaries; the zero retention agreement must cover both before the flag turns on. Alternatives in AB2.

AI disclosure (AB-Q1). The person is told before any text leaves Amped:

- AB0a and AB1, under the lede: "An AI model writes link names, bios and looks from what you give us. You check everything first." with a Privacy link to `/privacy`.
- AB2 consent helper: "Our AI provider helps name them."
- AB4 helper under About: "Sent to our AI provider to write your bio."
- AB7: the bio options carry the label "Suggested by AI".

### 8.2 What the model does

The server does the deterministic work first: URL extraction, platform detection, dedupe, the safety rules in section 9, palette extraction. The model gets the cleaned list and does what rules cannot:

- names each link in the person's voice when the old page had no title, or tidies a title,
- puts links in order (socials first, then buttons by likely importance, keeping the old page's order when there was one),
- marks media links that should become embeds, only for platforms in `mediaPlataforms` (`packages/constants/src/platforms.ts`): Spotify and YouTube. SoundCloud is not a media platform and stays a link,
- writes two bio options from the old bio and the description,
- picks three looks: one system theme per option plus colour overrides from the palette.

One call, structured output against `buildPlanSchema`, temperature low. If the call fails or times out (20 s), or the daily budget cap is reached, the server returns a rules only plan: original titles, original order, no bio options, one look from the closest theme. The person can still finish.

Building states (AB5b, AB5c and the AB5 table): the rules only plan says "We could not write a bio this time. Your links are ready." The sixth build in a day says "You have built 5 pages today. You can build again at {reset time}. Your links and handles are saved." Plan failed validation: "Something went wrong building your plan. Your sources are saved." with Try again. Cancel: "Stopped. Your links and handles are saved." and returns to AB4. Offline: "You are offline. We will carry on when you reconnect." Reload mid build resumes from the build session. Pending steps use a neutral 21 dot, not a checkbox (AB-Q16, AB-Q18).

### 8.3 What the model never gets

Email addresses, phone numbers, wallet addresses, the account email, or anything from another user. Text from the old page is passed as data inside a delimited block with an instruction that it may contain instructions to ignore.

### 8.4 Looks

`services/import/palette.ts` reads the avatar with `sharp`, takes five dominant colours, and scores the system themes by distance. The model chooses among the top eight and sets button, container and font colour overrides. Every override is checked for 4.5:1 text contrast against its background; a failing pair is replaced by the theme's own colour. No free form CSS or generated images in phase 1 (AB6).

`sharp` already ships in `apps/media-processor` (`container/package.json`); run the palette there or add the same version to `apps/server` (AB-X6).

Image sources (AB-Q25). The palette reads only the YouTube channel avatar, an image the person uploads, or the old page's `og:image` on the read path. It never reads page colours. Images are never fetched from paste only providers: an avatar URL found in a Linktree or Beacons paste sits on that provider's image host, and fetching it breaks acceptance 2. Look reasons must be ones the palette can produce ("Teal from your photo", "Warm tones from your photo", "Quiet and dark"), never "your old page's colour". AB7 shows a photo row as an OptionTile radiogroup: Use this photo, Upload, Keep current. Look tiles are titled with `theme.name` from the system theme row (AB-Q26). Looks, bios and the photo use `kit/OptionTile.tsx` (AB-Q23). AB7 has "Keep my current look and bio" under the primary; AB7b is the rules only fallback (one look, no bio options, Write a bio); Edit the bio is a bottom sheet with a 160 counter (AB-Q24).

## 9. Safety rules (server, before the model)

| Rule | Result |
| --- | --- |
| Scheme not http, https, mailto or tel | Dropped, `unsafe_scheme` |
| Link to the provider's own site (sign up, report, privacy) | Dropped, `provider_link` |
| Host on the deny list (malware feeds, IP literals, private ranges) | Dropped, `blocked_host` |
| Known adult hosts (OnlyFans, Fansly and the #28 list) | Kept with `adult` warning; the 18+ rules on #28 apply when they ship |
| URL shorteners (bit.ly, t.co and others) | Kept with `shortener` warning; not expanded in phase 1 |
| Same destination twice | Both stay in the plan. The first is kept; the other has `keep: false` and the `duplicate` warning, shown on AB6 as "Same link as {title}. Not kept." The building step says "Marked {n} duplicate to check.", never "removed" (AB-Q17) |
| More than 60 links | First 60 kept; `leftOut` holds the count; AB6 says "{n} links found. The first 60 are here. {n} were left out." |
| Shortener display | AB6 shows the short address itself (for example `bit.ly/3mLinPT`) as the second line with "Short link. We kept it as is." (AB-Q19) |
| Adult warning copy | "Adult site. Amped's 18+ rules apply to this link." |
| Unreachable warning copy | "We could not open this link. Check it before you add it." |
| Nothing kept | AB6 empty plan card: "No links to add yet" with Back to sources; Next is not shown |

The review screen shows every dropped link and its reason in plain words: the notice gives the count and a "See removed links" button that opens a sheet listing each URL with its reason (AB6c, AB-Q21).

Review controls (AB-Q20): every row, socials and buttons, has a keep Checkbox (24 box in a 44 hit area) and a 44 More menu with Rename, Move up, Move down and Remove. Drag stays as an extra, never the only way to reorder (WCAG 2.2, 2.5.7). Until the Social icons block ships (Block Review v2 wave 2, rows 235 and 236; no such type in `packages/constants/src/blocks.ts`), the socials group is labelled "Socials, as link buttons with icons" and AB8 and AB9 show them as link buttons with platform icons (AB-X3).

## 10. Applying

`builder.apply({ sessionId, mode, choices })`, one database transaction:

1. Save the snapshot: block rows with their ids, the full theme config (not only the theme id, because `applyTheme` with themeId 0 updates the user's one theme row in place, `apps/server/src/trpc/theme.ts` lines 280 to 299), the description, and the image file id.
2. `replace` (AB-Q27, decided): swaps only free link and media blocks and the look. It keeps every paid, gated, content and group block (gated blocks, content blocks, Telegram group blocks, pool and follow blocks) in place with the same ids, so unlocks, analytics events and click counts stay attached. Kept blocks stay first, then the new links. AB8d and the Replace confirm (AB8e) name the kept blocks: "Kept: {n} paid or gated blocks." with each title. `add`: keep them and append after the last block. New blocks are created with `order` set after the current maximum, in plan order. Do not reuse the `order: 0` write in `blocks.addBlock` (`apps/server/src/trpc/blocks.ts`, line 201), which would put them first (AB-Q32).
3. Create link and media blocks through the same validation as `blocks.addBlock` (validation only, not its order), in plan order, skipping links with `keep: false`. Social links become one icon row block when Block Review v2 ships; until then, link blocks with platform icons.
4. Set the description if a bio was chosen.
5. Create a user theme from the chosen look (system theme config plus overrides) and set it.
6. Avatar: if the person chose Use this photo on AB7 (a YouTube avatar, or `og:image` on the read path only), the server fetches it through the guarded fetch, checks type and size with the same rules as upload (#3 fix), stores it through the existing upload path and sets it.
7. Set `appliedAt` and `expiresAt`.

Publishing: a new account's page publishes through the existing publish step (`services/pagePublish.ts`), so the handle checks and rate limits apply. An existing published page changes in place.

AB8 (AB-Q28, AB-Q29, AB-Q30): the mode is an OptionTile radiogroup, Add to my page (default) and Replace my page ("Your current page is kept for 7 days so you can undo."). The primary is the lg 55 indigo button and names the mode ("Add 13 links to my page" or "Replace my page"); the value deep commit button is for money only. The preview shows the page as it will be: with Add, current blocks first, then the new links, with the full chosen bio. A new account with no blocks (AB8b) gets no mode choice; it shows the page address with a handle suggested from the old page, checked against reserved handles (gate D2), and the primary is "Publish my page". Applying locks the controls ("Adding your links"). Apply failed rolls back the one transaction: "We could not add your links. Nothing on your page changed. Your plan is saved." with Try again.

Undo: `builder.undo({ sessionId })` restores the snapshot in one transaction and marks the session `undone`. Available for 7 days from the editor toast and from Page panel, History. Undo restores the snapshot exactly: block rows with their original ids (so analytics reattach), the full theme config, description and image file id (AB-Q31, decided). If the page changed after apply, Undo first opens a Dialog that names each change that will be lost (block added or removed, bio edited, theme changed, photo changed) with "Undo and lose these" as a destructive action (AB9d). With no later edits, the plain confirm (AB9c) shows.

AB9 (AB-Q33, AB-Q34, AB-Q35): drawn in the Page shell (top bar with bell, phone dock). The success toast reads "{n} links added. You can undo for 7 days." after Add ("Your page is rebuilt. You can undo for 7 days." after Replace). It stays 8 seconds, like the checklist undo, or until dismissed with its 44 close button; this overrides the 5 second default for success toasts. History (AB9b) lists `builder.history` rows: what changed, when, and "Undo until {date}" or "Undo window ended". Undo states: confirm Dialog ("Undo Amp Builder?"), undoing (controls locked), undone toast ("Done. Your page is back to how it was."), window ended, and failed ("We could not undo. Nothing changed. Try again.", error toast that stays until acted on).

## 11. API

| Procedure | Kind | Notes |
| --- | --- | --- |
| `builder.start` | private mutation | Creates a session; 5 a day per user; the limit error carries the reset time |
| `builder.detectProvider({ url })` | private query | Provider and allowed methods; no fetch |
| `builder.addSource({ sessionId, source })` | private mutation | page (read, paste), handles, about. Read fetches here, 10 a day per user; the limit error carries the reset time |
| `builder.uploadFile` | private mutation | Presigned upload for the zip, 20 MB. Follow up B6, not in the first build |
| `builder.plan({ sessionId })` | private mutation | Runs gathering, rules, AI; returns the plan; progress over the existing subscription link |
| `builder.updatePlan({ sessionId, plan })` | private mutation | Review edits; validated again |
| `builder.apply({ sessionId, mode, choices })` | private mutation | Section 10 |
| `builder.undo({ sessionId })` | private mutation | Section 10 |
| `builder.history` | private query | Applied sessions in the last 7 days |

Flag: `BUILDER_ENABLED` (server), `VITE_BUILDER` (client). Off in production until the gates in section 2 pass.

Env (AB-Q14): add `YOUTUBE_API_KEY` to `apps/server/src/env.ts` (none today). Quota: `channels.list` costs 1 unit; the default 10,000 units a day covers about 10,000 lookups. Cache lookups per handle for 24 hours. With no key set, the lookup is skipped and no pill shows.

## 12. Privacy

- Sent to the AI provider: link URLs and titles, the old page's bio text, the description the person typed, palette values. Not sent: account email, phone, wallet, other users' data.
- Stored: the build session for 7 days after apply, 24 hours if never applied. No raw HTML, no clipboard contents beyond the parsed links.
- Stored also: the consent time for a read.
- The policy recipient table is `apps/landingpage/src/content/legal/privacy.md` section 8. `docs/legal/privacy-parameters.md` has no subprocessor list (AB-X4). Build step B5, after counsel approves the text:
  1. Expand the Anthropic row in `privacy.md` section 8 and the text at line 82 to cover Amp Builder (draft below).
  2. Add a YouTube API Services row to section 8 that says Amped uses YouTube API Services and links the YouTube Terms of Service and the Google Privacy Policy (AB-Q14).
  3. Add `build_sessions` to section 10 and to the retention line in `privacy-parameters.md` (line 26).
  4. Bump `CONSENT_POLICY_VERSION` in `packages/constants/src/analytics.ts` (line 212).
  5. Confirm the zero retention agreement before `BUILDER_ENABLED` turns on.

### For counsel (drafts, not final)

- Section 8, Anthropic row, What they receive: "Page totals, top sources, devices, visitor counts and up to 10 link names; for Amp Builder, link addresses and titles, your old page's bio text and the description you type." Why: "Write creator summaries; suggest link names, bios and looks in Amp Builder."
- Section 4, new paragraph: "Amp Builder. If you ask Amp Builder to build your page, we read the page you bring (once, after you confirm it is yours) or the links you paste or type. We send link addresses and titles, your old bio and the words you type to Anthropic, our AI provider, to suggest link names, a bio and a look. Anthropic does not train on this data or keep it. We keep the build for 7 days after you add it so you can undo, or 24 hours if you never add it."
- Section 8, new row: "Google (YouTube API Services) | A YouTube handle you type | Find your channel name and photo. Amped.Bio uses YouTube API Services. See the YouTube Terms of Service (https://www.youtube.com/t/terms) and the Google Privacy Policy (https://policies.google.com/privacy)."
- Section 10, new row: "Amp Builder builds (`build_sessions`): 7 days after you add them, 24 hours if never added."


## 13. Cost and monitoring

- One AI call per plan. Target under 8,000 input tokens and 2,000 output tokens. Cost per session is stored and shown in admin, with a daily total and a cap (`BUILDER_DAILY_BUDGET_USD`); past the cap the builder uses the rules only plan.
- Admin card: sessions started, planned, applied, undone, average links per page, top providers, failures by reason.
- Analytics events: `builder_started`, `builder_source_added` (provider, method), `builder_planned`, `builder_applied` (mode), `builder_undone`.

## 14. Decisions for Rob (recommended first)

**AB1. Import route for Linktree and Beacons.** Recommended: paste and file only at launch; direct reading only for hosts whose robots.txt allows our named agent and whose terms do not bar it; counsel reviews before any provider moves to read. Why: Linktree is 80% of the market and its terms and robots.txt bar automated reading; paste works today with no exposure. Alternative: read every provider once, at the user's request, on the theory that the user owns the content (Meta v. Bright Data). Smoother, but carries terms and interference exposure.

**AB2. AI provider.** Recommended: Anthropic Claude through the API, server side, zero retention, model set by config. Why: structured output, strong instruction following on untrusted page text, a no training default. Alternatives: OpenAI through the API (comparable; second vendor to manage); no AI, rules only (cheapest; no titles, bios or looks).

**AB3. Apply mode for existing pages.** Recommended: ask, with Add to my page as the default and Replace my page as the option, plus 7 day Undo. Why: no one loses blocks by surprise. Alternative: always replace with Undo. Simpler, riskier.

**AB4. Social connections in phase 1.** Recommended: typed handles plus the public YouTube lookup; OAuth in phase 2. Why: Instagram personal accounts cannot be read through Meta's API and X bars scraping; OAuth adds app reviews with Meta and TikTok. Alternative: ship TikTok and YouTube OAuth in phase 1 for verified avatars.

**AB5. Where it appears.** Recommended: right after sign up for new accounts with no blocks, on Home for pages with fewer than 3 blocks, and in the Page menu for everyone. Why: the first minute decides whether a new creator stays. Alternative: Page menu only.

**AB6. How looks are made.** Recommended: three options built on system themes with colour overrides from the photo, contrast checked. Why: every result is a theme Amped already renders and tests. Alternative: fully generated themes (fonts, backgrounds). More distinctive, harder to keep readable.

**AB7. Limits and price.** Recommended: free for everyone in phase 1, 5 builds a day per account, a daily budget cap. Why: this is an acquisition tool. Alternative: free once, then paid rebuilds.

**AB8. Relationship to MCP.** Recommended: one build plan service; phase 3 MCP tools `build_page_plan` and `apply_page_plan` call it and return the same review link. Why: one set of safety rules and one format. Alternative: separate MCP tools that write blocks directly. Faster to ship, two paths to keep safe. Note: the MCP server on `main` has read tools only; the page building MCP work Rob mentioned is not in the repos this session can reach (open question 2).

**AB9. Name.** Recommended: Amp Builder in the product, "Build my page for me" on buttons. Alternative: fold it into Amp Bot, named on the marketing site as coming soon.

## 15. Build

| PR | Branch | Scope | Depends | Size |
| --- | --- | --- | --- | --- |
| B1 | `feat/builder-foundation` | Provider registry (named hosts paste only), handle tools moved to constants, guarded fetch, parsers (read, paste), safety rules, `BuildSession` model and migration, tests on saved fixtures | D57 | 2.5 days |
| B2 | `feat/builder-plan` | Plan schema, AI call with fallback, palette and looks, cost tracking, `builder.*` procedures, rate limits | B1, D11 | 2 days |
| B3 | `feat/builder-ui` | Steps AB0 to AB9 with every state board, `build` panel route, StepBar, OptionTile choices, AI disclosure, entry points, undo toast (8 s), History | B2 | 3.5 days |
| B4 | `feat/builder-apply` | Apply and undo transactions, avatar import, publish path, admin card, analytics events | B2 | 1.5 days |
| B5 | docs | `privacy.md` sections 4, 8 and 10 per section 12, `privacy-parameters.md` retention line, `CONSENT_POLICY_VERSION` bump, counsel memo on AB1 and each named host | none | text |
| B6 | `feat/builder-file` | Bento export upload sheet, limits and errors, after open question 1 | B1 | 1 day |

## 16. Acceptance

1. A person who pastes a copied Linktree page gets every link with its title and order, and the Linktree sign up and report links are not among them.
2. No request is made by the server to any registry host marked paste (Linktree, Beacons, Stan, Taplink, Carrd, Komi, Lnk.Bio, Milkshake, Later, Bento) in phase 1, including image hosts for avatars found in a paste.
3. A read import of an allowed host makes one request for robots.txt and one for the page, from `AmpedBioImporter`, and stores no HTML.
4. A URL that resolves to a private or metadata address is refused before connect and after a redirect.
5. A `javascript:` link in any source never reaches the plan; the review screen lists it as removed.
6. With the AI call forced to fail, the person still gets a plan and can apply it.
7. Replace then Undo restores the exact blocks (same ids), theme, bio and avatar, including for a creator with a custom theme (themeId 0): the custom theme config is identical after Undo.
7a. Replace on a page with a gated block, a content block and a Telegram group block keeps all three with the same ids, unlocks and analytics, and the confirm names them.
7b. Undo after a later edit opens the Dialog that lists that edit before anything is restored.
8. Every colour pair in an applied look passes 4.5:1.
9. The sixth build in a day is refused with the rate limit state.
10. The AI request body contains no email, phone or wallet address (test on fixtures).
11. A read import stores `consentAt`, and the read is refused without it.
12. AB0a, AB1, AB2, AB4 and AB7 show the AI disclosure copy in section 8.1; no builder screen says "Checked" or "Verified".
13. Add places new blocks after the last existing block, in plan order.
14. A duplicate link reaches AB6 with `keep: false` and the duplicate warning; no link disappears without a row in AB6 or the removed list.
15. Every AB6 row can be kept, moved and removed without drag.
16. The undo toast stays 8 seconds or until dismissed.
17. Typecheck, build and tests pass. Copy has no em or en dashes.

## 17. Open questions

| Question | Owner | Blocking |
| --- | --- | --- |
| A real Bento export zip to write the file parser against | Rob | B6 file path |
| Where is the page building MCP server Rob mentioned (repo, branch)? Phase 3 should reuse or replace it | Rob | Phase 3 |
| Counsel memo on reading competitor pages at the user's request (AB1), host by host | Counsel | Read path for every named link in bio host |
| AI provider agreement with zero retention | Rob | B2 in production |
