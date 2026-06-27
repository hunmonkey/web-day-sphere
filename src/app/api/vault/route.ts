import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server/auth-session";
import { getVaultRoot, readVault, writeVault } from "@/lib/server/vault-store";
import { emptyVault, type VaultData } from "@/lib/vault-types";

export const runtime = "nodejs";

type PutBody = {
  data?: Partial<VaultData>;
  baseSyncedAt?: number;
};

function normalize(input: Partial<VaultData> | undefined): VaultData {
  const v = emptyVault();
  if (Array.isArray(input?.tasks)) v.tasks = input!.tasks;
  if (Array.isArray(input?.memos)) v.memos = input!.memos;
  if (Array.isArray(input?.alarms)) v.alarms = input!.alarms;
  return v;
}

export async function GET() {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { data, syncedAt } = await readVault();
  return NextResponse.json({ ok: true, data, syncedAt, targetDir: await getVaultRoot() });
}

export async function PUT(request: Request) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const body = (await request.json()) as PutBody;
  const data = normalize(body.data);
  const base = typeof body.baseSyncedAt === "number" ? body.baseSyncedAt : 0;
  const result = await writeVault(data, base);
  return NextResponse.json({ ok: true, targetDir: await getVaultRoot(), ...result });
}
