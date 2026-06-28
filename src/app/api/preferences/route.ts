import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server/auth-session";
import { getPreferences, setPreferences } from "@/lib/server/vault-settings";

export const runtime = "nodejs";

type PutBody = {
  devicePrefs?: unknown;
  themeMode?: unknown;
};

function errorJson(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  const user = await currentUser();
  if (!user) return errorJson("로그인이 필요합니다.", 401);
  return NextResponse.json({ ok: true, ...(await getPreferences()) });
}

export async function PUT(request: Request) {
  const user = await currentUser();
  if (!user) return errorJson("로그인이 필요합니다.", 401);

  try {
    const body = (await request.json()) as PutBody;
    const preferences = await setPreferences({
      devicePrefs: body.devicePrefs,
      themeMode: body.themeMode,
    });
    return NextResponse.json({ ok: true, ...preferences });
  } catch (error) {
    return errorJson((error as Error).message);
  }
}
