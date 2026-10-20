/**
 * Content system flags (Build Board #20, spec 3.16 PR 5). A surface whose flag
 * is off renders nothing (D07). VITE_CONTENT shows the Content destination.
 * Uploads also need CONTENT_UPLOADS_ENABLED on the API; the library reads
 * that from content.getStorage (uploadsOpen) and disables Upload when it is off.
 */
const on = (value: string | undefined) => value === "true";

export const CONTENT_FLAGS = {
  /** Content destination with the Library tab (cs1, cs2, cs3, cs8) */
  library: on(import.meta.env.VITE_CONTENT),
} as const;
