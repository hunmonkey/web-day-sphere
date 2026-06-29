import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server/auth-session";
import { resetPassword, updateUser } from "@/lib/server/auth-store";

export const runtime = "nodejs";

type PatchBody = {
  id?: string;
  email?: string;
  name?: string;
  password?: string;
};

function errorJson(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function requireUser() {
  const user = await currentUser();
  if (!user) return { error: errorJson("로그인이 필요합니다.", 401) };
  return { user };
}

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  return NextResponse.json({ user: auth.user });
}

export async function PATCH(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  try {
    const body = (await request.json()) as PatchBody;
    if (body.id && body.id !== auth.user.id) {
      throw new Error("본인 계정만 변경할 수 있습니다.");
    }

    let user = auth.user;
    if (body.name !== undefined || body.email !== undefined) {
      user = await updateUser(auth.user.id, {
        email: body.email,
        name: body.name,
      });
    }
    if (body.password !== undefined && body.password !== "") {
      user = await resetPassword(auth.user.id, body.password, { keepSessions: true });
    }

    return NextResponse.json({ user });
  } catch (error) {
    return errorJson((error as Error).message);
  }
}
