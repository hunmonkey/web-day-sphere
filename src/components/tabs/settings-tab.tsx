"use client";

import { useState } from "react";
import { DevicePrefsSection } from "@/components/tabs/device-prefs-section";
import { ObsidianTab } from "@/components/tabs/obsidian-tab";
import { UsersTab } from "@/components/tabs/users-tab";
import type { AuthUser } from "@/lib/auth-types";
import type { DeviceKind, DevicePrefs, ThemeMode } from "@/lib/device-prefs";

type Section = "device" | "obsidian" | "users";

/**
 * 설정 탭: 화면/기기 + Obsidian 동기화 + 사용자 관리를 하나로 묶는다.
 * 한 화면 고정 규칙을 지키기 위해 내용을 쌓지 않고 하위 탭으로 전환한다.
 * 사용자 관리는 관리자 전용이라, 일반 사용자에게는 그 하위 탭을 숨긴다.
 */
export function SettingsTab({
  currentUser,
  initialUsers,
  prefs,
  onChangePrefs,
  themeMode,
  onChangeThemeMode,
  deviceKind,
}: {
  currentUser: AuthUser;
  initialUsers: AuthUser[];
  prefs: DevicePrefs;
  onChangePrefs: (next: DevicePrefs) => Promise<void>;
  themeMode: ThemeMode;
  onChangeThemeMode: (next: ThemeMode) => Promise<void>;
  deviceKind: DeviceKind | null;
}) {
  const isAdmin = currentUser.role === "admin";
  const [section, setSection] = useState<Section>("device");
  const active: Section = section === "users" && !isAdmin ? "device" : section;

  const sub: { id: Section; label: string }[] = [
    { id: "device", label: "화면/기기" },
    { id: "obsidian", label: "Obsidian 동기화" },
    ...(isAdmin ? [{ id: "users" as const, label: "사용자 관리" }] : []),
  ];

  return (
    <div className="flex h-full flex-col">
      <div role="tablist" aria-label="설정 항목" className="mb-3 flex shrink-0 gap-1">
        {sub.map((s) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={active === s.id}
            onClick={() => setSection(s.id)}
            className={`rounded-xl px-4 py-1.5 text-sm font-medium transition-colors ${
              active === s.id
                ? "bg-accent text-accent-fg"
                : "border border-border text-muted hover:bg-surface-strong hover:text-fg"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1">
        {active === "device" && (
          <DevicePrefsSection
            prefs={prefs}
            onChange={onChangePrefs}
            themeMode={themeMode}
            onChangeThemeMode={onChangeThemeMode}
            deviceKind={deviceKind}
          />
        )}
        {active === "obsidian" && <ObsidianTab canManageVault={isAdmin} />}
        {active === "users" && isAdmin && (
          <UsersTab currentUser={currentUser} initialUsers={initialUsers} />
        )}
      </div>
    </div>
  );
}
