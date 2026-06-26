"use client";

import { monthGrid } from "@/lib/date";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

type Props = {
  year: number;
  month: number; // 0-11
  today: string | null;
  selected: string;
  counts: Map<string, number>;
  onSelect: (date: string) => void;
  onPrev: () => void;
  onNext: () => void;
};

export function MonthCalendar({
  year,
  month,
  today,
  selected,
  counts,
  onSelect,
  onPrev,
  onNext,
}: Props) {
  const cells = monthGrid(year, month);

  return (
    <div className="flex h-full flex-col">
      {/* 월 이동 */}
      <div className="flex shrink-0 items-center justify-between">
        <h2 className="text-lg font-semibold text-fg">
          {year}년 {month + 1}월
        </h2>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onPrev}
            aria-label="이전 달"
            className="rounded-lg border border-border px-2.5 py-1 text-sm text-muted transition-colors hover:bg-surface-strong hover:text-fg"
          >
            ◀
          </button>
          <button
            type="button"
            onClick={onNext}
            aria-label="다음 달"
            className="rounded-lg border border-border px-2.5 py-1 text-sm text-muted transition-colors hover:bg-surface-strong hover:text-fg"
          >
            ▶
          </button>
        </div>
      </div>

      {/* 요일 */}
      <div className="mt-3 grid shrink-0 grid-cols-7 gap-1 text-center text-xs font-medium">
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            className={
              i === 0 ? "text-danger" : i === 6 ? "text-accent" : "text-muted"
            }
          >
            {w}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 (남은 높이를 꽉 채움) */}
      <div className="mt-1 grid min-h-0 flex-1 grid-cols-7 grid-rows-6 gap-1">
        {cells.map((date, idx) =>
          date === null ? (
            <div key={`empty-${idx}`} />
          ) : (
            <button
              key={date}
              type="button"
              onClick={() => onSelect(date)}
              aria-pressed={date === selected}
              aria-label={date}
              className={`relative flex flex-col items-center justify-center rounded-lg border text-sm transition-colors ${
                date === selected
                  ? "border-transparent bg-accent font-semibold text-accent-fg"
                  : date === today
                    ? "border-accent/60 text-fg hover:bg-surface-strong"
                    : "border-transparent text-muted hover:bg-surface-strong"
              }`}
            >
              {Number(date.split("-")[2])}
              {(counts.get(date) ?? 0) > 0 && (
                <span
                  className={`absolute bottom-1.5 rounded-full px-1.5 text-[10px] font-semibold leading-4 ${
                    date === selected
                      ? "bg-accent-fg/25 text-accent-fg"
                      : "bg-accent/15 text-accent"
                  }`}
                >
                  {counts.get(date)}
                </span>
              )}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
