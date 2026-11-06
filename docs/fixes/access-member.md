# G5: The `member` kind goes live in the gating engine

Branch `feat/access-member` into `development`. Gating spec PR plan G5 (`docs/features/access-gating-engine.md` sections 3.3, 3.4 and 3.7). Build Board #21 (Access gating engine) and the memberships card. Drafted by Claude for Rob Frasca, reviewer Gustavo, 2026-11-05.

**Merge order.** Built on G4 (#486) with MB-1 (#475) merged in. Merge #486 and #475 first. Git then shows only the G5 changes.

**No migration.** The rule reads `MembershipPlan` and `Membership` rows that MB-1 created. No new env values and no new flags. Gating stays behind the `accessGating` site flag.

## 1. What ships

| Area                | Change                                                                                                                                                                                                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract            | `LIVE_ACCESS_RULE_KINDS` gains `member`. `ACCESS_RULE_PARAMS.member` is `{ planId }` as 32 hex characters, because plans moved to UUID keys (content spec 3.18). The `join_membership` hint carries `planId` as a hex string. `accessRuleInputSchema` accepts `{ kind: "member", params: { planId } }`.                               |
| Reader              | `services/access/verifiers/membership.ts` `membershipReader`. `plan(id)` reads the plan's owner, status and price every 30 days. `membership(userId, creatorUserId)` reads the fan's newest membership with the creator and applies MB-1's `accessUntil`. The answers are active, grace, ended or none. It only reads.                |
| Registration        | `registerMembershipReader` in the engine (spec 3.7). `services/access/index.ts` registers the reader. With no reader registered, `member` refuses with `kind_unavailable` (default deny).                                                                                                                                             |
| Decisions           | Active, or canceled inside the paid period: allowed with `ok`. Past due inside the 7 day grace: allowed with `membership_past_due`. Membership ended: refused with `membership_ended` and a Join hint (Rejoin). Never joined: refused with `not_member` and a Join hint that carries the plan id and the monthly price ("4.99 USDC"). |
| Seller precondition | A new join needs an active plan and a seller who passes the seller check. A paused or draft plan refuses new fans with hint `unavailable`. A lapsed seller check refuses new fans with `kind_unavailable`. Members keep access in both cases. `open` runs the seller check fresh.                                                     |
| Caching             | Member decisions are never cached, like stake and paid decisions. The renewal job and the payments indexer change the row, and the reader reads it on every check.                                                                                                                                                                    |
| Ownership           | Only the rule owner's own plan counts. Creating a member rule refuses another creator's plan or a missing plan ("Set up your membership first."). A draft or paused plan is allowed, so items can be gated before the plan takes members.                                                                                             |
| Audiences           | `eligibleUserIds` supports `member`. It lists fans with access now: active, canceled inside the period, or past due inside the grace. It excludes blocked accounts and never counts another creator's plan.                                                                                                                           |
| Combinators         | Any of these and All of these accept a member leaf.                                                                                                                                                                                                                                                                                   |

## 2. Not in this PR

1. **The rule picker.** `AccessPicker.tsx` still shows Members as Later, the same as Paid after G4. The editor needs a plan reference. That comes with MB-2 (#477) and the G3 picker deltas.
2. **The landing unlock card.** `gating.tsx` shows the unavailable card for `buy` and `join_membership` hints. The Join sheet is MB-2. The Library already maps `not_member` and `membership_ended` to Join (MB-3, #488).
3. **`pastDue` on the hint.** The hint sends `pastDue: false` because a fan in grace already passes. The past due banner belongs to the membership card (MB-2).

## 3. Checks run

- Server, client and landing typecheck: clean.
- Server unit suite: all pass except the OAuth live tests, which need network.
- New tests:
  - `access-engine.test.ts`: 15 member tests. They cover default deny, sign in, ownership, the Join hint and price, active, grace, ended, a paused or draft plan, the seller precondition, the fresh seller check on open, no caching, a blocked member, All of these, `eligibleUserIds` and the contract.
  - `access-membership-reader.test.ts`: 6 reader tests.
  - `access-rules.test.ts`: 2 member rule tests.
- `content-gating.test.ts` now uses `reward_points` as the kind that is not live yet, because `member` is live.

## 4. Staging check for Gustavo

1. Merge order as above. Turn on `accessGating` and `memberships` on staging.
2. As a verified seller, create and activate a plan. Create a saved Members rule with `access.rules.create` and attach it to a text block.
3. As a fan, open the bio. The block is locked with `not_member` and the Join hint shows the plan price.
4. Join. The next check returns `ok`.
5. Cancel. Access stays to the period end, then refuses with `membership_ended`.
6. Let a renewal fail. The fan passes with `membership_past_due` for 7 days, then is refused.
7. Pause the plan. A second fan gets `not_member` with no action. The first member keeps access.
