"use client";

import { useState } from "react";
import { DevicePrefsSection } from "@/components/tabs/device-prefs-section";
import { ObsidianTab } from "@/components/tabs/obsidian-tab";
import { UsersTab } from "@/components/tabs/users-tab";
import type { AuthUser } from "@/lib/auth-types";
import type { DeviceKind, DevicePrefs, ThemeMode } from "@/lib/device-prefs";

type Section = "device" | "obsidian" | "account";

/**
 * 설정 탭: 화면/기기 + Obsidian 동기화 + 계정 설정을 하나로 묶는다.
 * 한 화면 고정 규칙을 지키기 위해 내용을 쌓지 않고 하위 탭으로 전환한다.
 */
export function SettingsTab({
  currentUser,
  onUserChange,
  prefs,
  onChangePrefs,
  themeMode,
  onChangeThemeMode,
  deviceKind,
}: {
  currentUser: AuthUser;
  onUserChange: (user: AuthUser) => void;
  prefs: DevicePrefs;
  onChangePrefs: (next: DevicePrefs) => Promise<void>;
  themeMode: ThemeMode;
  onChangeThemeMode: (next: ThemeMode) => Promise<void>;
  deviceKind: DeviceKind | null;
}) {
  const isAdmin = currentUser.role === "admin";
  const [section, setSection] = useState<Section>("device");
  const active = section;

  const sub: { id: Section; label: string }[] = [
    { id: "device", label: "화면/기기" },
    { id: "obsidian", label: "Obsidian 동기화" },
    { id: "account", label: "계정" },
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
        {active === "account" && (
          <UsersTab currentUser={currentUser} onUserChange={onUserChange} />
        )}
      </div>
    </div>
  );
}
