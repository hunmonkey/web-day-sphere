"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  useEffect,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import { fmtAt, nextUpcoming, nowHHMMSS, type Alarm } from "@/lib/alarm";

type Props = {
  alarms: Alarm[];
  setAlarms: Dispatch<SetStateAction<Alarm[]>>;
};

const QUICK: { label: string; seconds: number }[][] = [
  [
    { label: "30초", seconds: 30 },
    { label: "60초", seconds: 60 },
    { label: "90초", seconds: 90 },
  ],
  [
    { label: "5분", seconds: 300 },
    { label: "10분", seconds: 600 },
    { label: "15분", seconds: 900 },
    { label: "20분", seconds: 1200 },
    { label: "25분", seconds: 1500 },
    { label: "30분", seconds: 1800 },
  ],
  [
    { label: "1시간", seconds: 3600 },
    { label: "2시간", seconds: 7200 },
    { label: "3시간", seconds: 10800 },
    { label: "4시간", seconds: 14400 },
  ],
];

export function AlarmTab({ alarms, setAlarms }: Props) {
  const [time, setTime] = useState("");
  const [now, setNow] = useState<string | null>(null); // HH:MM:SS

  useEffect(() => {
    const tick = () => setNow(nowHHMMSS());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  function addAt(at: string) {
    setAlarms((prev) => [...prev, { id: crypto.randomUUID(), at, on: true }]);
  }

  function addManual(e: FormEvent) {
    e.preventDefault();
    if (!time) return;
    addAt(`${time}:00`);
    setTime("");
  }

  function quick(seconds: number) {
    addAt(nowHHMMSS(new Date(Date.now() + seconds * 1000)));
  }

  function toggleAlarm(id: string) {
    setAlarms((prev) => prev.map((a) => (a.id === id ? { ...a, on: !a.on } : a)));
  }

  function removeAlarm(id: string) {
    setAlarms((prev) => prev.filter((a) => a.id !== id));
  }

  const sorted = [...alarms].sort((a, b) => a.at.localeCompare(b.at));
  const onCount = sorted.filter((a) => a.on).length;
  const next = now
    ? nextUpcoming(alarms, now)
    : (sorted.find((a) => a.on)?.at ?? null);

  const clock = now
    ? (() => {
        const [h, m, s] = now.split(":");
        return `${h}시 ${m}분 ${s}초`;
      })()
    : "--시 --분 --초";

  return (
    <div className="flex h-full justify-center">
      <section className="glass flex h-full w-full max-w-xl flex-col rounded-3xl p-6">
        <div className="flex shrink-0 items-center justify-between">
          <h2 className="text-base font-semibold text-fg">알람</h2>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              onCount > 0 ? "bg-ok/15 text-ok" : "bg-neutral/15 text-neutral"
            }`}
          >
            {alarms.length === 0 ? "없음" : onCount > 0 ? "켜짐" : "꺼짐"}
          </span>
        </div>

        <p className="mt-4 shrink-0 text-sm text-muted">
          다음 알람
          <span className="ml-2 text-2xl font-semibold tracking-tight tabular-nums text-fg">
            {next ? fmtAt(next) : "없음"}
          </span>
        </p>

        {/* 입력 폼 + 현재 시각 */}
        <div className="mt-4 flex shrink-0 items-center gap-3">
          <form onSubmit={addManual} className="flex gap-2">
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              aria-label="알람 시간"
              className="w-32 rounded-xl border border-border bg-surface-strong px-3 py-2 text-sm text-fg"
            />
            <button
              type="submit"
              disabled={!time}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
            >
              추가
            </button>
          </form>
          <span className="text-sm tabular-nums text-muted">
            현재 <span className="font-medium text-fg">{clock}</span>
          </span>
        </div>

        {/* 빠른 추가 */}
        <div className="mt-4 shrink-0 space-y-1.5">
          <p className="text-xs text-muted">현재 시각 기준 빠른 추가</p>
          {QUICK.map((row, i) => (
            <div key={i} className="flex flex-wrap gap-1.5">
              {row.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => quick(q.seconds)}
                  className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent hover:bg-surface-strong hover:text-fg"
                >
                  {q.label}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* 목록 */}
        <ul className="mt-4 min-h-0 flex-1 space-y-1.5 overflow-y-auto">
          <AnimatePresence initial={false}>
            {sorted.map((a) => (
              <motion.li
                key={a.id}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-center gap-2"
              >
                <span
                  className={`flex-1 text-base tabular-nums ${
                    a.on ? "text-fg" : "text-muted line-through"
                  }`}
                >
                  {fmtAt(a.at)}
                </span>
                <button
                  type="button"
                  onClick={() => toggleAlarm(a.id)}
                  aria-pressed={a.on}
                  aria-label={a.on ? `${fmtAt(a.at)} 알람 끄기` : `${fmtAt(a.at)} 알람 켜기`}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    a.on ? "bg-ok/15 text-ok" : "bg-neutral/15 text-neutral"
                  }`}
                >
                  {a.on ? "켜짐" : "꺼짐"}
                </button>
                <button
                  type="button"
                  onClick={() => removeAlarm(a.id)}
                  aria-label={`${fmtAt(a.at)} 알람 삭제`}
                  className="shrink-0 rounded-md px-1.5 text-sm text-muted opacity-60 transition hover:text-danger hover:opacity-100"
                >
                  ✕
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
          {alarms.length === 0 && (
            <li className="text-sm text-muted">등록된 알람이 없습니다.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
