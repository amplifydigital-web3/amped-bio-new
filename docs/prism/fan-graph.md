# Fan Graph (Build Board #22): Follow, People, Explore Following

Spec: [docs/features/fan-graph.md](../features/fan-graph.md). Design QA: [docs/features/fan-graph-design-qa.md](../features/fan-graph-design-qa.md). Boards fg1 to fg12: https://claude.ai/artifact/GKy9Lvcbg6zckkuDLHrYhv#fg

Behind flags: `NEXT_PUBLIC_FAN_GRAPH` (landing) and `VITE_FAN_GRAPH` (client). On in development and staging, off in production. Needs migration `20261003180000_add_fan_graph`.

## Creator page frame (039)

| Piece               | File                                                   | Rule                                                                                                                                                                                            |
| ------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Count               | `components/follow/FollowControls.tsx` `FollowerCount` | 13/16 600 ink, tabular. Under 10 reads New on Amped. Absent when the creator hides it                                                                                                           |
| Follow              | same, `FollowButton`                                   | Primary fill, 44, user-plus 21. The capsule's one primary. Signed out: opens `/register?intent=follow&creator=`                                                                                 |
| Following           | same                                                   | Secondary lens with success user-check (or the warning dot while the email is unconfirmed), chevron. Opens the Prism menu: two checkbox items (public list, email updates), separator, Unfollow |
| Capsule layout      | `components/ProfileView.tsx`                           | Desktop: one pill row, count first. 390: r34 capsule, count above, buttons share the width. Owner: Edit page, never Follow                                                                      |
| First-follow sheet  | `FirstFollowSheet`                                     | Prism bottom sheet. Slab with three rows (sees, stays private, everyone sees), two section 8 checkboxes unticked, Follow {name} primary 55, Free. Unfollow any time., Privacy Policy ghost      |
| Toast               | `FollowToastView`                                      | Prism ToastCard above the capsule. Success and info leave after 5 seconds with Undo; errors stay                                                                                                |
| Return from sign up | `components/follow/useFollow.ts`                       | `?follow=1` finishes the follow once and is removed from the URL                                                                                                                                |

## Fan sign up (fg4)

`components/auth/FanRegisterForm.tsx` on `/register?intent=follow&creator=`. Auth card titled Follow {name} (name from the server). Name, Email, Password with the register checklist, Create account and follow (55), or, Continue with Google, Have an account? Sign in (keeps the return), legal line. `startGoogleSignIn` gains `intent`.

## People destination (fg5, fg7, fg10, fg11)

`apps/client/src/components/panels/people/PeoplePanel.tsx`. Rail: Page group after Analytics, icon users-round. No tabs in v1.

| Piece      | Rule                                                                                                                                                     |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header row | Followers eyebrow (indigo marker), period select (G2 well 233), Export CSV secondary                                                                     |
| Tiles      | Analytics tile anatomy: Followers, New in range with unfollows, Follow rate, Also pool fans                                                              |
| List       | G1 clear card: search well, filter chips (All, New, Pool fans, Shown publicly), table rows 61 with avatar 44, name, badges, date, source, 44 more button |
| Row menu   | Remove follower (toast with Undo for 8 seconds), Block (confirm Dialog with destructive Block)                                                           |
| Side       | Where follows come from (bars on nav), Settings: Show my follower count checkbox, Blocked accounts with Manage (bottom sheet with Unblock)               |
| Empty      | EmptyState: No followers yet, Copy page link primary 55                                                                                                  |
| No results | EmptyState with Clear search or Clear filter                                                                                                             |

## Explore, Following (fg6, fg12)

`apps/client/src/components/panels/explore/components/FollowingTab.tsx`. Third tab after Users and Pools. Search, sort and chips are hidden on this tab. Cards on G1 clear r21: avatar 55, name, Pool fan badge, @handle and Since date, 44 more button (Unfollow), two checkboxes, View page secondary. Empty: You don't follow anyone yet, Explore creators.

## Recorded exception

Follow is 44 high inside the 55 capsule, matching the approved 039 capsule buttons (design QA section 5).
