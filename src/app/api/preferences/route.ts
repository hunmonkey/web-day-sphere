import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server/auth-session";
import { getDevicePrefs, setDevicePrefs } from "@/lib/server/vault-settings";

export const runtime = "nodejs";

type PutBody = {
  devicePrefs?: unknown;
};

function errorJson(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  const user = await currentUser();
  if (!user) return errorJson("로그인이 필요합니다.", 401);
  return NextResponse.json({ ok: true, devicePrefs: await getDevicePrefs() });
}

export async function PUT(request: Request) {
  const user = await currentUser();
  if (!user) return errorJson("로그인이 필요합니다.", 401);

  try {
    const body = (await request.json()) as PutBody;
    const devicePrefs = await setDevicePrefs(body.devicePrefs);
    return NextResponse.json({ ok: true, devicePrefs });
  } catch (error) {
    return errorJson((error as Error).message);
  }
}
