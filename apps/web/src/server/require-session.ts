// Server-side session check for portal pages. The proxy checks too; this is the second layer.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, getSessionSecret, homeFor, verifySession, type SessionKind, type SessionPayload } from "./session";

export async function requireSession(kind: SessionKind): Promise<SessionPayload> {
  const secret = getSessionSecret();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = secret && token ? await verifySession(token, secret, new Date()) : null;
  if (!session) redirect("/login");
  if (session.kind !== kind) redirect(homeFor(session.kind));
  return session;
}
