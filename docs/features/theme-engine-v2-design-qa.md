# Theme Engine v2: design QA (boards 01 to 12)

Date: 2026-10-10. Build Board #28. Spec: docs/features/theme-engine-v2.md. Canvas: https://claude.ai/artifact/5oErPADNijTy9hTbXuA4GV. Screen Review rows 139 to 150.

## Method

1. Read the six boards drawn on 7 Oct against the overview, Prism 2.2 sections 5 to 17, the shipped Design rows 023 to 033 and the app structure conventions.
2. Rendered every board at its own size in Chromium with Playwright and ran the gate script on each: horizontal and vertical overflow, every control measured against the 44 target (tabs 43 inside 55), every text run measured against the sampled pixels around it (4.5:1 body, 3:1 at 24 px or 19 px bold), every color literal checked against the Prism 2.2 token list, dashes and banned words in the markup.
3. Fixed every finding, drew the six boards the spec screen list was missing (07 to 12), ran the gate again, and reviewed every render by eye.

## Result

12 of 12 pass the gate. 9 findings on the 7 Oct boards, all fixed. 4 findings on the new boards, all fixed. Three notes recorded, no new Prism exception. The demo theme on every board is Northern Lights (an Aurora scene with Fraunces), declared as creator content under Prism 17 the way Graphite is; its palette is the only set of non token colors on the canvas.

| Check | Result |
| --- | --- |
| Tokens | Every application color is a Prism 2.2 token. Non token colors appear only inside creator content: the Northern Lights demo page, effect tile art (scene, name and button previews) and the collection thumbnails. |
| Glass | G1 navigate for the dock, the Design tabs and the preview toolbar; G1 clear for the editor panel and the current look card; G2 wells for parameter strips, the font search and the share link field; G3 lens on the selected tile only. No value panel: nothing on these screens moves money. |
| Rim | None drawn. The selected tile carries the indigo ring plus the 4 px outer ring (section 7), one per region. |
| Contrast | Every application text run passes. Notes 1 and 2 below cover the two creator content cases the script flags. |
| Targets | Tabs 43 inside the 55 container; chips, buttons, switches, inputs and links 44 or more; primary actions (Done, Use this look, Copy link) 55 or 44 inside a dialog; range inputs 44 high. |
| Trust | No money surface. Cost words are Light and Heavy; tier words are Plus and Showcase. The weak phone warning uses the solid warning style, never a rim. |
| Content | No earn, yield, return, profit, APY, APR, invest, income, reward or token word on any board. No em or en dashes. Effect names describe what the eye sees; no library is named. |

## Findings on the 7 Oct boards (01 to 06), all fixed

1. **All six.** Design tabs and every segmented control were 34 high. Fixed: tabs are 43 inside a 55 G1 container with 16/500 labels (section 7); the sub controls (Name font and Body font, Loop and Play once, Your theme and Custom, Strong, Typical and Weak, Pointer and Drifts) use the same control.
2. **01, 02, 03, 04, 05.** Option tiles, font tiles, shape and border swatches and theme thumbnails were divs inside a radiogroup, so Tab skipped every pick. Fixed: every tile is a `button[role=radio][aria-checked]` with the label as its text.
3. **01, 02, 03, 05.** Sliders were drawn as divs. Fixed: `input[type=range]` with a label, 44 high, indigo accent.
4. **02, 04.** Filter chips were 34 high at 13 px. Fixed: 44 high Prism chips at 16/500 with the lens thumb on the selected one.
5. **04.** The current look card's Layers line was a run of 16 px text links and the card's text column was 250 px wide. Fixed: the card is two rows, with the Layers as 44 high chips on their own row that jump to each row of the editor.
6. **04.** Shared with me was clipped at 890. Fixed: the board is 1240 high so every shelf shows.
7. **06.** The 110 px headline overflowed into the preview column and the footer paragraph fell below 890. Fixed: 68/55 secondary display with the title shadow; Explore is a 44 high link; Download .ampedtheme is a 44 secondary lens, shown only when the author allows downloads (board 12).
8. **02.** See all 1,942 was a 16 px link and the parameter strip's four columns pushed the Size control out of its column. Fixed: a 44 secondary lens button; the strip is two columns; the board is 1010 high.
9. **01, 05.** The Galaxy tile was labeled with the engine (GPU). Fixed: Galaxy field. The phone board's cost chip moved from the tab row into the Scene row header so the 55 tab container fits at 390.

Two more mechanical fixes: the Saved indicator was 13 px green text on the bare room under the beams and measured 3.1:1 on the phone boards; it is now ink-2 text with the success check icon. The Tidepool preview caption was 13 px light text on bright teal; it is 13/600 in the theme's dark color.

## Findings on the new boards (07 to 12), all fixed

