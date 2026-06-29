"use client";

import { useState, type FormEvent } from "react";
import type { AuthUser } from "@/lib/auth-types";

type AccountResponse = {
  user?: AuthUser;
  error?: string;
};

const panel = "glass rounded-3xl p-5 min-h-0";

export function UsersTab({
  currentUser,
  onUserChange,
}: {
  currentUser: AuthUser;
  onUserChange: (user: AuthUser) => void;
}) {
  const [name, setName] = useState(currentUser.name);
  const [email, setEmail] = useState(currentUser.email);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);

  async function saveAccount(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaved("");

    if (pin && !/^\d{4}$/.test(pin)) {
      setError("PIN은 숫자 4자리로 입력해 주세요.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/auth/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: currentUser.id,
          name,
          email,
          ...(pin ? { password: pin } : {}),
        }),
      });
      const data = (await response.json()) as AccountResponse;
      if (!response.ok) throw new Error(data.error ?? "저장에 실패했습니다.");

      if (data.user) {
        onUserChange(data.user);
        setName(data.user.name);
        setEmail(data.user.email);
      }
      setPin("");
      setSaved("저장되었습니다.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${panel} flex h-full flex-col overflow-hidden`}>
      <div className="flex shrink-0 items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-fg">계정 설정</h2>
        <span className="rounded-full bg-accent/15 px-2.5 py-1 text-xs font-medium text-accent">
          {currentUser.role === "admin" ? "관리자" : "사용자"}
        </span>
      </div>

      <form onSubmit={saveAccount} className="mt-4 grid max-w-xl shrink-0 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-muted">사용자 이름</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-surface-strong px-3 py-2 text-sm text-fg outline-none placeholder:text-muted"
            autoComplete="name"
            required
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-muted">이메일</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-surface-strong px-3 py-2 text-sm text-fg outline-none placeholder:text-muted"
            autoComplete="email"
            required
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-muted">PIN 번호 변경</span>
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="숫자 4자리"
            className="mt-1 w-full rounded-xl border border-border bg-surface-strong px-3 py-2 text-sm text-fg outline-none placeholder:text-muted"
            autoComplete="new-password"
            maxLength={4}
          />
        </label>

        {error && (
          <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        {saved && (
          <p role="status" className="rounded-xl bg-ok/10 px-3 py-2 text-sm text-ok">
            {saved}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-fit rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "저장 중..." : "저장"}
        </button>
      </form>
    </section>
  );
}
