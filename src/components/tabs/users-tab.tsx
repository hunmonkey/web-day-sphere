"use client";

import { useState, type FormEvent } from "react";
import type { AuthUser, UserRole } from "@/lib/auth-types";

type UsersResponse = {
  users?: AuthUser[];
  error?: string;
};

const panel = "glass rounded-3xl p-5 min-h-0";

export function UsersTab({
  currentUser,
  initialUsers,
}: {
  currentUser: AuthUser;
  initialUsers: AuthUser[];
}) {
  const [users, setUsers] = useState<AuthUser[]>(initialUsers);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("user");
  const [resetPasswords, setResetPasswords] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function request(method: string, body?: unknown) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/users", {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = (await response.json()) as UsersResponse;
      if (!response.ok) throw new Error(data.error ?? "요청에 실패했습니다.");
      setUsers(data.users ?? []);
      return data.users ?? [];
    } catch (err) {
      setError((err as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function addUser(e: FormEvent) {
    e.preventDefault();
    const result = await request("POST", { name, email, password, role });
    if (!result) return;
    setName("");
    setEmail("");
    setPassword("");
    setRole("user");
  }

  function setResetValue(id: string, value: string) {
    setResetPasswords((prev) => ({ ...prev, [id]: value }));
  }

  async function resetPassword(id: string) {
    const next = resetPasswords[id] ?? "";
    const result = await request("PATCH", { id, password: next });
    if (!result) return;
    setResetValue(id, "");
  }

  return (
    <section className={`${panel} flex h-full flex-col`}>
      <div className="flex shrink-0 items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-fg">사용자 관리</h2>
        <span className="rounded-full bg-accent/15 px-2.5 py-1 text-xs font-medium text-accent">
          {users.length}명
        </span>
      </div>

      <form onSubmit={addUser} className="mt-4 grid shrink-0 gap-2 lg:grid-cols-[1fr_1.35fr_1fr_auto_auto]">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="이름"
          aria-label="새 사용자 이름"
          className="min-w-0 rounded-xl border border-border bg-surface-strong px-3 py-2 text-sm text-fg placeholder:text-muted"
          required
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="이메일"
          aria-label="새 사용자 이메일"
          className="min-w-0 rounded-xl border border-border bg-surface-strong px-3 py-2 text-sm text-fg placeholder:text-muted"
          required
        />
        <input
          type="password"
          inputMode="numeric"
          value={password}
          onChange={(e) => setPassword(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="숫자 4자리"
          aria-label="새 사용자 임시 비밀번호"
          maxLength={4}
          className="min-w-0 rounded-xl border border-border bg-surface-strong px-3 py-2 text-sm text-fg placeholder:text-muted"
          required
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as UserRole)}
          aria-label="새 사용자 권한"
          className="rounded-xl border border-border bg-surface-strong px-3 py-2 text-sm text-fg"
        >
          <option value="user">사용자</option>
          <option value="admin">관리자</option>
        </select>
        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
        >
          추가
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-3 shrink-0 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <ul className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {users.map((user) => (
          <li
            key={user.id}
            className="grid gap-2 rounded-2xl border border-border bg-surface-strong p-3 text-sm lg:grid-cols-[1.2fr_1.4fr_auto_auto_1.3fr_auto]"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-fg">{user.name}</p>
              <p className="mt-0.5 text-xs text-muted">
                {user.id === currentUser.id ? "현재 로그인" : user.active ? "활성" : "비활성"}
              </p>
            </div>
            <p className="min-w-0 truncate tabular-nums text-muted">{user.email}</p>
            <button
              type="button"
              disabled={busy || user.id === currentUser.id}
              onClick={() =>
                request("PATCH", {
                  id: user.id,
                  active: !user.active,
                })
              }
              className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                user.active ? "bg-ok/15 text-ok" : "bg-neutral/15 text-neutral"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {user.active ? "켜짐" : "꺼짐"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                request("PATCH", {
                  id: user.id,
                  role: user.role === "admin" ? "user" : "admin",
                })
              }
              className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
            >
              {user.role === "admin" ? "관리자" : "사용자"}
            </button>
            <div className="flex min-w-0 gap-1">
              <input
                type="password"
                inputMode="numeric"
                value={resetPasswords[user.id] ?? ""}
                onChange={(e) =>
                  setResetValue(user.id, e.target.value.replace(/\D/g, "").slice(0, 4))
                }
                placeholder="숫자 4자리"
                aria-label={`${user.name} 새 비밀번호`}
                maxLength={4}
                className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs text-fg placeholder:text-muted"
              />
              <button
                type="button"
                disabled={busy || !/^\d{4}$/.test(resetPasswords[user.id] ?? "")}
                onClick={() => resetPassword(user.id)}
                className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
              >
                변경
              </button>
            </div>
            <button
              type="button"
              disabled={busy || user.id === currentUser.id}
              onClick={() => request("DELETE", { id: user.id })}
              className="rounded-lg px-2.5 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              삭제
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
