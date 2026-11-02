# G0: minimum stake compared in wei, follower rule uses the email grace

Branch `fix/stake-min-units`. PR G0 of the gating engine v2 plan (`docs/features/access-gating-engine.md`, sections 2.2 and 6). Build Board #48. Drafted by Claude for Rob Frasca, reviewer Gustavo, 2026-10-24.

**Server only. No migration. No UI change.** Merge before Fan messages and Telegram group admission are turned on for creators.

## 1. What was wrong

Fan messages (#310, #313, merged 22 Oct) run their own rule evaluator in `apps/server/src/services/telegram/rules.ts` until the gating engine replaces it.

1. **P0. Minimum stake unit mismatch.** A creator types a whole number of tREVO for "Fans with a minimum stake" (`stakeMin`, for example `500`). Stakes are mirrored in wei (`StakedPool.stakeAmount`). The SQL compared the two directly, so a 500 tREVO rule admitted a fan with 500 wei, which is any staker. The tests used the same unit on both sides, so they passed.
2. **P1. Follower definition drift.** The evaluator counted a follower only with `email_verified = true`. Fan Graph (`trpc/follow.ts`) counts a follower who is verified or still inside the 30 day email grace (Rob, 10 Oct). A new fan who followed was counted in the creator's total and then refused the follower door.

## 2. What changes

| File | Change |
| --- | --- |
| `packages/constants/src/amount.ts` | `TREVO_DECIMALS = 18` and `wholeTokensToWei(whole)`: a whole number of tokens to a wei string with BigInt, `null` for anything else |
| `apps/server/src/services/telegram/rules.ts` | STAKE_MIN converts the stored whole tREVO to wei before calling `stakerIds`. `stakerIds` takes `minWei` and says so. The follower filter is `{ block: "no", AND: [trustedEmailWhere(now)] }`, the same filter as `trpc/follow.ts` |
| `__tests__/stake-units.test.ts` (new) | Conversion, precision past the float range, refusals |
| `__tests__/telegram-rules.test.ts` | The SQL receives `500000000000000000000` for a 500 tREVO rule; the follower filter carries the grace. The old test that pinned `email_verified: true` is replaced |
| `__tests__/messaging-rules.test.ts` | Stakes in wei against a whole tREVO minimum: 99 tREVO refused, 100 tREVO admitted; 100 wei and 1 wei under the minimum refused (the defect); an unverified follower inside the grace admitted, past it refused |

## 3. Decisions in this PR

1. **Store whole tREVO, convert at comparison.** The gating spec suggested migrating stored values to wei. Keeping the stored value as the creator typed it needs no data migration, no change to the settings screen (which shows the stored value back), and no change to `setSettings`. The engine (G1) stores wei in its own `AccessRule`, and G2 maps `stakeMin` through `wholeTokensToWei` when it moves messaging onto the engine.
2. **No admin minimum.** The 24 Oct note on #48 dropped the admin minimum stake setting (Rob: gate on the creator's amount; the deployed contracts stay unchanged). POOL_MEMBER stays "any stake above zero".
3. **Out of scope, noted.** `trpc/user.ts` (Explore person cards) still counts public follower totals with `email_verified: true` only. It does not gate access. It should move to `trustedEmailWhere` so the number matches Fan Graph; a separate small fix.

## 4. Checks

Run in a sandbox without the Prisma engine download, so the generated client is missing:

- `npx vitest run` for the 8 messaging and Telegram suites: 73 tests pass.
- Full server unit run: 53 of 54 files, 712 tests pass. The one failing file, `better-auth-prisma-ids.test.ts`, fails the same way on `development` here: it imports the generated Prisma client.
- `@repo/constants` builds. ESLint clean on the changed files. Prettier clean.

Please run locally before merge: `pnpm run typecheck`, `pnpm --filter @repo/server run test:unit`, `pnpm run format:check`.

## 5. Staging QA

1. As a creator with a pool, set Fan messages to "Fans with a minimum stake", 100.
2. A fan with 1 tREVO staked opens Message: refused with the stake line. Before this PR the fan was admitted.
3. The same fan stakes up to 100 tREVO: admitted.
4. Set the rule to Followers. A fan who signed up today, email not verified, follows the creator: admitted. Before this PR the fan was refused.
