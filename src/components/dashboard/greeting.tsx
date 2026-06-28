"use client";

import { useEffect, useState } from "react";

const WD = ["일", "월", "화", "수", "목", "금", "토"];
const p2 = (n: number) => String(n).padStart(2, "0");

/** 최상단 날짜·시각 한 줄: "2026년 06월 26일 (금) 17:10" (클라이언트에서만 확정) */
export function Greeting() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, []);

  const text = now
    ? `${now.getFullYear()}년 ${p2(now.getMonth() + 1)}월 ${p2(now.getDate())}일 (${WD[now.getDay()]}) ${p2(now.getHours())}:${p2(now.getMinutes())}`
    : "";

  return (
    <h1 className="shrink-0 whitespace-nowrap text-xl font-semibold tracking-tight tabular-nums text-fg sm:text-2xl">
      {text || " "}
    </h1>
  );
}
