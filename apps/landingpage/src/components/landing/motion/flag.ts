/**
 * Public site motion (Build Board #26, phase 2). On in development and
 * staging, off in production until counsel clears the How it works pool step
 * and the hero copy (spec section 3.8). A plain module, so server components
 * read the value itself.
 */
export const SHOW_MOTION = process.env.NEXT_PUBLIC_SHOW_MOTION === "true";
