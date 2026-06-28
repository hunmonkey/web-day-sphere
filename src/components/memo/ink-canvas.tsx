"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { InkPoint, InkStroke } from "@/lib/vault-types";
import { checkHandwritingSupport, recognizeStrokes } from "@/lib/handwriting";

export type { InkPoint, InkStroke };

type Props = {
  strokes: InkStroke[];
  onChange: (strokes: InkStroke[]) => void;
  /** 손글씨를 텍스트로 변환했을 때 호출(메모 텍스트에 반영). 없으면 변환 버튼 숨김. */
  onConvert?: (text: string) => void;
  /** S펜 전용 모드 초기값(타블렛에서 손바닥 오터치 방지용으로 기본 ON). */
  defaultPenOnly?: boolean;
};

const VIEWBOX_WIDTH = 1000;
const VIEWBOX_HEIGHT = 600;
const INK_COLOR = "#5b8cff";

function pressureOf(e: PointerEvent<SVGSVGElement>) {
  if (e.pressure > 0) return Math.min(1, Math.max(0.1, e.pressure));
  return e.pointerType === "mouse" ? 0.55 : 0.45;
}

function pointFromEvent(e: PointerEvent<SVGSVGElement>, svg: SVGSVGElement) {
  const rect = svg.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * VIEWBOX_WIDTH,
    y: ((e.clientY - rect.top) / rect.height) * VIEWBOX_HEIGHT,
    pressure: pressureOf(e),
    t: e.timeStamp,
  };
}

function distance(a: InkPoint, b: InkPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function renderStroke(stroke: InkStroke) {
  const points = stroke.points;
  if (points.length === 0) return null;
  if (points.length === 1) {
    const p = points[0];
    return (
      <circle
        key={`${stroke.id}-dot`}
        cx={p.x}
        cy={p.y}
        r={(stroke.baseWidth * (0.5 + p.pressure)) / 2}
        fill={stroke.color}
      />
    );
  }

  return points.slice(1).map((p, index) => {
    const prev = points[index];
    const width = stroke.baseWidth * (0.5 + Math.max(prev.pressure, p.pressure));
    return (
      <line
        key={`${stroke.id}-${index}`}
        x1={prev.x}
        y1={prev.y}
        x2={p.x}
        y2={p.y}
        stroke={stroke.color}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  });
}

export function InkCanvas({ strokes, onChange, onConvert, defaultPenOnly = false }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [active, setActive] = useState<InkStroke | null>(null);
  const [penOnly, setPenOnly] = useState(defaultPenOnly);
  const [baseWidth, setBaseWidth] = useState(6);
  const [support, setSupport] = useState<boolean | null>(null);
  const [converting, setConverting] = useState(false);
  const [convertMsg, setConvertMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void checkHandwritingSupport(["ko"]).then((ok) => {
      if (alive) setSupport(ok);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function convert() {
    if (strokes.length === 0) return;
    setConverting(true);
    setConvertMsg(null);
    try {
      const text = await recognizeStrokes(strokes, {
        inputType: penOnly ? "stylus" : "mouse",
      });
      const clean = text.trim();
      if (clean) {
        onConvert?.(clean);
        setConvertMsg(`변환됨: ${clean.slice(0, 40)}`);
      } else {
        setConvertMsg("인식된 글자가 없습니다.");
      }
    } catch (error) {
      setConvertMsg((error as Error).message);
    } finally {
      setConverting(false);
    }
  }

  function beginStroke(e: PointerEvent<SVGSVGElement>) {
    if (penOnly && e.pointerType !== "pen") return;
    if (e.pointerType === "touch" && penOnly) return;
    const svg = svgRef.current;
    if (!svg) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setActive({
      id: crypto.randomUUID(),
      color: INK_COLOR,
      baseWidth,
      input: e.pointerType,
      points: [pointFromEvent(e, svg)],
    });
  }

  function continueStroke(e: PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg || !active || e.pointerId === undefined) return;
    e.preventDefault();
    const nextPoint = pointFromEvent(e, svg);
    setActive((prev) => {
      if (!prev) return prev;
      const last = prev.points[prev.points.length - 1];
      if (last && distance(last, nextPoint) < 1.5) return prev;
      return { ...prev, points: [...prev.points, nextPoint] };
    });
  }

  function endStroke(e: PointerEvent<SVGSVGElement>) {
    if (!active) return;
    e.preventDefault();
    if (active.points.length > 0) onChange([...strokes, active]);
    setActive(null);
  }

  const visibleStrokes = active ? [...strokes, active] : strokes;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted">
            <input
              type="checkbox"
              checked={penOnly}
              onChange={(e) => setPenOnly(e.target.checked)}
              className="size-3.5 accent-[var(--accent)]"
            />
            S펜 전용
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted">
            굵기
            <input
              type="range"
              min="3"
              max="12"
              value={baseWidth}
              onChange={(e) => setBaseWidth(Number(e.target.value))}
              className="w-20 accent-[var(--accent)]"
              aria-label="손글씨 굵기"
            />
          </label>
        </div>
        <div className="flex items-center gap-1.5">
          {onConvert && (
            <button
              type="button"
              onClick={convert}
              disabled={converting || strokes.length === 0 || support === false}
              title={
                support === false
                  ? "이 브라우저/기기에서는 손글씨 변환 미지원"
                  : "손글씨를 텍스트로 변환"
              }
              className="rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {converting ? "변환 중…" : "텍스트로 변환"}
            </button>
          )}
          <button
            type="button"
            onClick={() => onChange(strokes.slice(0, -1))}
            disabled={strokes.length === 0}
            className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-strong hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
          >
            되돌리기
          </button>
          <button
            type="button"
            onClick={() => onChange([])}
            disabled={strokes.length === 0}
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            전체 지우기
          </button>
        </div>
      </div>

      {onConvert && (convertMsg || support === false) && (
        <p
          className={`shrink-0 truncate text-xs ${
            support === false ? "text-muted" : "text-accent"
          }`}
        >
          {convertMsg ??
            "이 브라우저/기기에서는 손글씨 변환을 지원하지 않습니다. (손글씨는 SVG로 저장됩니다)"}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-surface-strong">
        <svg
          ref={svgRef}
          role="img"
          aria-label="손글씨 입력 영역"
          viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
          preserveAspectRatio="none"
          className="h-full w-full cursor-crosshair touch-none"
          onPointerDown={beginStroke}
          onPointerMove={continueStroke}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          onPointerLeave={endStroke}
        >
          <rect width={VIEWBOX_WIDTH} height={VIEWBOX_HEIGHT} fill="transparent" />
          {visibleStrokes.map((stroke) => renderStroke(stroke))}
        </svg>
      </div>
    </div>
  );
}

