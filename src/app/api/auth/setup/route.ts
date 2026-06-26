import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/server/auth-session";
import { createInitialAdmin, login } from "@/lib/server/auth-store";

export const runtime = "nodejs";

type SetupBody = {
  name?: string;
  email?: string;
  password?: string;
};

function errorJson(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SetupBody;
    const email = body.email ?? "";
    const password = body.password ?? "";
    await createInitialAdmin({
      name: body.name ?? "",
      email,
      password,
    });
    const session = await login(email, password);
    if (!session) return errorJson("초기 관리자 로그인에 실패했습니다.", 500);

    const response = NextResponse.json({ user: session.user });
    response.cookies.set(SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    return response;
  } catch (error) {
    return errorJson((error as Error).message);
  }
}

