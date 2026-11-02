# Amp Builder (AI auto builder): phase 1 spec

Status: spec for approval, 28 Oct 2026. Build Board: #14 "AI Amped bio builder".
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
| Counsel review | AB1 | Direct reading of pages whose terms bar automated access |

## 3. Entry points

| Where | Who sees it | Copy |
| --- | --- | --- |
| After email verification, before the editor opens | New accounts with no blocks | "Build my page for me" (primary) and "Start with a blank page" |
| Home | Accounts with fewer than 3 blocks, until dismissed | Card in the lens slot: "Bring your page from anywhere" |
| Page panel menu | Every creator | "Rebuild with Amp Builder" |
| `register?import=<service>&from=<url>` | Visitors from switching pages on the marketing site | Sign up, then the builder opens on step 2 with the URL filled |

Fan accounts (unpublished pages from Follow, #22) see it on the Make your page card.

## 4. The flow

Step names match the design boards (AB1 to AB9).

| Step | Board | Data collected | Can skip |
| --- | --- | --- | --- |
| Start | AB1 | Chosen paths | n/a |
| Bring my page | AB2, AB3 | `sources.page`: url, provider, method (read, paste, file), consent time | Yes |
| Add your socials | AB4 | `sources.handles`: platform and handle pairs; `sources.about`: up to 280 characters | Yes |
| Building | AB5 | none | No (cancel only) |
| Review your links | AB6 | Edits to `plan.links` | No |
| Look and bio | AB7 | Chosen theme option, chosen or edited bio | Yes (keeps current look and bio) |
| Preview and add | AB8 | Apply mode | No |
| Done | AB9 | none | n/a |

At least one source must hold something before Building starts. The flow survives a reload: state lives in the build session (section 6).

## 5. Gathering

### 5.1 Provider registry

`packages/constants/src/import/providers.ts`:

```ts
export type ImportMethod = "read" | "paste" | "file";
export type ImportProvider = {
  id: string;                  // "linktree", "beacons", "stan", "taplink", "tapbio", "bento", "generic"
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
| Bento | bento.me | file | Shut down; users hold a zip export |
| Tap Bio | tap.bio | paste | Shuts 31 Oct 2026 |
| Any other host | any | read, paste | Read only if robots.txt allows `AmpedBioImporter` and the host is not on the deny list |

The registry is data. Counsel can move a provider to `read` without a code change to the flow.

### 5.2 Read (one fetch, user started)

`services/import/fetchPage.ts`, shared with Block Review's link preview:

- Only after the consent tick: "This is my page. Read it once to copy my links."
- `https` only; DNS resolved and every resolved address checked against private, loopback, link local and cloud metadata ranges, before connect and after each redirect (max 3 redirects, same rules).
- User agent `AmpedBioImporter/1.0 (+https://amped.bio/importer)`. robots.txt fetched first and honoured for that agent and for `*`.
- 5 s timeout, 2 MB body cap, `text/html` only. One page per session. No following links to other pages.
- The raw HTML is parsed in memory and never stored.

Parser (new dependency: an HTML parser such as `node-html-parser`; the server has none today): anchors with `href`, their visible text and image, `og:title`, `og:description`, `og:image`, JSON-LD `sameAs`, and `<link rel="me">`. Navigation, footer and the provider's own links (sign up, report, privacy) are dropped by a per provider ignore list plus a rule: drop links to the page's own host.

### 5.3 Paste

The person opens their old page, selects all, copies, and pastes into the box (design AB3). The client reads the `text/html` clipboard flavour when present, which keeps every `href`, and falls back to `text/plain`. Plain text runs through a URL and handle extractor. On phones, where select all on a web page is awkward, the box also takes a typed or pasted list, one link per line.

Paste needs no fetch, so it works on every provider on day one.

### 5.4 File

Bento zip: unzip in the worker with size limits (20 MB zip, 200 files, 50 MB unpacked), read the JSON or HTML for links and copy, take the first image as the avatar candidate. The exact export layout is not verified; the parser is written against a real export before build (open question 1).

### 5.5 Handles

`packages/constants/src/import/handles.ts`: `toProfileUrl(platform, handle)` and `fromUrl(url)` for the 24 link platforms and the media platforms. Strips `@`, spaces and trailing slashes; rejects handles that fail each platform's pattern. YouTube handles are checked with the Data API `channels.list?forHandle=` (public, 1 quota unit) to get the channel title and avatar. No other platform is called in phase 1.

### 5.6 Enrichment

For `custom` links with no title, the link preview service reads `og:title` through the same guarded fetch, with the same robots rule. Links to Linktree, Beacons, Instagram, TikTok and X are never fetched; their titles come from the platform name.

## 6. Build session

```prisma
model BuildSession {
  id          Bytes     @id @db.Binary(16)        // UUIDv7
  userId      Int       @map("user_id")
  status      String    @db.VarChar(16)           // gathering | planning | review | applied | undone | expired | failed
  sources     Json                                // page, handles, about; no raw HTML
  plan        Json?                               // BuildPlan, section 7
  snapshot    Json?                               // page before apply: blocks, theme id, description, image ids
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
    avatar: z.object({ source: z.enum(["page", "youtube", "upload"]), url: z.string().url() }).optional(),
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
  looks: z.array(z.object({
    themeId: z.number(),             // an existing system theme
    overrides: themeConfigSchema.pick({ buttonColor: true, containerColor: true, fontColor: true, background: true }),
    reason: z.string().max(120),     // "Matches the teal in your photo"
  })).max(3),
  dropped: z.array(z.object({ url: z.string(), reason: z.enum(["unsafe_scheme", "provider_link", "blocked_host", "invalid"]) })),
});
```

The plan is validated with this schema, then every link with `linkConfigSchema` and every look with `themeConfigSchema`, before the review screen shows it. A plan that fails validation is never shown.

## 8. The AI step

### 8.1 Model

Recommended (AB2): Anthropic Claude through the API, called from `apps/server` only, with zero data retention and no training on inputs. The model is a config value (`BUILDER_MODEL`), so it can change without a release. Alternatives in AB2.

### 8.2 What the model does

The server does the deterministic work first: URL extraction, platform detection, dedupe, the safety rules in section 9, palette extraction. The model gets the cleaned list and does what rules cannot:

- names each link in the person's voice when the old page had no title, or tidies a title,
- puts links in order (socials first as icons, then buttons by likely importance, keeping the old page's order when there was one),
- marks media links that should become embeds (Spotify, YouTube, SoundCloud),
- writes two bio options from the old bio and the description,
- picks three looks: one system theme per option plus colour overrides from the palette.

One call, structured output against `buildPlanSchema`, temperature low. If the call fails or times out (20 s), the server returns a rules only plan: original titles, original order, no bio options, one look from the closest theme. The person can still finish.

### 8.3 What the model never gets

Email addresses, phone numbers, wallet addresses, the account email, or anything from another user. Text from the old page is passed as data inside a delimited block with an instruction that it may contain instructions to ignore.

### 8.4 Looks

`services/import/palette.ts` reads the avatar (or the old page's `og:image`) with `sharp` (new dependency in `apps/server`; none of the apps has an image library today), takes five dominant colours, and scores the system themes by distance. The model chooses among the top eight and sets button, container and font colour overrides. Every override is checked for 4.5:1 text contrast against its background; a failing pair is replaced by the theme's own colour. No free form CSS or generated images in phase 1 (AB6).

## 9. Safety rules (server, before the model)

| Rule | Result |
| --- | --- |
| Scheme not http, https, mailto or tel | Dropped, `unsafe_scheme` |
| Link to the provider's own site (sign up, report, privacy) | Dropped, `provider_link` |
| Host on the deny list (malware feeds, IP literals, private ranges) | Dropped, `blocked_host` |
| Known adult hosts (OnlyFans, Fansly and the #28 list) | Kept with `adult` warning; the 18+ rules on #28 apply when they ship |
| URL shorteners (bit.ly, t.co and others) | Kept with `shortener` warning; not expanded in phase 1 |
| Same destination twice | One kept, `duplicate` warning on the other |
| More than 60 links | First 60 kept; the review screen says how many were left out |

The review screen shows every dropped link and its reason in plain words (design AB6).

## 10. Applying

`builder.apply({ sessionId, mode, choices })`, one database transaction:

1. Save the snapshot: block rows, theme id, description, image ids.
2. `replace`: delete the page's blocks. `add`: keep them and append after the last block.
3. Create link and media blocks through the same validation as `blocks.addBlock`, in plan order. Social links become one icon row block when Block Review v2 ships; until then, link blocks with platform icons.
4. Set the description if a bio was chosen.
5. Create a user theme from the chosen look (system theme config plus overrides) and set it.
6. Avatar: if the person accepted a found avatar, the server fetches it through the guarded fetch, checks type and size with the same rules as upload (#3 fix), stores it through the existing upload path and sets it.
7. Set `appliedAt` and `expiresAt`.

Publishing: a new account's page publishes through the existing publish step (`services/pagePublish.ts`), so the handle checks and rate limits apply. An existing published page changes in place.

Undo: `builder.undo({ sessionId })` restores the snapshot in one transaction and marks the session `undone`. Available for 7 days from the editor toast and from Page panel, History.

## 11. API

| Procedure | Kind | Notes |
| --- | --- | --- |
| `builder.start` | private mutation | Creates a session; 5 a day per user |
| `builder.detectProvider({ url })` | private query | Provider and allowed methods; no fetch |
| `builder.addSource({ sessionId, source })` | private mutation | page (read, paste, file), handles, about. Read fetches here, 10 a day per user |
| `builder.uploadFile` | private mutation | Presigned upload for the zip, 20 MB |
| `builder.plan({ sessionId })` | private mutation | Runs gathering, rules, AI; returns the plan; progress over the existing subscription link |
| `builder.updatePlan({ sessionId, plan })` | private mutation | Review edits; validated again |
| `builder.apply({ sessionId, mode, choices })` | private mutation | Section 10 |
| `builder.undo({ sessionId })` | private mutation | Section 10 |
| `builder.history` | private query | Applied sessions in the last 7 days |

Flag: `BUILDER_ENABLED` (server), `VITE_BUILDER` (client). Off in production until the gates in section 2 pass.

## 12. Privacy

- Sent to the AI provider: link URLs and titles, the old page's bio text, the description the person typed, palette values. Not sent: account email, phone, wallet, other users' data.
- Stored: the build session for 7 days after apply, 24 hours if never applied. No raw HTML, no clipboard contents beyond the parsed links.
- Privacy notice gains a paragraph: what Amp Builder reads, that an AI provider processes it under a no training, no retention agreement, and how long the session is kept. The AI provider is added to the subprocessor list in `docs/legal/privacy-parameters.md`.

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
| B1 | `feat/builder-foundation` | Provider registry, handle tools, guarded fetch, parsers (read, paste, Bento zip), safety rules, `BuildSession` model and migration, tests on saved fixtures | D57 | 2.5 days |
| B2 | `feat/builder-plan` | Plan schema, AI call with fallback, palette and looks, cost tracking, `builder.*` procedures, rate limits | B1, D11 | 2 days |
| B3 | `feat/builder-ui` | Steps AB1 to AB9, entry points, undo toast, history | B2 | 3 days |
| B4 | `feat/builder-apply` | Apply and undo transactions, avatar import, publish path, admin card, analytics events | B2 | 1.5 days |
| B5 | docs | Privacy paragraph, subprocessor entry, counsel memo on AB1 | none | text |

## 16. Acceptance

1. A person who pastes a copied Linktree page gets every link with its title and order, and the Linktree sign up and report links are not among them.
2. No request is made to linktr.ee or beacons.ai by the server in phase 1.
3. A read import of an allowed host makes one request for robots.txt and one for the page, from `AmpedBioImporter`, and stores no HTML.
4. A URL that resolves to a private or metadata address is refused before connect and after a redirect.
5. A `javascript:` link in any source never reaches the plan; the review screen lists it as removed.
6. With the AI call forced to fail, the person still gets a plan and can apply it.
7. Replace then Undo restores the exact blocks, theme, bio and avatar.
8. Every colour pair in an applied look passes 4.5:1.
9. The sixth build in a day is refused with the rate limit state.
10. The AI request body contains no email, phone or wallet address (test on fixtures).
11. Typecheck, build and tests pass. Copy has no em or en dashes.

## 17. Open questions

| Question | Owner | Blocking |
| --- | --- | --- |
| A real Bento export zip to write the file parser against | Rob | B1 file path |
| Where is the page building MCP server Rob mentioned (repo, branch)? Phase 3 should reuse or replace it | Rob | Phase 3 |
| Counsel memo on reading competitor pages at the user's request (AB1) | Counsel | Read path for Linktree and Beacons |
| AI provider agreement with zero retention | Rob | B2 in production |
| Tap Bio closes 31 Oct. Ship a paste only "Bring your Tap Bio page" helper on the marketing site now? | Rob | No |
