# Content system and creator store: design QA

Drafted by Claude for Rob Frasca, 2026-10-12. Spec: docs/features/content-system.md (section 3.1). Overview: docs/overviews/content-system.md.

All 18 boards are drawn in Prism 2.2 on 12 Oct. Decisions 10 to 25 read as accepted on the Build Board card (recommended answers). The CSAM vendor stays to discuss. This record replaces the proposed row numbers in spec 3.1.

## 1. Design pages

- Content system boards, cs1 to cs8: https://claude.ai/artifact/5huPNodPAbY59cqFytSyUf
- Creator Store boards, st1 to st10: https://claude.ai/artifact/TFx1jSi932KWNxij8StSYj
- Screen Review rows: https://claude.ai/artifact/M65NZVk7gpb2BRpR19mnQF

## 2. Boards and Screen Review rows

| Board | Surface | Screen Review row | Status |
|---|---|---|---|
| cs1 | Content library with Library, Store and Live tabs, desktop | 151 | Redrawn. Rule names per the 10 Oct vocabulary. Gated and For sale filters |
| cs2 | Upload dialog, R2 parts and Stream TUS, resumable | 152 | Redrawn |
| cs3 | Item editor with Who can open this and Any of (Members, Paid) | 153 | Redrawn. 18+ label, chapters, captions, Sell in store, Preview as |
| cs4 | Content block on a bio, phone, creator theme | 154 | Redrawn. Paid amounts on cards. Follow capsule in the creator theme |
| cs5 | Locked item page, two states, creator theme | 155 | Redrawn. Join and Buy for Members or Paid; Go to the pool with disclosures for stake rules |
| cs6 | Creator feed page, desktop and phone | 127 (existing) | New |
| cs7 | Item page after purchase, phone | 129 (existing) | New |
| cs8 | Empty, loading, offline and failed states | 156 | New |
| st1 | Store tab, Storefront settings and go live checklist | 157 | New |
| st2 | Store tab, Products list | 158 | New |
| st3 | Product editor, bundle | 159 | New |
| st4 | Store tab, Membership plan editor | 160 | New (moves the mb1 plan card) |
| st5 | Store tab, Sales with the refund menu | 161 | New |
| st6 | Storefront, phone | 162 | New |
| st7 | Storefront, desktop | 163 | New |
| st8 | Product page, not owned and owned | 164 | New |
| st9 | Creator branded pay sheet: Amount, Review with promoter, short balance | 165 | New (replaces the Prism colored mb6 for creator payments) |
| st10 | Store block on a bio | 166 | New |

## 3. Gate

Every board is rendered from source at 1.5x (desktop) or 2x (phone) and checked by script:

1. Contrast: every text run measured against the pixels behind it, 4.5:1 body and 3:1 large. 18 of 18 pass.
2. Targets: every control at least 44, tabs 43 inside the 55 container. 18 of 18 pass.
3. Words: no earn, yield, return, profit, invest, income, gains or price; on store and checkout surfaces also no stake, staking, pool or tREVO. The fixed stake disclosure on cs5 is exempt. 18 of 18 pass.
4. No em or en dashes. 18 of 18 pass.
5. Tokens: Prism 2.2 tokens in the editor; creator surfaces use only the Graphite creator palette and sample art.
6. Trust: every creator payment sheet shows Paying @handle, Includes the Amped.Bio fee of 5%, the required checkbox, the commit button with verb and amount, the wallet note and Powered by Amped.Bio. No sheet contains Buy USDC; a short balance links to Wallet.
7. 18+: no 18+ item appears on any board a signed out visitor sees.

## 4. Findings fixed during QA

1. The editor top bar lost its spacer, so help and avatar sat beside the tabs. Restored on every editor board.
2. Caption file name typo on cs3.
3. An awkward refund line on cs5 ("Buying is yours to keep"), now "Bought items are yours to keep."
4. Two sample items contradicted the store catalog (a free mix shown as Followers on cs4, a bundled preset shown at 12 USDC on cs6). Fixed.
5. The mb2 follow capsule used Prism indigo on a creator surface. Redrawn in the creator theme.
6. The 2 Oct boards drew Members only for stake rules. The 10 Oct vocabulary makes Members mean paid membership. cs1, cs3 and cs5 now say Pool fans or Fans with a minimum stake.

## 5. Open

- CSAM vendor (decision 11) stays to discuss with Rob.
- mb6 on the memberships page is still the 8 Oct Prism colored sheet with Buy USDC inside. st9 is the correct pattern for creator payments; mb6 should be retired or redrawn on #25.
