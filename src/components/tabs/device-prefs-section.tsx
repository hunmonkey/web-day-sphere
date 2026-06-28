"use client";

import { useState } from "react";
import {
  DEVICE_KINDS,
  DEVICE_LABELS,
  TAB_IDS,
  TAB_LABELS,
  type DeviceKind,
  type DevicePrefs,
  type TabId,
} from "@/lib/device-prefs";

/**
 * 화면 · 기기 설정.
 * 기기(폰/타블렛/PC)마다 앱을 켰을 때 먼저 보일 탭(시작 탭)을 고른다.
 * 값은 서버에 저장되어 모든 기기가 공유한다.
 */
export function DevicePrefsSection({
  prefs,
  onChange,
  deviceKind,
}: {
  prefs: DevicePrefs;
  onChange: (next: DevicePrefs) => Promise<void>;
  deviceKind: DeviceKind | null;
}) {
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function setStartTab(kind: DeviceKind, startTab: TabId) {
    if (prefs[kind].startTab === startTab) return;
    const next: DevicePrefs = { ...prefs, [kind]: { startTab } };
    setSaving(true);
    setNotice(null);
    try {
      await onChange(next);
      setNotice("저장되었습니다.");
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="glass flex h-full flex-col rounded-3xl p-5">
      <div className="shrink-0">
        <h2 className="text-base font-semibold text-fg">화면 · 기기</h2>
        <p className="mt-0.5 text-xs text-muted">
          기기마다 앱을 켰을 때 먼저 보일 탭을 정합니다. 이 설정은 모든 기기가 공유합니다.
        </p>
      </div>

      <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto">
        {DEVICE_KINDS.map((kind) => (
          <div
            key={kind}
            className="rounded-2xl border border-border bg-surface-strong p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-fg">{DEVICE_LABELS[kind]}</span>
              {deviceKind === kind && (
                <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent">
                  지금 이 기기
                </span>
              )}
            </div>
            <p className="mt-2 text-xs text-muted">시작 탭</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {TAB_IDS.map((id) => {
                const on = prefs[kind].startTab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => void setStartTab(kind, id)}
                    aria-pressed={on}
                    disabled={saving}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
                      on
                        ? "bg-accent text-accent-fg"
                        : "border border-border text-muted hover:bg-surface-solid hover:text-fg"
                    }`}
                  >
                    {TAB_LABELS[id]}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {(saving || notice) && (
        <p
          className={`mt-3 shrink-0 text-xs ${
            saving
              ? "text-muted"
              : notice === "저장되었습니다."
                ? "text-ok"
                : "text-danger"
          }`}
        >
          {saving ? "저장 중…" : notice}
        </p>
      )}
    </section>
  );
}
