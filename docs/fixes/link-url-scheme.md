# Link URLs that run script (Build Board D57)

P0. Live in production today.

## 1. Problem

A creator could store a link that runs script on amped.bio when a visitor taps it.

- `linkConfigSchema` and `mediaConfigSchema` checked `url` with `z.string().url()`. Zod accepts `javascript:alert(1)` as a URL.
- `blocks.editBlock` took `config: z.any()`, so it saved any config with no check at all.
- `sanitizeBlockConfig` returned link configs unchanged, on save and on public reads.
- The public page (`ProfileView.tsx`, through `CreatorButton`) and the editor preview (`Preview.tsx`) render `href={block.config.url}`.

The editor preview renders the same href. Today every preview runs with `isEditing`, and its click capture stops navigation, so the link cannot run there. It is one change away from running script in app.amped.bio with the creator signed in, so the fix guards it too.

## 2. Fix

**One rule, in `@repo/constants` (`safeHref.ts`).**

| Function         | Allows                                                                              |
| ---------------- | ----------------------------------------------------------------------------------- |
| `isSafeHref`     | `http:`, `https:` (with a host), `mailto:`, `tel:`                                  |
| `isSafeWebUrl`   | `http:`, `https:` (with a host)                                                     |
| `safeHref`       | the value when `isSafeHref`, else `undefined`                                       |
| `safeRenderHref` | `safeHref`, plus site paths such as `/i/pools/0x...`. Refuses `//host` and `/\host` |

Whitespace and control characters are removed before the scheme check, because browsers ignore them (`java\tscript:`). Relative, protocol relative and scheme less values are refused for stored links.

**Schemas.**

- `linkConfigSchema.url` uses `safeLinkUrlSchema`: a valid URL that passes `isSafeHref`, or empty.
- `mediaConfigSchema.url` uses `safeWebUrlSchema`: http or https, or empty.
- Empty is accepted on purpose. A block with an empty URL needs a link (`blockNeed`) and renders nowhere. It lets a page save while it holds a block that the scan neutralized. `editBlocks` validates every block on each autosave, so a rejected block would stop the creator from saving anything.

**Save paths.** `editBlock` now takes `blockSchema`, the same typed check `editBlocks` and `addBlock` use. No client calls `editBlock` today.

**Public reads.** `sanitizeBlockConfig` empties an unsafe link or media URL, and the channel link of a legacy Telegram text block that is not https. `handle.getHandle` already runs it on every public read, so stored rows are safe the moment the server deploys.

**Renderers.**

- `CreatorButton` (`packages/ui`) renders an unsafe href as a plain button with no link. It covers link blocks on the public page and in the v2 preview, and the legacy Telegram block on the public page.
- `Preview.tsx` (editor, v1 path) uses `safeHref`.
- `apps/client/src/components/blocks/TelegramBlock.tsx` now applies the https check the public copy already had.

**Stored rows.** `pnpm run --filter server blocks:unsafe-urls` lists every link or media block with an unsafe URL and every legacy Telegram text block without an https link. `--apply` empties that field and hides the block. The log shows the first 40 characters of each value only.

## 3. Not changed

- Text block HTML links already pass through `sanitizeRichHtml`, which keeps http, https and mailto only.
- JSON-LD `sameAs` already keeps http and https only.
- The theme background URL (`theme.ts`) feeds image and video `src`, which do not run script. Left as is.
- OAuth `client_uri` and `redirect_uris` use `z.string().url()` but only admins set them. Worth the same check in a follow up.

## 4. Gustavo: what to do

1. Review and merge into `development`. No migration, no new env vars, no new dependency.
2. On staging, run `pnpm run --filter server blocks:unsafe-urls` and keep the output. If it lists rows, run it again with `--apply`.
3. Staging check:
   - In the editor, add a Link block with `javascript:alert(1)`. The editor refuses it.
   - Send `blocks.addBlock`, `blocks.editBlocks` and `blocks.editBlock` with that URL from the console. Each is refused.
   - A normal link, an email link and a page with a pool block still work.
4. After the production release, run the scan on production the same way.

## 5. Tests

- `packages/constants/test/safe-href.test.ts` (34): payloads including mixed case, leading whitespace, tab and newline inside the scheme, control characters, data, vbscript, file, blob and protocol relative values; the schemas; addBlock and editBlocks schema paths.
- `apps/server/src/__tests__/link-url-safety.test.ts` (34): every save path refuses each payload; safe links still save; a page with a neutralized block saves; public reads empty unsafe URLs; the scan finds and neutralizes them.
- `packages/ui/test/creator-button-href.test.tsx` (5): no anchor for unsafe values; safe links and site paths keep theirs.
