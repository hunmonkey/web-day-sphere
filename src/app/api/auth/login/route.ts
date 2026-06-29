import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/server/auth-session";
import { loginWithPin } from "@/lib/server/auth-store";

export const runtime = "nodejs";

type LoginBody = {
  pin?: string;
  password?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as LoginBody;
  const session = await loginWithPin(body.pin ?? body.password ?? "");
  if (!session) {
    return NextResponse.json(
      { error: "PIN 번호가 올바르지 않습니다." },
      { status: 401 },
    );
  }

  const response = NextResponse.json({ user: session.user });
  response.cookies.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return response;
}
