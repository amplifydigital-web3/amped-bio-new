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
  downloadsTitle: "Downloads",
  downloadsTile: (count: number) => (count === 1 ? "1 on this device" : `${count} on this device`),
  downloadsTileEmpty: "Nothing downloaded yet",
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
    where: "Where",
    wheres: { device: "On this device" },
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
    download: "Download",
    downloading: "Downloading",
    removeDownload: "Remove download",
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
    offline: "The Library needs a connection. Your downloads play without one.",
    openDownloads: "Go to Downloads",
  },

  searchPage: {
    label: "Search your Library",
    placeholder: "Search titles and descriptions",
    clear: "Clear search",
    scope: "Search in",
    all: "All creators",
    device: "On this device",
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

  /** FL-5, board m10, row 129, spec 3.5 Offline (decision C) */
  downloads: {
    title: "Downloads",
    device: (used: string, free: string) => `On this device: ${used} used, ${free} free`,
    deviceUnknown: "On this device",
    meter: "Storage used on this device",
    wifiOnly: "Download on Wi-Fi only",
    wifiHelp: "Downloads wait for Wi-Fi when your browser tells us the connection type.",
    wifiUnknown:
      "This browser does not say whether you are on Wi-Fi, so downloads start on any connection.",
    clearAll: "Clear all",
    clearTitle: "Remove every download?",
    clearBody:
      "This removes every download from this device. You can download them again while you have access.",
    clearConfirm: "Remove all",
    cancel: "Cancel",
    remove: (title: string) => `Remove ${title}`,
    removeShort: "Remove",
    removed: "Download removed",
    cleared: "Downloads removed",
    emptyTitle: "Nothing downloaded yet",
    empty:
      "When a creator allows downloads, choose Download in the item menu. It plays here without a connection.",
    downloaded: "Downloaded. It plays without a connection.",
    progress: (percent: number | null) =>
      percent === null ? "Downloading" : `Downloading ${percent}%`,
    size: (bytes: string) => bytes,
    rules:
      "Downloads open offline for 30 days after your last connection. When your access ends, or the creator removes an item, its download is removed from this device.",
    removedTitle: (count: number) =>
      count === 1 ? "1 download was removed" : `${count} downloads were removed`,
    removedBody: {
      access: "Your access ended",
      unavailable: "The creator removed it",
      downloadsOff: "The creator turned off downloads",
      removed: "You removed it",
    },
    dismiss: "Dismiss",
    windowClosedTitle: "Connect to keep watching",
    windowClosed:
      "Downloads open offline for 30 days after your last connection. Connect once to check your access.",
    offlineTitle: "You are offline",
    offline: "Your downloads play here. The rest of Amped.Bio needs a connection.",
    openOnline: "Back to the Library",
    openFile: "Open file",
    errors: {
      wifi: "Connect to Wi-Fi to download, or turn off Download on Wi-Fi only in Downloads.",
      storage: "This device is out of space for downloads. Remove some in Downloads.",
      network: "The download did not finish. Check your connection and try again.",
      unsupported: "This browser can not keep downloads. Try Chrome, Edge or Safari.",
      busy: "This item is already downloading.",
      refused: "This item can not be downloaded.",
    },
    install: {
      title: "Install the Amped.Bio app",
      body: "Open your Library from your home screen, with your downloads ready offline.",
      button: "Install",
      ios: "On iPhone or iPad, tap Share, then Add to Home Screen.",
    },
  },
} as const;

export type LibraryCopy = typeof LIBRARY_COPY;
