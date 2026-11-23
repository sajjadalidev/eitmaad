// Protects the vendor portal and admin console (blueprint section 20.4).

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, getSessionSecret, homeFor, verifySession } from "./server/session";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const area = pathname.startsWith("/admin") ? "admin" : "vendor";

  const secret = getSessionSecret();
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = secret && token ? await verifySession(token, secret, new Date()) : null;

  if (!session) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }
  if (session.kind !== area) {
    return NextResponse.redirect(new URL(homeFor(session.kind), request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/vendor/:path*", "/admin/:path*"],
};
