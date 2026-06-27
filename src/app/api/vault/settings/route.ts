import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server/auth-session";
import { getVaultSettings, setVaultRoot } from "@/lib/server/vault-settings";

export const runtime = "nodejs";

type PatchBody = {
  targetDir?: string;
};

function errorJson(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function requireAdmin() {
  const user = await currentUser();
  if (!user) return { error: errorJson("로그인이 필요합니다.", 401) };
  if (user.role !== "admin") {
    return { error: errorJson("관리자만 사용할 수 있습니다.", 403) };
  }
  return { user };
}

export async function GET() {
  const user = await currentUser();
  if (!user) return errorJson("로그인이 필요합니다.", 401);
  return NextResponse.json({ ok: true, ...(await getVaultSettings()) });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  try {
    const body = (await request.json()) as PatchBody;
    if (!body.targetDir) throw new Error("저장 위치를 입력해 주세요.");
    return NextResponse.json({ ok: true, ...(await setVaultRoot(body.targetDir)) });
  } catch (error) {
    return errorJson((error as Error).message);
  }
}
