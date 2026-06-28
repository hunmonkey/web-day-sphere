"use client";

import { AnalogClock } from "@/components/alarm/analog-clock";
import { TimeSpinner } from "@/components/alarm/time-spinner";

/**
 * 다이얼 알람 박스 1개: [아날로그 시계] [HH:MM:SS 자리별 입력] [등록 / 초기화].
 * - 미등록: 시계 회색 비활성 + 입력 가능 + "등록" 활성.
 * - 등록됨: 시계 컬러 활성 + 입력 잠금 + "초기화" 활성.
 */
export function AlarmSlot({
  value,
  registered,
  onChange,
  onRegister,
  onReset,
}: {
  value: string;
  registered: boolean;
  onChange: (next: string) => void;
  onRegister: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 items-center gap-3 rounded-2xl border border-border bg-surface-strong px-3 py-2">
      <AnalogClock time={value} active={registered} />
      <TimeSpinner value={value} onChange={onChange} disabled={registered} />
      <div className="ml-auto flex shrink-0 flex-col items-stretch gap-1.5">
        <span
          className={`rounded-full px-2 py-0.5 text-center text-[11px] font-medium ${
            registered ? "bg-ok/15 text-ok" : "bg-neutral/15 text-neutral"
          }`}
        >
          {registered ? "켜짐" : "대기"}
        </span>
        <button
          type="button"
          onClick={onRegister}
          disabled={registered}
          className="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-accent-fg transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
        >
          등록
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={!registered}
          className="rounded-lg border border-border px-3 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-solid hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
        >
          초기화
        </button>
      </div>
    </div>
  );
}
