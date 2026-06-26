import "server-only";

import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/server/auth-store";

export const SESSION_COOKIE = "day_sphere_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

export async function currentUser() {
  const cookieStore = await cookies();
  return getSessionUser(cookieStore.get(SESSION_COOKIE)?.value);
}

