"use client";

/** 시계 중심(50,50) 기준 각도(12시=위)를 좌표로. */
function point(angleDeg: number, len: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: 50 + len * Math.cos(a), y: 50 + len * Math.sin(a) };
}

/**
 * 알람 시각을 가리키는 아날로그 시계(SVG, 의존성 0).
 * active=true 면 컬러로 활성, false 면 회색 음영으로 비활성.
 */
export function AnalogClock({
  time,
  active,
  size = 56,
}: {
  time?: string;
  active: boolean;
  size?: number;
}) {
  const [h, m, s] = (time ?? "0:0:0").split(":").map((n) => Number(n) || 0);
  const hour = point(((h % 12) + m / 60) * 30, 24);
  const min = point((m + s / 60) * 6, 34);
  const sec = point(s * 6, 36);

  const face = active ? "var(--fg)" : "var(--neutral)";
  const accent = active ? "var(--accent)" : "var(--neutral)";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={active && time ? `알람 ${time}` : "알람 미설정"}
      className={`shrink-0 ${active ? "" : "opacity-40"}`}
    >
      <circle
        cx="50"
        cy="50"
        r="46"
        fill="var(--surface-strong)"
        stroke="var(--border)"
        strokeWidth="2"
      />
      {Array.from({ length: 12 }).map((_, i) => {
        const a = point(i * 30, 40);
        const b = point(i * 30, 44);
        return (
          <line
            key={i}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={face}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        );
      })}
      <line x1="50" y1="50" x2={hour.x} y2={hour.y} stroke={face} strokeWidth="4" strokeLinecap="round" />
      <line x1="50" y1="50" x2={min.x} y2={min.y} stroke={face} strokeWidth="3" strokeLinecap="round" />
      <line x1="50" y1="50" x2={sec.x} y2={sec.y} stroke={accent} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="50" cy="50" r="3" fill={accent} />
    </svg>
  );
}
