import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server/auth-session";
import { listVaultDirectories } from "@/lib/server/vault-settings";

export const runtime = "nodejs";

function errorJson(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return errorJson("로그인이 필요합니다.", 401);
  if (user.role !== "admin") {
    return errorJson("관리자만 사용할 수 있습니다.", 403);
  }

  try {
    const url = new URL(request.url);
    const target = url.searchParams.get("path") ?? undefined;
    return NextResponse.json({ ok: true, ...(await listVaultDirectories(target)) });
  } catch (error) {
    return errorJson((error as Error).message);
  }
}
