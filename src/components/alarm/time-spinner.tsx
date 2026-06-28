"use client";

const p2 = (n: number) => String(n).padStart(2, "0");

// 자리별 순환 한계(모듈러): [시 십, 시 일, 분 십, 분 일, 초 십, 초 일]
const MOD = [3, 10, 6, 10, 6, 10];
const LABELS = [
  "시 십의 자리",
  "시 일의 자리",
  "분 십의 자리",
  "분 일의 자리",
  "초 십의 자리",
  "초 일의 자리",
];

function toDigits(value: string): number[] {
  const [h, m, s] = value.split(":").map((n) => Number(n) || 0);
  return [
    Math.floor(h / 10),
    h % 10,
    Math.floor(m / 10),
    m % 10,
    Math.floor(s / 10),
    s % 10,
  ];
}

function toValue(d: number[]): string {
  return `${p2(d[0] * 10 + d[1])}:${p2(d[2] * 10 + d[3])}:${p2(d[4] * 10 + d[5])}`;
}

/** 한 자리 숫자만 1씩 증감(순환). 결과가 무효 시각(24시 이상)이면 자동 보정. */
function step(value: string, idx: number, dir: 1 | -1): string {
  const d = toDigits(value);
  d[idx] = (d[idx] + dir + MOD[idx]) % MOD[idx];
  // 시(時) 유효 보정: 20~23만 허용(시 십의자리가 2면 일의자리는 0~3에서만 순환)
  if (d[0] === 2 && d[1] > 3) {
    d[1] = idx === 1 ? (dir > 0 ? 0 : 3) : 3;
  }
  return toValue(d);
}

/**
 * HH:MM:SS 자리별 증감 입력.
 * 각 숫자 칸마다 위(▲)·아래(▼) 삼각형이 있고, 그 자리 숫자만 1씩 오르내린다.
 * (예: 시 십의자리 ▲ → 0→1→2, 화면 숫자는 1 올랐지만 실제로는 10시간 단위 변화)
 */
export function TimeSpinner({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const digits = toDigits(value);

  const cell = (idx: number) => (
    <div className="flex flex-col items-center">
      <button
        type="button"
        aria-label={`${LABELS[idx]} 1 증가`}
        disabled={disabled}
        onClick={() => onChange(step(value, idx, 1))}
        className="text-[10px] leading-none text-muted transition-colors hover:text-accent disabled:opacity-30"
      >
        ▲
      </button>
      <span className="my-0.5 text-lg font-semibold tabular-nums text-fg">
        {digits[idx]}
      </span>
      <button
        type="button"
        aria-label={`${LABELS[idx]} 1 감소`}
        disabled={disabled}
        onClick={() => onChange(step(value, idx, -1))}
        className="text-[10px] leading-none text-muted transition-colors hover:text-accent disabled:opacity-30"
      >
        ▼
      </button>
    </div>
  );

  const colon = (
    <span className="px-0.5 text-lg font-semibold text-muted">:</span>
  );

  return (
    <div className={`flex items-center ${disabled ? "opacity-60" : ""}`}>
      {cell(0)}
      {cell(1)}
      {colon}
      {cell(2)}
      {cell(3)}
      {colon}
      {cell(4)}
      {cell(5)}
    </div>
  );
}
