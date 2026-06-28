"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Greeting } from "@/components/dashboard/greeting";
import { PlannerTab } from "@/components/tabs/planner-tab";
import { MemoTab } from "@/components/tabs/memo-tab";
import { AlarmTab } from "@/components/tabs/alarm-tab";
import { SettingsTab } from "@/components/tabs/settings-tab";
import { useVault } from "@/components/vault/vault-provider";
import { useDeviceKind } from "@/hooks/use-device-kind";
import { beep, fmtAt, nowHHMMSS } from "@/lib/alarm";
import type { AuthUser } from "@/lib/auth-types";
import type { DevicePrefs, TabId, ThemeMode } from "@/lib/device-prefs";

const TABS: { id: TabId; label: string; short: string }[] = [
  { id: "planner", label: "플래너", short: "플래너" },
  { id: "memo", label: "메모", short: "메모" },
  { id: "alarm", label: "알람", short: "알람" },
  { id: "settings", label: "설정", short: "설정" },
];

/**
 * 한 화면 고정 앱 셸(절대 규칙: 페이지 스크롤 금지).
 * 헤더 + 탭바 + 본문, 본문만 남은 높이를 채운다.
 * 알람 발화 감시는 셸에 상주(초 단위)해 어느 탭에 있든 동작한다.
 */
export function AppShell({
  currentUser,
  initialUsers,
  initialPrefs,
  initialThemeMode,
}: {
  currentUser: AuthUser;
  initialUsers: AuthUser[];
  initialPrefs: DevicePrefs;
  initialThemeMode: ThemeMode;
}) {
  const [tab, setTab] = useState<TabId>("planner");
  const [prefs, setPrefs] = useState<DevicePrefs>(initialPrefs);
  const [themeMode, setThemeMode] = useState<ThemeMode>(initialThemeMode);
  const workMode = themeMode === "work";
  const { alarms, setAlarms } = useVault();
  const deviceKind = useDeviceKind();
  const [ringing, setRinging] = useState<string | null>(null);

  const firedAt = useRef("");
  const alarmsRef = useRef(alarms);
  const startTabApplied = useRef(false);

  useEffect(() => {
    alarmsRef.current = alarms;
  }, [alarms]);

  // 업무 모드 on/off를 <html data-theme>에 반영(전역 CSS 토큰 오버라이드 트리거).
  useEffect(() => {
    const root = document.documentElement;
    if (workMode) root.setAttribute("data-theme", "work");
    else root.removeAttribute("data-theme");
  }, [workMode]);

  // 기기 유형이 확정되면 해당 기기의 시작 탭을 1회 적용(이후 사용자의 탭 전환은 존중).
  useEffect(() => {
    if (startTabApplied.current || !deviceKind) return;
    startTabApplied.current = true;
    setTab(prefs[deviceKind].startTab);
  }, [deviceKind, prefs]);

  const changePrefs = useCallback(async (next: DevicePrefs) => {
    setPrefs(next);
    const res = await fetch("/api/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ devicePrefs: next }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      throw new Error(json?.error ?? "저장에 실패했습니다.");
    }
  }, []);

  const changeThemeMode = useCallback(
    async (next: ThemeMode) => {
      if (themeMode === next) return;
      const previous = themeMode;
      setThemeMode(next);
      const res = await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ themeMode: next }),
      });
      if (!res.ok) {
        setThemeMode(previous);
        const json = await res.json().catch(() => null);
        throw new Error(json?.error ?? "저장에 실패했습니다.");
      }
      const json = (await res.json().catch(() => null)) as { themeMode?: ThemeMode } | null;
      if (json?.themeMode) setThemeMode(json.themeMode);
    },
    [themeMode],
  );

  useEffect(() => {
    const id = setInterval(() => {
      const now = nowHHMMSS();
      const hit = alarmsRef.current.some((a) => a.on && a.at === now);
      if (hit) {
        if (firedAt.current !== now) {
          firedAt.current = now;
          setRinging(now);
          beep();
        }
      } else {
        firedAt.current = "";
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden px-5 py-4 sm:px-8 sm:py-5">
      {/* 전역 알람 배너 (어느 탭이든 표시) */}
      {ringing && (
        <div
          role="alert"
          className="absolute left-1/2 top-3 z-50 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-accent/40 bg-surface-solid/95 px-4 py-2.5 text-sm shadow-lg backdrop-blur"
        >
          <span className="animate-pulse font-medium text-accent">
            ⏰ 알람 · {fmtAt(ringing)}
          </span>
          <button
            type="button"
            onClick={() => setRinging(null)}
            className="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-accent-fg transition-colors hover:bg-accent-strong"
          >
            끄기
          </button>
        </div>
      )}

      {/* 헤더 + 탭바 (한 줄 통합: 날짜·시각 | 탭 | 사용자 | 로그아웃) */}
      <div className="mb-4 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2">
        <Greeting />
        <nav
          role="tablist"
          aria-label="화면 전환"
          className="order-last flex w-full min-w-0 flex-1 gap-1 rounded-2xl glass p-1 sm:order-none sm:w-auto"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`min-w-0 flex-1 truncate rounded-xl px-2 py-1.5 text-xs font-medium transition-colors sm:px-4 sm:text-sm ${
                tab === t.id
                  ? "bg-accent text-accent-fg"
                  : "text-muted hover:bg-surface-strong hover:text-fg"
              }`}
            >
              {deviceKind === "mobile" ? t.short : t.label}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => {
              void changeThemeMode(workMode ? "normal" : "work").catch(() => undefined);
            }}
            aria-pressed={workMode}
            title={workMode ? "기본 테마로 전환" : "업무 모드로 전환"}
            className={`rounded-full border px-3 py-1.5 transition-colors ${
              workMode
                ? "border-accent bg-accent text-accent-fg"
                : "border-border text-muted hover:bg-surface-strong hover:text-fg"
            }`}
          >
            업무 모드
          </button>
          <span className="max-w-[140px] truncate rounded-full border border-border bg-surface-strong px-3 py-1.5 text-muted">
            {currentUser.name}
          </span>
          <button
            type="button"
            onClick={logout}
            className="rounded-full border border-border px-3 py-1.5 text-muted transition-colors hover:bg-surface-strong hover:text-fg"
          >
            로그아웃
          </button>
        </div>
      </div>

      {/* 본문 (남은 높이를 채움, 페이지가 아닌 패널 내부에서만 스크롤) */}
      <main className="min-h-0 flex-1 overflow-hidden">
        {tab === "planner" && <PlannerTab deviceKind={deviceKind} />}
        {tab === "memo" && <MemoTab deviceKind={deviceKind} />}
        {tab === "alarm" && <AlarmTab alarms={alarms} setAlarms={setAlarms} />}
        {tab === "settings" && (
          <SettingsTab
            currentUser={currentUser}
            initialUsers={initialUsers}
            prefs={prefs}
            onChangePrefs={changePrefs}
            themeMode={themeMode}
            onChangeThemeMode={changeThemeMode}
            deviceKind={deviceKind}
          />
        )}
      </main>
    </div>
  );
}
