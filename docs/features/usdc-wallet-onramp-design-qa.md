# USDC wallet and Buy USDC: design QA (boards w1 to w7, o1 to o7)

Date: 2026-10-10. Method: the Screen Review element-eval gate (tokens, glass, rim, contrast, targets, trust, content) run as a script on each board's HTML and rendered PNG, plus a visual review of every render. Spec: docs/features/usdc-wallet-onramp.md. Design pages: USDC in the wallet (https://claude.ai/artifact/91ieQ5NJYCy2eBMW5mP7PG) and Buy USDC through Coinbase (https://claude.ai/artifact/7A3CCALBwihA6oZd1hRbDV). These boards replace mb7 and mb8 on the memberships design page for rows 137 and 138.

## Result

14 of 14 pass the gate. 4 findings, all fixed before publication. One note recorded, no new Prism exception.

| Check | Result |
| --- | --- |
| Tokens | Every color literal is a Prism 2.2 token, the Coinbase mark blue (an unaltered third party mark, allowed under 010 D1) or the Apple Pay button black (Apple's mark rule). |
| Glass | G1 navigate for rail, top bar, chip and tabs; G1 clear for the tREVO tile, Tokens and Activity rows and the Coinbase account option; G2 wells and slabs; G3 lens on the one focused object per region (USDC tile, Apple Pay option); G3 value panel for Receive, Send, Fund and Buy USDC; calm variant on Send Review, the Coinbase frame, Waiting, Refused and Not completed. |
| Rim | At most one per region. w1 and w7 (USDC tile), o2 (Apple Pay option). None on any calm or commit state. The USDC tile loses its rim whenever a panel is open, so the commitment field holds the only focus. |
| Contrast | Every text run is a token on the measured room or on white glass: ink 17.9:1, ink-2 11.1:1 (4.57:1 minimum under beams), warning text 6.35:1 on the solid notice, white on indigo 6.85:1, white on value-deep 10.1:1, white on the Apple Pay black 21:1. |
| Targets | Every control 44 or more, tabs 43 inside the 55 container, checkbox 24, dock items 44 (finding 4). |
| Trust | The testnet line verbatim on every tREVO surface (w1, w5, w7 tiles and rows) and on no USDC surface. The one commit button (w4 Send 3 USDC) is labeled with the verb and amount and followed by the wallet note verbatim. Review send, Choose how to pay, Try again and Back to the item are next step buttons. Nothing in Buy USDC is a commit, because nothing moves on Amped.Bio. |
| Content | No earn, yield, return, profit, APY, APR, invest or income. No stake, staking, pool or tREVO on any USDC or Buy USDC surface. No credit card in US copy; the Coinbase account option reads debit card or bank in the US, debit or credit card in most other countries. No em or en dashes. |

## Findings and fixes

1. **w1, w7, o2.** The spectral halo rendered inside its host and washed out the tile content. Cause: the host's backdrop filter creates a stacking context, so a negative z-index child sits over the glass. Fixed: the halo is a sibling behind the host, as SidePanel does in code (the same fix the 2 Oct gate made).
2. **w2 to w6, o1 to o6.** The value panel covered the top bar wallet chip. Fixed: when a panel is open the top bar ends at the split (x 890) and the chip sits in the context field.
3. **o1 to o4, o6.** The Tokens rows behind the panel showed 25.00 USDC while the tile and chip showed 0.00. Fixed: one balance per board.
4. **w7.** Dock items measured 61 x 42. Fixed: 44 minimum with the label aligned to the bottom.

## Notes (not exceptions)

- **w5 legend.** The line Buy USDC renders only when VITE_USDC_ONRAMP is on. Bridge is not rendered (D07) is a board legend for engineering, drawn outside the panel, not shipped copy.
- **o6 legend card.** The sibling states (canceled, limit reached, region) are listed on one G1 clear card on the board so Rob can read them in one place. In code each is its own panel state with the same layout.

## Copy decisions recorded on the boards

- Coinbase is named as the seller on every Buy USDC surface: Sold and delivered by Coinbase; You paid Coinbase; Coinbase sets the price and fees. Nothing is charged on Amped.Bio.
- The Receive notice is solid and verbatim (row 137 D2, counsel).
- Network fee: paid by Amped.Bio is a slab row on Send, never a sentence.
- The screening refusal reads This address cannot receive USDC from Amped.Bio. Nothing was sent. No vendor name is shown to the fan beyond the Checked by row.
- The agreement line names Coinbase's three documents before an order is created.

## Not drawn yet

Loading and skeleton states, the Confirm in wallet state of Send (the shipped stake panel covers the pattern), the Admin Money tab, the Google Pay variant of o3, the Telegram Mini App variant of o2 (Apple Pay option not rendered), the limits upgrade step inside Coinbase's frame (Coinbase renders it), and the email receipt (Coinbase sends its own). These go to build QA.
