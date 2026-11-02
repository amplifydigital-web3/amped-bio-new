# Amp Builder: overview

Build Board #14 "AI Amped bio builder". Drafted by Claude for Rob Frasca, 28 Oct 2026.
Research: `docs/features/ai-builder-research.md`. Spec: `docs/features/ai-builder.md`. Design: AI auto builder screens, https://claude.ai/artifact/ERXtBxw8fBU7vVkpjMLPSe.

## What it does

Amp Builder builds a person's Amped.Bio page for them, inside Amped.Bio. The person brings what they already have: an existing link-in-bio page from any service, their social handles, and a few words about themselves. Amp Builder gathers the links, sorts them, writes a short bio, picks a look that matches their photo, and shows the finished page for review. Nothing goes live until the person says so.

It is the fastest way to move to Amped.Bio from Linktree, Beacons, Stan, Taplink, Tap Bio, Bento or any other link page.

## How it works

Seven short steps, phone first. Each one can be skipped.

1. **Start.** Three ways in: Bring my page, Start from my socials, Describe me. A person can use all three.
2. **Bring my page.** Paste the link to an existing page. Amp Builder names the service it found. For services that allow it, Amp Builder reads the public page once. For services whose terms do not allow automated reading (Linktree and Beacons today), the person copies their page and pastes it, or uploads the export file the service gave them (Bento zip). The person confirms the page is theirs before anything is read.
3. **Add your socials.** Type handles. Amp Builder turns each one into the right link and icon. Links found on the old page appear here already filled in.
4. **Building.** Amp Builder reads, sorts and removes duplicates, names each link, writes two bio options and picks three looks. It shows each step as it finishes. About 15 seconds.
5. **Review your links.** Every link with its title, icon and order. Keep, rename, reorder or drop. Unsafe links are removed and the screen says why.
6. **Pick a look and a bio.** Three looks built from the person's photo colours and the colours of their old page, using Amped themes. Two bio options to choose from or edit.
7. **Preview and add.** The whole page in a phone frame. A new page publishes. A page that already has blocks gets the choice of Add to my page or Replace my page. Replace keeps a copy for 7 days with one tap Undo.

## What makes it different

- **It brings the old page across, look included.** Competitors rebuild from a prompt. Amp Builder keeps the person's own titles, order, socials and colours.
- **It works on Linktree without breaking Linktree's rules.** Paste and file paths cover every service. Reading a page directly happens only where the service's robots.txt and terms allow it, until counsel clears more.
- **Nothing publishes without review.** The plan is a draft until the person adds it.
- **One plan, every surface.** The in app builder and future AI agent tools (Claude or ChatGPT through MCP) produce the same build plan and apply it through the same checks. A page built by an agent gets the same link safety and review as one built in the app.

## The competition

| | Import from a competitor | AI build | Review before publish |
| --- | --- | --- | --- |
| Linktree | No tool | Suggestions on an existing page | Suggestions |
| Beacons | No tool | Website builder from a vibe; Beam chat edits | Yes, Beam confirms |
| Taplink | No tool | Page from a business description, 10 to 15 s | Yes |
| Stan | No tool | Content planning only | n/a |
| Jemi, Vista Social, own.page | Paste a Linktree URL (fields undocumented) | No | n/a |
| **Amp Builder** | **Any service: read, paste or file; titles, order, socials, colours** | **Links, bio, look from photo and old page** | **Yes, always** |

## Marketing

- **Headline:** Bring your page. We'll build the rest.
- **Switching campaign:** "Moving from Linktree? Paste your page. Done in a minute." Landing pages per service on the marketing site, each sending to `register?import=<service>`.
- **Shutdown moments:** Tap Bio closes on 31 Oct 2026 with no export. Bento users lost their pages in February 2026. A "Tap Bio users: bring your page" page and outreach can go out this week, using the paste path, which needs no fetch.
- **Proof point:** "31 million Instagram accounts use a link in bio. 4 in 5 use Linktree." (influencers.club, Nov 2024 scan.) Cite the source in copy.
- **Claim limits:** do not say "one click import from Linktree" until counsel clears direct reading. Say "paste your page".

## Phases

| Phase | Scope |
| --- | --- |
| 1 (this design) | Guided builder in the app, import by read, paste or file, typed handles, AI plan, review, apply, 7 day undo |
| 2 | Connect accounts (TikTok, YouTube, Instagram professional) for avatar and verified handles; per service import adapters cleared by counsel; image restyle |
| 3 | MCP write tools (`build_page_plan`, `apply_page_plan`) for Claude and ChatGPT, on the same plan service; chat edits in the editor |

## Decisions for Rob

On the Build Board card, each with the recommended answer, why and the alternatives: AB1 import route for Linktree and Beacons, AB2 AI provider, AB3 apply mode, AB4 social connections in phase 1, AB5 where it appears, AB6 how looks are made, AB7 limits and price, AB8 relationship to MCP, AB9 name.
