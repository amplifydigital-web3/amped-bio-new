# Content system and creator store: design QA

Drafted by Claude for Rob Frasca, 2026-10-12. Spec: docs/features/content-system.md (section 3.1). Overview: docs/overviews/content-system.md.

This QA checks the existing Prism 2.2 boards against the rewritten spec and lists the boards still to draw. No new board is drawn yet. Boards follow Rob's answers to decisions 10 to 25.

## 1. Existing boards

Content system page (https://claude.ai/artifact/5huPNodPAbY59cqFytSyUf). All five passed the Prism 2.2 gate on 2 Oct.

| Board | Still valid | Changes the new spec needs | Severity |
|---|---|---|---|
| cs1 Content library | Grid, meter, one status per card, filters | Tab row Library, Store, Live above the grid. Status names: Followers, Members, Pool fans, Paid 3 USDC, Members or Paid. A Sell in store item in the card menu | Medium |
| cs2 Upload | Drop zone, limits, rights notice, stages | None to the layout. Video progress comes from TUS, other files from R2 parts; the stages read the same | None |
| cs3 Item editor | Fields, autosave, live preview, Publish | Two tiles become the gating picker (Everyone, Followers, Members, Pool fans, Fans with a minimum stake, Paid, Any of). Add the 18+ label, chapters, captions file and Sell in store. Disclosures show only for stake rules | High |
| cs4 Content block | Creator theme, inline play, locked cover | Paid items show the amount on the card. Members items show Members | Low |
| cs5 Locked item page | Preview player, unlock card | The action follows the rule: Follow, Join (opens mb3), Buy (opens mb6 or st9), Go to the pool. The testnet line and stake disclosures show only for stake rules | High |

Boards reused from the memberships page (mb series, design QA claude/amped-memberships-design-qa-2026-10-08.md):

| Board | Use here | Change |
|---|---|---|
| mb2, mb10 Membership card | Store Membership section and the `membership` block | Add Includes N items |
| mb3 Join sheet | Join from the store and the product page | None |
| mb4 Rule builder | Same picker as cs3 | None |
| mb5 Locked cards | Store and feed locked states | None |
| mb6 Pay sheet | Buy for a single item | Extended by st9 for bundles and promoters |
| mb1 Plan card | Moves to Content, Store, Membership (st4) | Redrawn in st4 |

## 2. Boards to draw

| Board | Surface | Proposed Screen Review row | Gate notes |
|---|---|---|---|
| cs6 | Creator feed page, phone and desktop, creator theme | 151 | No Prism color on creator content. Locked cards carry no media reference |
| cs7 | Item page after purchase, phone | 152 | Download per item when allowed. Part of {bundle} link |
| cs8 | Library and upload empty, loading and error states | 153 | Error strings name the fix |
| st1 | Store tab, Storefront settings, desktop | 154 | Checklist states for Store live. Phone preview in the creator theme |
| st2 | Store tab, Products list, desktop | 155 | Amounts read 3 USDC. Sort handle 44 target |
| st3 | Product editor, desktop | 156 | Items picker, access chips, Also in membership disabled without a plan, with the reason |
| st4 | Store tab, Membership, desktop | 157 | mb1 plan card in the Store tab. Recurring terms per #25 3.9 |
| st5 | Store tab, Sales, desktop | 158 | Name and handle only, never email or wallet. Refund in the row menu |
| st6 | Storefront, phone, creator theme | 159 | Section order, Powered by Amped.Bio, refund line, no staking words |
| st7 | Storefront, desktop, creator theme | 160 | 3 column grid, membership card in the right column |
| st8 | Product page, phone, creator theme | 161 | Buy and Join side by side when both apply. Owned state |
| st9 | Pay sheet for a bundle with a promoter, phone, creator theme | 162 | Paying @handle, Referred by @promoter, fee line, required checkbox, Pay 12 USDC, wallet note, Add USDC link when short |
| st10 | Store block on a bio, phone | 163 | Up to 6 products, Visit store |

## 3. Checks every new board must pass

1. Tokens: Prism 2.2 tokens in the editor. Creator theme only on public surfaces and creator payment sheets (Prism 2.2 section 17).
2. Contrast measured against the worst pixel: 4.5:1 body, 3:1 large text.
3. Targets at least 44.
4. Copy: no earn, yield, return, income, invest, price, stake, staking, pool or tREVO on store and checkout surfaces. Amounts as 3 USDC. No em or en dashes.
5. Trust: Paying @handle and the fee line on every creator payment sheet. No Buy USDC inside any sheet. The Add USDC link goes to Wallet.
6. 18+: no 18+ item or product on any board that a signed out viewer sees.
7. Reduced motion and keyboard reachability.

## 4. Findings in the spec found during this QA

1. The 2 Oct boards drew "Members only" for stake rules. The vocabulary decision (10 Oct) makes Members mean paid membership. cs1, cs3 and cs5 must say Pool fans or Fans with a minimum stake for stake rules. Fixed in the spec (3.1).
2. cs5 sends every locked fan to the pool. With Paid and Members rules, the action must follow the rule. Fixed in the spec (3.1, 3.9).
3. No board covers a store that is not live yet. st1 must show the checklist (spec decision 22).
