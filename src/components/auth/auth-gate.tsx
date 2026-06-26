"use client";

import { useState, type FormEvent } from "react";

type Props = {
  mode: "setup" | "login";
};

export function AuthGate({ mode }: Props) {
  const [name, setName] = useState("황재훈");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isSetup = mode === "setup";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (isSetup && !/^\d{4}$/.test(password)) {
      setError("비밀번호는 숫자 4자리여야 합니다.");
      return;
    }
    if (isSetup && password !== confirm) {
      setError("비밀번호 확인이 맞지 않습니다.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(isSetup ? "/api/auth/setup" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isSetup ? { name, email, password } : { email, password },
        ),
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
      <section className="glass flex w-full max-w-md flex-col rounded-3xl p-6 shadow-2xl">
        <div className="mb-6">
          <p className="text-sm font-medium text-accent">Day Sphere</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-fg">
            {isSetup ? "첫 관리자 설정" : "로그인"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            {isSetup
              ? "처음 사용할 관리자 계정을 만들면 앱이 잠깁니다."
              : "허용된 사용자만 Day Sphere에 들어갈 수 있습니다."}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {isSetup && (
            <label className="block">
              <span className="text-xs font-medium text-muted">이름</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-surface-strong px-3.5 py-2.5 text-sm text-fg outline-none placeholder:text-muted"
                autoComplete="name"
              />
            </label>
          )}

          <label className="block">
            <span className="text-xs font-medium text-muted">이메일</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-surface-strong px-3.5 py-2.5 text-sm text-fg outline-none placeholder:text-muted"
              autoComplete="email"
              required
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-muted">비밀번호</span>
            <input
              type="password"
              inputMode={isSetup ? "numeric" : undefined}
              value={password}
              onChange={(e) =>
                setPassword(
                  isSetup ? e.target.value.replace(/\D/g, "").slice(0, 4) : e.target.value,
                )
              }
              className="mt-1 w-full rounded-xl border border-border bg-surface-strong px-3.5 py-2.5 text-sm text-fg outline-none placeholder:text-muted"
              autoComplete={isSetup ? "new-password" : "current-password"}
              placeholder={isSetup ? "숫자 4자리" : undefined}
              maxLength={isSetup ? 4 : undefined}
              required
            />
          </label>

          {isSetup && (
            <label className="block">
              <span className="text-xs font-medium text-muted">비밀번호 확인</span>
              <input
                type="password"
                inputMode="numeric"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className="mt-1 w-full rounded-xl border border-border bg-surface-strong px-3.5 py-2.5 text-sm text-fg outline-none placeholder:text-muted"
                autoComplete="new-password"
                placeholder="숫자 4자리"
                maxLength={4}
                required
              />
            </label>
          )}

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
            {loading ? "처리 중..." : isSetup ? "관리자 만들기" : "들어가기"}
          </button>
        </form>
      </section>
    </main>
  );
}

