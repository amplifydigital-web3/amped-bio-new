/**
 * Fan Library copy (Build Board #26, FL-3 and FL-4; boards m1, m2, m3, m4, m10,
 * m12, fl-q1, fl-q2, fl-q6, fl-q7). Plain words, no dashes, no earn, yield,
 * return or price words (spec 3.8). The testnet line is TESTNET_NOTICE, imported.
 */
import type { LibraryAccessSource } from "@repo/constants";

export const LIBRARY_COPY = {
  title: "Library",
  search: "Search",
  filter: "Filter",
  inbox: "Inbox",
  continueTitle: "Continue",
  savedTitle: "Saved",
  savedTile: (count: number) => (count === 1 ? "1 item" : `${count} items`),
  savedTileEmpty: "Nothing saved yet",
  creatorsTitle: "Your creators",
  seeAll: "See all",
  newestTitle: "Newest",
  showMore: "Show more",
  loadingMore: "Loading",
  back: "Back to Library",

  minutesLeft: (minutes: number) => (minutes <= 1 ? "1 min left" : `${minutes} min left`),
  pagesLeft: (pages: number) => (pages === 1 ? "1 page left" : `${pages} pages left`),
  play: (title: string) => `Play ${title}`,
  open: (title: string) => `Open ${title}`,
  by: (name: string) => `by ${name}`,

  labels: {
    purchased: "Purchased",
    member: "Members",
    pool: "Pool fans",
    follower: null,
    public: null,
  } satisfies Record<LibraryAccessSource, string | null>,

  connection: {
    following: "Following",
    member: "Member",
    purchases: (count: number) => (count === 1 ? "1 purchase" : `${count} purchases`),
    poolFan: "Pool fan",
  },
  newCount: (count: number) => (count === 1 ? "1 new" : `${count} new`),
  pastDue: "Payment past due",

  filterSheet: {
    title: "Filter",
    type: "Type",
    how: "How you have it",
    types: {
      video: "Video",
      audio: "Audio",
      document: "Documents",
      image: "Photos",
      file: "Files",
    },
    sources: {
      member: "Membership",
      purchased: "Purchased",
      pool: "Pool fans",
      public: "Free",
    },
    apply: "Show results",
    clear: "Clear filter",
    remove: (label: string) => `Remove filter ${label}`,
  },

  menu: {
    label: (title: string) => `More for ${title}`,
    playNext: "Play next",
    addToQueue: "Add to queue",
    save: "Save",
    unsave: "Remove from Saved",
    markWatched: "Mark as watched",
    goToCreator: (name: string) => `Go to ${name}'s section`,
    removeFromContinue: "Remove from Continue",
  },
  toasts: {
    playNext: "Plays next",
    queued: "Added to your queue",
    notQueued: "This item can not be added to the queue",
    saved: "Saved",
    unsaved: "Removed from Saved",
    watched: "Marked as watched",
    removed: "Removed from Continue",
    failed: "That did not work. Try again.",
  },

  empty: {
    libraryTitle: "Your Library is empty",
    library: "Follow a creator and what they publish shows up here. Find creators in Explore.",
    explore: "Go to Explore",
    filteredTitle: "Nothing matches this filter",
    filtered: "Try another type, or clear the filter.",
    savedTitle: "Nothing saved yet",
    saved: "Save an item from its menu and it waits for you here.",
    creatorsTitle: "No creators yet",
    creators: "Creators you follow show up here.",
    creatorsSearch: (q: string) => `No creators match "${q}".`,
  },
  error: {
    title: "The Library did not load",
    cause: "Check your connection and try again.",
    offlineTitle: "You are offline",
    offline: "The Library needs a connection for now. Downloads arrive in a later update.",
  },

  searchPage: {
    label: "Search your Library",
    placeholder: "Search titles and descriptions",
    clear: "Clear search",
    scope: "Search in",
    all: "All creators",
    recent: "Recent searches",
    clearRecent: "Clear recent searches",
    hint: "Type at least 2 letters.",
    noResultsTitle: (q: string) => `No results for "${q}"`,
    noResults: "Search looks at titles and descriptions of items you can open.",
    results: (count: number) => (count === 1 ? "1 result" : `${count} results`),
  },

  creatorsPage: {
    searchLabel: "Search your creators",
    placeholder: "Search by name or handle",
  },

  item: {
    notFoundTitle: "This item is not available",
    notFound: "It may have been removed, or you may no longer have access.",
    save: "Save",
    saved: "Saved",
    openFile: "Open on the creator's page",
    pages: (count: number) => (count === 1 ? "1 page" : `${count} pages`),
    loadingFile: "Loading",
  },
} as const;

export type LibraryCopy = typeof LIBRARY_COPY;
