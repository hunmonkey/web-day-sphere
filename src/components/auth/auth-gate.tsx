"use client";

import { useState, type FormEvent } from "react";

export function AuthGate() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!/^\d{4}$/.test(pin)) {
      setError("PIN은 숫자 4자리로 입력해 주세요.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "로그인에 실패했습니다.");
      window.location.href = "/";
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex h-full items-center justify-center overflow-hidden px-5 py-6">
      <section className="glass flex w-full max-w-sm flex-col rounded-3xl p-6 shadow-2xl">
        <div className="mb-6">
          <p className="text-sm font-medium text-accent">Day Sphere</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-fg">
            PIN 로그인
          </h1>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-muted">PIN 번호</span>
            <input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              className="mt-1 w-full rounded-xl border border-border bg-surface-strong px-3.5 py-2.5 text-center text-lg font-semibold tracking-[0.35em] text-fg outline-none placeholder:text-muted"
              autoComplete="current-password"
              placeholder="0000"
              maxLength={4}
              required
            />
          </label>

          {error && (
            <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "확인 중..." : "들어가기"}
          </button>
        </form>
      </section>
    </main>
  );
}
