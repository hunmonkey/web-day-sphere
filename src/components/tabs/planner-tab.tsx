"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState, type FormEvent } from "react";
import { MonthCalendar } from "@/components/planner/month-calendar";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { localDateStr, longDate } from "@/lib/date";

type Task = {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // "" 또는 HH:MM
  title: string;
  done: boolean;
};

const seedTasks: Task[] = [
  { id: "t1", date: "2026-06-26", time: "", title: "보고서 정리", done: false },
  { id: "t2", date: "2026-06-27", time: "15:00", title: "팀 미팅", done: false },
];

const panel = "glass rounded-3xl p-5 min-h-0";

export function PlannerTab() {
  const [tasks, setTasks] = usePersistentState<Task[]>("ds.tasks", seedTasks);
  const [today, setToday] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<{ y: number; m: number } | null>(null);
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");

  // 마운트 후 오늘 날짜 확정(하이드레이션 보호)
  useEffect(() => {
    const d = new Date();
    setToday(localDateStr(d));
    setSelected(localDateStr(d));
    setView({ y: d.getFullYear(), m: d.getMonth() });
  }, []);

  if (!view || !selected) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted">
        불러오는 중…
      </div>
    );
  }

  const counts = new Map<string, number>();
  for (const t of tasks) counts.set(t.date, (counts.get(t.date) ?? 0) + 1);
  const dayTasks = tasks
    .filter((t) => t.date === selected)
    .sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));

  function addTask(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t || !selected) return;
    setTasks((prev) => [
      ...prev,
      { id: crypto.randomUUID(), date: selected, time, title: t, done: false },
    ]);
    setTitle("");
    setTime("");
  }

  function toggleTask(id: string) {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    );
  }

  function removeTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  function shiftMonth(delta: number) {
    setView((v) => {
      if (!v) return v;
      const d = new Date(v.y, v.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }

  const remaining = dayTasks.filter((t) => !t.done).length;

  return (
    <div className="grid h-full grid-cols-1 gap-4 lg:grid-cols-[3.5fr_6.5fr]">
      {/* 캘린더 */}
      <section className={panel}>
        <MonthCalendar
          year={view.y}
          month={view.m}
          today={today}
          selected={selected}
          counts={counts}
          onSelect={setSelected}
          onPrev={() => shiftMonth(-1)}
          onNext={() => shiftMonth(1)}
        />
      </section>

      {/* 선택한 날의 할 일 */}
      <section className={`${panel} flex flex-col`}>
        <div className="flex shrink-0 items-center justify-between">
          <h3 className="text-base font-semibold text-fg">{longDate(selected)}</h3>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              remaining > 0 ? "bg-accent/15 text-accent" : "bg-neutral/15 text-neutral"
            }`}
          >
            {dayTasks.length === 0
              ? "할 일 없음"
              : remaining > 0
                ? `${remaining}개 남음`
                : "모두 완료"}
          </span>
        </div>

        <form onSubmit={addTask} className="mt-4 shrink-0 space-y-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="할 일 내용"
            placeholder="할 일을 입력"
            className="w-full rounded-xl border border-border bg-surface-strong px-3.5 py-2 text-sm text-fg placeholder:text-muted"
          />
          <div className="flex gap-2">
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              aria-label="시간 (선택)"
              className="min-w-0 flex-1 rounded-xl border border-border bg-surface-strong px-3 py-2 text-sm text-fg"
            />
            <button
              type="submit"
              disabled={!title.trim()}
              className="shrink-0 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
            >
              추가
            </button>
          </div>
        </form>

        <ul className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto">
          <AnimatePresence initial={false}>
            {dayTasks.map((t) => (
              <motion.li
                key={t.id}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-center gap-3"
              >
                <button
                  type="button"
                  onClick={() => toggleTask(t.id)}
                  aria-pressed={t.done}
                  aria-label={t.done ? `${t.title} 완료 해제` : `${t.title} 완료 표시`}
                  className={`flex size-5 shrink-0 items-center justify-center rounded-md border text-xs ${
                    t.done
                      ? "border-ok bg-ok/15 text-ok"
                      : "border-border text-transparent"
                  }`}
                >
                  ✓
                </button>
                {t.time && (
                  <span className="shrink-0 text-xs font-medium tabular-nums text-accent">
                    {t.time}
                  </span>
                )}
                <span
                  className={`flex-1 text-sm ${
                    t.done ? "text-muted line-through" : "text-fg"
                  }`}
                >
                  {t.title}
                </span>
                <button
                  type="button"
                  onClick={() => removeTask(t.id)}
                  aria-label={`${t.title} 삭제`}
                  className="shrink-0 rounded-md px-1.5 text-sm text-muted opacity-60 transition hover:text-danger hover:opacity-100"
                >
                  ✕
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
          {dayTasks.length === 0 && (
            <li className="text-sm text-muted">이 날의 할 일이 없습니다.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
