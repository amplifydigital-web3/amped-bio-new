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