1. **07.** The Layout segmented control overflowed its column in the parameter well. Fixed: Layout is a chip group.
2. **08.** The Settle and Colors controls overflowed a four column well. Fixed: a two column well; the board is 950 high so the Cursor row shows.
3. **10.** Gradient tiles all rendered the default aurora art. Fixed: each tile paints its own gradient.
4. **11.** Collection thumbnails in the horizontal shelf showed a lock without a label. Fixed: the lock keeps its glyph and the name carries the cost dot; the shelf scrolls sideways by design (no page scroll at 390).

## Notes (not exceptions)

1. **Creator content under the scene.** On every board the demo bio (13 px #E6F1FF) measures 3.7 to 3.8:1 where the aurora band crosses it, and the name tiles on board 08 that render Outline, Chrome and Particle text measure 2.2 to 2.6:1 over the scene. These are the creator's theme and effect previews (Prism 17). The product answer is on board 08: the scene guard measures the frame and offers Add a surface. The tiles keep showing the real result so the creator sees why.
2. **Under the scrim.** On boards 05 and 12 the page content behind the sheet and the dialog measures below 4.5:1 because the scrim dims it by design. The sheet and dialog content pass. Same as ge3 and mb6.
3. **Sampling around badges.** The gate script samples a ring around each text box; for the Plus, Showcase and Week badges that ring lands on the tile art, so the script reports 1.4 to 3.4:1. The badge text is #302F5D on 0.92 white (10:1) or white on value-deep (10.1:1) by construction.

## Copy decisions recorded on the boards

- Cost line, light: "Light, 2 effects." Cost line, heavy: "Heavy, 2 effects. Weak phones see the still version of Aurora. Everything else stays."
- Scene guard: "Name over Aurora measures 2.6:1. It needs 3:1 to read on every frame." Button: Add a surface.
- Phone note on hover: "Hover needs a pointer. Phones feel the press effect below instead."
- Share dialog: "Anyone with the link can preview it and use it on their page." / "Show my handle on the link page" / "Let people download the file" / "The link carries your effect choices, fonts and colors. Your photo, name, bio and links stay out of it."
- Share page: "A look shared with you" / "Made by @handle" / "Use this look" / "Save to My looks" / "Your photo, name, links and colors stay yours. The look carries effect choices only, never code."
- Themes tab banner: "Previewing Tidepool. Not applied yet. Press Escape to go back."
- Fonts line: "Fonts on this page: 2 families, 11 KB. The name font loads only its own letters."

## Not drawn yet

Loading, empty and error states for each shelf; the locked marketplace theme notice (kept from 033); import conflict and v1 upgrade notices; Shared with me empty; My looks at 10 of 10; the weak device still version (the Weak toggle on the same boards); Visitor view; Cursor and Button press row tiles (the 09 pattern); the phone font picker sheet (02 inside the 05 sheet); the revoked share link page. These go to build QA.

## Full QA, 3 Nov 2026 (Screen Review 139 to 150)

Checked every board against this spec, `development` 98db33f and the rules of 3 Nov (Prism 2.2 locked, site_settings feature flags, Amped Messages, the verified seller and payment rules). Phases 1a to 2 are built behind `themeV2`; built code wins over a board where it exists. Fonts (2b), Showcase (3) and Looks and sharing (4) are not built.

Result: 1 S1, 30 S2, 12 S3. The S1 is in code: the pool call to action takes the creator's hover and press effects (spec 3.4 build fix). Every board finding is fixed on the canvas; every code finding is written into the spec with file and function.

| Id | Sev | Finding | Fix |
| --- | --- | --- | --- |
| TH-Q1 (139) | S2 | Board 01 offers Mesh gradient as a Scene tile. Decision 4 puts the base (color, gradient, mesh) in the Style Background row, and the built Scene row lists overlays and shaders only. | Replace the Mesh gradient tile with Fire (Plus, Light), a built Scene overlay. |
| TH-Q2 (139) | S3 | The four column parameter well squeezes Colors and Motion: Your theme and Play once wrap to two lines and Custom touches the edge. | Use the two column well of board 08: Intensity and Speed, then Colors and Settle. |
| TH-Q3 (139) | S3 | The loop control is called Motion with Loop first. Spec 3.10 and the built Name row call it Settle with Play once, Loop. | Rename to Settle with Play once, Loop. |
| TH-Q4 (140) | S2 | Size shows four chips S, M, L, XL. The built Text row offers five sizes (Small, Base, Medium, Large, Extra large) and the schema has xxl. | Show the five built sizes as wrapping chips. |
| TH-Q5 (140) | S2 | No 390 frame. The spec lists the phone font picker as not drawn. Editor screens need 1440 and 390. | Add board 02m: Text row on a phone with the picker and an Adjust button for the font controls. |
| TH-Q7 (141) | S2 | Surface shows six tiles, three of them phase 3. The eight core surfaces shipped in phase 2 (Gradient border, Neon glow, Double border, Minimal glass, Modern card missing) are not drawn. | Draw the eight core surfaces then Spotlight, Liquid glass and Electric border with their tier badges. |
| TH-Q8 (141) | S2 | Border shows four chips. Six ship (None, Hairline, Thick, Dashed, Gradient, Glow). | Draw all six border chips. |
| TH-Q9 (141) | S3 | The Plus badge on Liquid glass is clipped to Plu. | Give the badge room inside the tile art. |
| TH-Q10 (141) | S2 | No 390 frame for the Container row. | Add board 03m. |
| TH-Q11 (142) | S2 | Collection tiles show a lock glyph with no word. The built ThemeCard names it Locked and explains that locked themes apply as is. | Add the word Locked next to the glyph on every locked tile. |
| TH-Q12 (142) | S2 | My looks at 10 of 10 (Save as new look disabled with the reason), Shared with me empty and the shelf loading state are not drawn. | Draw them on the new states board 13. |
| TH-Q13 (143) | S2 | The job is to tune a scene on a phone without losing the preview. The board's sheet covers the whole screen and no preview shows. The built sheet is a modal BottomSheet over the Edit view, and the phone preview is a separate view. | Redraw 05 with the preview on top and a sheet capped at 55 percent height with no scrim over the preview. Write the rule into spec 3.10 with ParamPanel in kit/ParamStrip.tsx. |
| TH-Q14 (143) | S3 | The Adjust button that opens the sheet is not drawn. | Show Adjust Aurora under the tiles. |
| TH-Q15 (144) | S2 | The page says the look carries effect choices only and the visitor's colors stay theirs. A v2 look carries colors and fonts, Use this look applies them, and the share dialog (board 12) says the link carries effect choices, fonts and colors. | Use: Your photo, name, bio and links stay yours. The look carries effects, fonts and colors, never code. You can change any layer after you apply it. Add Colors to the layer list. |
| TH-Q16 (144) | S2 | The preview plays a looping Aurora scene with no Pause motion control. Spec 3.11 requires Pause motion on every public page with a looping effect. | Add Pause motion to the preview frame. Reduced motion renders the poster still. |
| TH-Q17 (144) | S2 | No 390 frame on a public page. Buying and public pages are mobile first. | Add board 06m. |
| TH-Q18 (144) | S2 | Revoked or unknown slug (404 with Claim your page), credit off, download off and signed in states are not drawn. | Draw them on states board 13. |
| TH-Q19 (145) | S2 | The board has a Text color control with its own ratio. The Buttons PR did not ship a separate button text color: buttons read the v1 text color until the block kit (#54). | Replace the control with a read only line: Button text uses your text color, with the measured ratio and a link to the Text row. |
| TH-Q20 (145) | S2 | No 390 frame for the Buttons row. | Add board 07m. |
| TH-Q21 (146) | S2 | The guard notice in code uses literal colors (#fff4e0, #5c3b00) and the cost dots use #7a4f00 and #17693f literals, not Prism tokens. The warning notice must be the solid prism-notice. | Spec build step: PreviewChrome.tsx PreviewCostLine uses prism-notice (warning-bg, warning-ink, warning-line) and bg-prism-success and bg-prism-warning-ink for the dots. |
| TH-Q22 (146) | S3 | Add a surface is disabled on a locked marketplace theme with no reason shown. | Show: Make an editable copy to change the style. Write it into spec 3.10. |
| TH-Q23 (146) | S2 | No 390 frame for the Name row and the guard. | Add board 08m. |
| TH-Q24 (147) | S1 | The pool call to action takes the creator's hover and press effects. CreatorButton applies buttonHover and buttonPress (ripple) to every button, and CreatorPoolBlock renders View pool through it; the client pool block adds getButtonEffectStyle. Spec 3.4 and 3.11: no effect renders inside pool blocks, stake flows or wallet views. | Spec build step: CreatorButton gains effects (default true); false drops buttonHover, buttonPress and the ripple. Both CreatorPoolBlock files pass effects false; the client block drops getButtonEffectStyle. Add a test. |
| TH-Q25 (147) | S2 | Speed is drawn as a 0 to 100 slider reading 233 ms. The built hover Speed is a choice: Default, Fast (144 ms), Slow (377 ms). | Draw Speed as chips Default, Fast, Slow. Strength stays for Magnet (phase 3). |
| TH-Q26 (147) | S3 | Ten tile art elements carry style="linear-gradient(...)" with no property, so the art falls back to the class gradient. | Write background: on each. |
| TH-Q27 (147) | S2 | No 390 frame for the hover row. | Add board 09m. |
| TH-Q28 (148) | S3 | The builder lacks Remove stop and the Drift line omits the reduced motion clause the built picker shows. | Add Remove stop; use the built line: Drift is a light effect. Pause motion and reduced motion keep it still. |
| TH-Q29 (148) | S3 | The chip above the preview reads Still background, 0 KB. The built chip reads the page cost (PreviewCostLine), not the row. | Show the page cost line; move the shader note into the row. |
| TH-Q30 (148) | S2 | No 390 frame for the Background row. | Add board 10m. |
| TH-Q31 (149) | S2 | Locked collection tiles show the glyph only (same as TH-Q11). | Add the word Locked. |
| TH-Q32 (149) | S3 | The phone current look card has no Save as new look, and My looks has no Import file. Spec 3.10 lists both. | Add Save as new look under the card and Import file at the end of My looks. |
| TH-Q33 (150) | S2 | The link reads amped.bio/t/northern-lights, a guessable slug. Spec 3.11 needs 40 random bits, and 3.9 contradicts itself (8 chars from the name plus a random suffix). | Slug is 8 random base32 characters (40 bits), no name. Board shows amped.bio/t/k7q2m9xd. Fix spec 3.9. |
| TH-Q34 (150) | S2 | The two switches are 55 x 34 and the rows are not labels, so the targets are under 44. | Make each row a label of 55 height that toggles the switch. |
| TH-Q35 (150) | S2 | Not shared yet (Create link), Copied, Stop sharing confirm in place and the 390 sheet are not drawn. | Draw them on board 13 and board 12m. |
| TH-Q36 (150) | S3 | The dialog opens over a Tidepool preview banner, so it shares one look while previewing another. | Show the Themes tab without a preview in progress behind the dialog. |
| TH-X1 | S2 | All ten desktop boards draw the old editor rail (Home, Page, Design, Pools, Wallet, unlabeled) and no bell. The shell is the Prism rail with groups and labels and a top bar with the bell. The phone boards have no dock. | Swap in the Prism rail (Home, Explore, Inbox; Page: Page, Content, Design, Analytics, People; Money: Wallet, My Pool), add the bell, add the phone dock (Home, Page, Inbox, Wallet, More). |
| TH-X2 | S2 | Built Motion rows carry Your visitors with reduced motion see a still version. No Motion board shows it, so reduced motion handling is invisible in the design. | Add the line under each open Motion row (01, 05, 08, 09). |
| TH-X3 | S2 | The cost line counts 2 effects for Northern Lights and board 09 says Light, 1 effect for the same look. pageCost counts every moving part: Aurora, Spotlight, Magnet, Ripple and Shiny make Heavy, 5 effects. | Use Heavy, 5 effects on every board. Spec 3.7 states the count is cost.parts.length. |
| TH-X4 | S3 | Collapsed row values disagree across boards for one look (Container Frosted glass, Pill, Hairline vs Spotlight, Squircle, Glow; Buttons Soft, Pill vs Soft, Pill, Hairline). | Use Spotlight, Squircle, Glow and Soft, Pill, Hairline everywhere. |
| TH-X5 | S2 | The spec names flags as environment variables (SHOW_THEME_V2, SHOW_FONT_CATALOG, SHOW_THEME_SHOWCASE, SHOW_THEME_SHARING, FONT_DELIVERY=google). Feature switches are site_settings feature flags (#421). Only themeV2 is registered. | Name site_settings keys themeV2, fontCatalog, themeShowcase, themeSharing and fontDeliveryGoogle (server scope) in packages/constants/src/feature-flags.ts. |
| TH-X6 | S2 | Paid themes: spec 3.15 routes a paid theme through the Amped.Bio branded gateway. Rule 3 allows Amped branding only when Amped is the seller. Who is seller of record for a theme a creator sells is not settled. | Decision for Rob (see decisions). Spec records the rule: price shows as $N USDC and the checkout names the seller of record. |
| TH-X7 | S3 | Creator previews carry a Join the moon pool link with no testnet line. A pool on any surface needs TESTNET_NOTICE. | Replace the demo link with Moon phase calendar. |
| TH-X8 | S2 | Spec 3.1 lists two phone boards. Eight editor and public boards have no 390 frame. | Add 02m, 03m, 06m, 07m, 08m, 09m, 10m, 12m and states board 13; list them in 3.1. |

Gate after the fixes: 21 boards (12 desktop and states at 1440, 9 phone frames at 390) with 0 em or en dashes, 0 banned words, 0 targets under 44 (search inputs sit inside 44 high labels; switch checkboxes sit inside 55 high labels), 0 contrast failures outside creator content, no sideways scroll.

For Rob: the seller of record for a theme a creator sells (spec 3.15).
