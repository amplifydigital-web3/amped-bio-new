# FL-2: Fan Library API (saved items, creator visits, library router)

Branch `feat/library-api` into `development`. Fan Library plan FL-2 (Build Board #26), spec `docs/features/fan-library.md` sections 3.3, 3.4 and 3.6. Drafted by Claude for Rob Frasca, reviewer Gustavo, 2026-11-03.

**One migration, two new tables only, applied by hand.** Every procedure is behind the `fanLibrary` site flag (default off), so nothing changes for anyone until an admin turns it on. No client screen in this PR: the Library pages are FL-3 and FL-4.

## 1. Migration

`packages/database/prisma/migrations/20261103230000_fan_library_saved_items/migration.sql`

- `saved_items`: `id` UUID v7 `BINARY(16)`, `user_id`, `content_item_id`, `created_at`. One row per fan and item. Cascades with the user and the item.
- `library_creator_visits`: `id` UUID v7 `BINARY(16)`, `user_id`, `creator_id`, `last_visited_at`, unique on user and creator. Cascades with both users.
- New tables only. No existing table changes. The SQL is byte for byte what `prisma migrate diff` generates from the schema change.
- The spec names the visit column `bioId`. There is no Bio table; a creator is a user, so the column is `creator_id`.

Run on staging, then production:

```bash
pnpm --filter @repo/database exec prisma migrate deploy --schema=./prisma/schema.prisma
```

Rollback, if ever needed (both tables are empty until the flag is on):

```sql
DROP TABLE saved_items;
DROP TABLE library_creator_visits;
DELETE FROM _prisma_migrations WHERE migration_name = '20261103230000_fan_library_saved_items';
```

## 2. What the API does

`apps/server/src/trpc/library.ts` (router `library`). All private, scoped to the session account, behind `fanLibrary` (`PRECONDITION_FAILED` when off), 120 reads and 60 saves a minute per account.

| Procedure                         | Input                                             | Output                                                                                  |
| --------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `library.continue`                | `{ handle? }`                                     | up to 12 unfinished items (30 seconds to 95 percent), last played first                 |
| `library.newest`                  | `{ cursor?, type?, source?, where?, deviceIds? }` | newest items from followed creators                                                     |
| `library.creators`                | `{ cursor?, q? }`                                 | one row per followed creator: owner, accent, connection, new count, past due            |
| `library.creator`                 | `{ handle }`                                      | section header: connected, owner, theme summary, status line, counts. Records the visit |
| `library.creatorItems`            | `{ handle, seg, cursor? }`                        | Yours, newest first. Shop is empty until FL-6                                           |
| `library.search`                  | `{ q, scope, handle?, deviceIds?, cursor? }`      | title and description matches, grouped by creator                                       |
| `library.saved`, `save`, `unsave` | `{ publicId }`                                    | saved items, access rechecked; save is idempotent                                       |

Shapes are in `packages/constants/src/library.ts` (`LibraryItem`, `LibraryCreatorRow`, `LibraryCreatorHeader`, `LibraryShopItem`, `LibrarySearchGroup`, `LibraryPage`). Every item carries `owner` and `accessSource`; no output carries an email, a wallet or a numeric user id.

Following is `follow.listFollowing`, which Fan Graph already ships. FL-2 reuses it; no new procedure.

## 3. Who may see an item

`apps/server/src/services/library/access.ts`, one function, `libraryAccess`.

- The Library lists only items the fan can open now, and names how.
- Until gating opens content items (C8, then FL-6), the only way to open someone else's item is that it is public. So every listed item reads `public`, and `source` filters for `member`, `pool`, `follower` or `purchased` return an empty list.
- Listing and opening use the same rule as `content.getReadUrl`, so nothing the Library lists refuses to play.
- A creator's own items are not in their fan Library; they manage them in Content.
- FL-6 replaces `libraryAccess` with the engine's `checkBatch`. The callers and the response shape stay.

The spec says an item visible to followers is listed when the fan follows. No content item can carry a followers rule until C8 ships the rule picker, so there is nothing of that kind to list yet.

## 4. Choices made in the build

1. **Connected means followed** in FL-2. Memberships, purchases and pool stakes join in FL-6 and FL-7. `connection.poolFan` is already filled from `batchPoolFanCreatorIds`.
2. **New count** = public items published since the fan last opened the section, or since they followed when they never did.
3. **Yours is newest first.** Content items have no collections yet; grouping by course or collection comes with bundles (C9, C10).
4. **Search** reads titles and descriptions. Chapter titles are JSON and are not searched yet.
5. **Saved items the fan lost access to are hidden, not deleted**, so they come back if access returns.
6. **Theme summary** (`libraryThemeSummary` in constants) keeps colors, fonts and a still background (color or gradient). Image, video and shader scenes give `null`, and FL-4 uses the theme's base color. The accent on mixed screens is the creator's button color.
7. **Followed creator cap**: list reads look at a fan's 500 newest follows.

## 5. Also in this PR

- `fanLibrary` in `FEATURE_FLAGS` and the registry test change, identical to FL-1 (#451), so the two PRs merge in either order.
- `cardsForItems` in `services/content/publicView.ts`: cards for items already read, with the same scan check as every public list.

## 6. Checks run

- Typecheck: server, client and landing pass.
- Builds: server, client and landing pass.
- Tests:
  - Server unit: 1,228 of 1,229, including 18 new in `library.test.ts`. The one failure is `fan-graph.test.ts` "is refused when tampered", which passed on six reruns. It flips the token signature's first character to `x`, so it fails whenever the signature already starts with `x`, about 1 run in 64. That predates this branch.
  - `@repo/constants`: 214 of 214, including 6 new in `library.test.ts`.
- `oxlint` on the new files: clean.

## 7. Staging check for Gustavo

1. Run the migration.
2. Turn on `fanLibrary` in admin, Feature flags.
3. Sign in as a fan who follows a creator with public content.
   - `library.newest` lists that creator's items, each with `owner` and `accessSource: "public"`.
   - `library.creators` lists the creator with a new count.
4. `library.creator({ handle })` returns `connected: true`. Call `library.creators` again: the new count is 0.
5. `library.save` an item, then `library.saved` shows it. Save again: still one row. `library.unsave` removes it.
6. Play an item past 30 seconds on its public page. `library.continue` lists it.
7. Turn `fanLibrary` off: every library call answers "The Library is not available yet."
