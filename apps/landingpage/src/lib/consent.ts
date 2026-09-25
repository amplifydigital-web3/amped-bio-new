import {
  CONSENT_MAX_AGE_MS,
  CONSENT_POLICY_VERSION,
  CONSENT_STORAGE_KEY,
  PERSISTENT_VISITOR_STORAGE_KEY,
} from "@repo/constants";

/**
 * Visitor consent for public creator pages.
 *
 * Two categories:
 * - analytics: Amped Bio remembers this browser with a random ID so creators
 *   can see returning visitors and retention. Site-wide choice.
 * - advertising: the creator's own Google Analytics, Meta and TikTok tags.
 *   Chosen per creator, because each creator connects different services.
 *
 * Without a choice, nothing is stored and visits are counted cookieless.
 * Choices expire after 13 months or when the policy version changes.
 */

export type ConsentState = {
  v: string;
  analytics: boolean;
  ads: Record<string, boolean>;
  at: number;
};

const SESSION_STORAGE_KEY = "amped_sid";

function safeGet(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

function safeSet(storage: () => Storage, key: string, value: string) {
  try {
    storage().setItem(key, value);
  } catch {
    // Storage unavailable: the choice applies to this page view only
  }
}

function safeRemove(storage: () => Storage, key: string) {
  try {
    storage().removeItem(key);
  } catch {
    // Nothing to remove
  }
}

const local = () => window.localStorage;
const session = () => window.sessionStorage;

let memoryState: ConsentState | null = null;

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // RFC 4122 v4 fallback
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, char => {
    const r = (Math.random() * 16) | 0;
    return (char === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function newEventId(): string {
  return randomId();
}

export function hasGlobalPrivacyControl(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true
  );
}

export function readConsentState(): ConsentState | null {
  const raw = safeGet(local, CONSENT_STORAGE_KEY);
  if (!raw) return memoryState;
  try {
    const parsed = JSON.parse(raw) as ConsentState;
    const expired = !parsed.at || Date.now() - parsed.at > CONSENT_MAX_AGE_MS;
    if (parsed.v !== CONSENT_POLICY_VERSION || expired) return null;
    return {
      v: parsed.v,
      analytics: parsed.analytics === true,
      ads: parsed.ads && typeof parsed.ads === "object" ? parsed.ads : {},
      at: parsed.at,
    };
  } catch {
    return null;
  }
}

/** true or false once decided, null when the visitor has not chosen yet. */
export function getAnalyticsConsent(): boolean | null {
  const state = readConsentState();
  return state ? state.analytics : null;
}

/** Advertising choice for one creator. Global Privacy Control always means no. */
export function getAdsConsent(creatorId: number): boolean | null {
  if (hasGlobalPrivacyControl()) return false;
  const value = readConsentState()?.ads[String(creatorId)];
  return typeof value === "boolean" ? value : null;
}

export function saveConsent(choice: { analytics: boolean; creatorId: number; ads?: boolean }) {
  const current = readConsentState();
  const ads = { ...(current?.ads ?? {}) };
  if (typeof choice.ads === "boolean") ads[String(choice.creatorId)] = choice.ads;

  const state: ConsentState = {
    v: CONSENT_POLICY_VERSION,
    analytics: choice.analytics,
    ads,
    at: Date.now(),
  };
  memoryState = state;
  safeSet(local, CONSENT_STORAGE_KEY, JSON.stringify(state));

  // Withdrawing analytics consent deletes the long-lived ID immediately
  if (!choice.analytics) {
    safeRemove(local, PERSISTENT_VISITOR_STORAGE_KEY);
    safeRemove(session, SESSION_STORAGE_KEY);
  }
  return state;
}

/**
 * Long-lived random browser ID. Created and returned only when the visitor
 * allowed analytics. Rotates after 13 months.
 */
export function getPersistentVisitorId(): string | null {
  if (getAnalyticsConsent() !== true) return null;
  const raw = safeGet(local, PERSISTENT_VISITOR_STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { id: string; created: number };
      if (parsed.id && Date.now() - parsed.created < CONSENT_MAX_AGE_MS) return parsed.id;
    } catch {
      // Replace a malformed value below
    }
  }
  const id = randomId();
  safeSet(local, PERSISTENT_VISITOR_STORAGE_KEY, JSON.stringify({ id, created: Date.now() }));
  return id;
}

// Without analytics consent a session is one page load and lives only in memory
const pageLoadSessionId = typeof window !== "undefined" ? randomId() : "";

/** Session ID: per browser tab with analytics consent, otherwise per page load. */
export function getSessionId(): string {
  if (getAnalyticsConsent() !== true) return pageLoadSessionId;
  const existing = safeGet(session, SESSION_STORAGE_KEY);
  if (existing) return existing;
  safeSet(session, SESSION_STORAGE_KEY, pageLoadSessionId);
  return pageLoadSessionId;
}
