import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next.js reserves URL segments that start with "@" for parallel-route slots,
 * so the app router redirects /@handle to / before the [handle] page can run.
 * Rewriting /@handle (and its %40-encoded form) to /handle keeps profile links
 * like landingpage.amped.bio/@gustavo working, while the address bar still
 * shows the "@" URL the visitor opened.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (/^\/(?:%40|@).+/.test(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace(/^\/(?:%40|@)/, "/");
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/@:handle", "/%40:handle"],
};
