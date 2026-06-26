import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server/auth-session";
import {
  createUser,
  deleteUser,
  listUsers,
  resetPassword,
  updateUser,
} from "@/lib/server/auth-store";
import type { UserRole } from "@/lib/auth-types";

export const runtime = "nodejs";

type CreateBody = {
  email?: string;
  name?: string;
  password?: string;
  role?: UserRole;
};

type PatchBody = {
  id?: string;
  email?: string;
  name?: string;
  password?: string;
  role?: UserRole;
  active?: boolean;
};

type DeleteBody = {
  id?: string;
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
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  return NextResponse.json({ users: await listUsers() });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  try {
    const body = (await request.json()) as CreateBody;
    await createUser({
      name: body.name ?? "",
      email: body.email ?? "",
      password: body.password ?? "",
      role: body.role === "admin" ? "admin" : "user",
    });
    return NextResponse.json({ users: await listUsers() });
  } catch (error) {
    return errorJson((error as Error).message);
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  try {
    const body = (await request.json()) as PatchBody;
    if (!body.id) throw new Error("사용자 ID가 필요합니다.");
    if (body.password !== undefined) {
      await resetPassword(body.id, body.password);
    } else {
      await updateUser(body.id, {
        email: body.email,
        name: body.name,
        role: body.role,
        active: body.active,
      });
    }
    return NextResponse.json({ users: await listUsers() });
  } catch (error) {
    return errorJson((error as Error).message);
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  try {
    const body = (await request.json()) as DeleteBody;
    if (!body.id) throw new Error("사용자 ID가 필요합니다.");
    if (body.id === auth.user.id) {
      throw new Error("현재 로그인한 본인 계정은 삭제할 수 없습니다.");
    }
    await deleteUser(body.id);
    return NextResponse.json({ users: await listUsers() });
  } catch (error) {
    return errorJson((error as Error).message);
  }
}

