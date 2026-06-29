"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Excalidraw, exportToSvg, restoreElements } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawScene, InkStroke } from "@/lib/vault-types";
import { inkToFreedrawSkeleton } from "@/lib/excalidraw-scene";

// 오프라인: 폰트를 외부 CDN이 아닌 self-host 경로(public/excalidraw-assets)에서 로드.
// 모듈 평가 시 1회 설정하면 폰트 로드(렌더) 시점에 적용된다.
if (typeof window !== "undefined") {
  (window as Window & { EXCALIDRAW_ASSET_PATH?: string }).EXCALIDRAW_ASSET_PATH =
    "/excalidraw-assets/";
}

type Props = {
  /** 저장된 그림(우선). */
  initialScene?: ExcalidrawScene;
  /** scene이 없을 때 변환할 (구) 손글씨. */
  legacyInk?: InkStroke[];
  /** 그림 변경 시(디바운스) 호출: 장면 원본 + 표시용 SVG. */
  onChange: (scene: ExcalidrawScene, svg: string) => void;
};

const SAVE_DEBOUNCE_MS = 700;

/** 슬림 독에서 쓰는 Excalidraw 명령형 API의 최소 표면. */
type ExcalidrawApi = {
  setActiveTool: (tool: { type: string; locked?: boolean }) => void;
  updateScene: (scene: {
    elements?: readonly unknown[];
    appState?: Record<string, unknown>;
  }) => void;
};

type DrawTool =
  | "pen"
  | "marker"
  | "rect"
  | "ellipse"
  | "line"
  | "arrow"
  | "eraser"
  | "select";

type StrokeStyle = "solid" | "dashed" | "dotted";

// Excalidraw 기본 팔레트(검정/빨강/초록/파랑/주황). 손글씨·형광 모두 여기서 고른다.
const STROKE_COLORS = ["#1e1e1e", "#e03131", "#2f9e44", "#1971c2", "#f08c00"];
const WIDTH_MIN = 1;
const WIDTH_MAX = 16;
const MARKER_WIDTH = 16; // 형광펜은 고정 굵기 + 반투명
const MARKER_OPACITY = 38;

const SHAPE_TOOLS: DrawTool[] = ["rect", "ellipse", "line", "arrow"];

// 우리 도구명 → Excalidraw 도구 타입.
const TOOL_TYPE: Record<DrawTool, string> = {
  pen: "freedraw",
  marker: "freedraw",
  rect: "rectangle",
  ellipse: "ellipse",
  line: "line",
  arrow: "arrow",
  eraser: "eraser",
  select: "selection",
};

export function DrawCanvas({ initialScene, legacyInk, onChange }: Props) {
  const [isFull, setIsFull] = useState(false);

  // 슬림 독 상태(이 컴포넌트가 도구 상태의 단일 출처).
  const [api, setApi] = useState<ExcalidrawApi | null>(null);
  const [tool, setTool] = useState<DrawTool>("pen");
  const [color, setColor] = useState(STROKE_COLORS[0]);
  const [width, setWidth] = useState(2);
  const [smooth, setSmooth] = useState(true); // 부드럽게(roughness 0) — 손글씨 기본
  const [style, setStyle] = useState<StrokeStyle>("solid");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shapesOpen, setShapesOpen] = useState(false);

  const shellRef = useRef<HTMLDivElement | null>(null);

  // 초기 elements: 저장된 scene 우선, 없으면 (구) 손글씨를 freedraw로 복원.
  // 메모별로 key를 줘 새 인스턴스로 마운트되므로 1회 계산으로 충분.
  const initialData = useMemo(() => {
    if (initialScene && initialScene.elements.length > 0) {
      return {
        elements: initialScene.elements,
        files: initialScene.files,
        scrollToContent: true,
      };
    }
    if (legacyInk && legacyInk.length > 0) {
      const restored = restoreElements(
        inkToFreedrawSkeleton(legacyInk) as never,
        null,
      );
      return { elements: restored, scrollToContent: true };
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const latest = useRef<{
    elements: readonly unknown[];
    appState: unknown;
    files: unknown;
  } | null>(null);
  const timer = useRef<number | null>(null);

  // onChange를 ref로 잡아 flush/handleChange/cleanup effect를 '안정적으로' 유지한다.
  // (부모가 매 렌더 새 onChange를 넘겨도 flush가 재생성되지 않게 — 무한 리렌더 루프 방지)
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const flush = useCallback(async () => {
    const cur = latest.current;
    if (!cur) return;
    let svg = "";
    try {
      const el = await exportToSvg({
        elements: cur.elements as never,
        appState: cur.appState as never,
        files: cur.files as never,
        exportPadding: 12,
      });
      svg = new XMLSerializer().serializeToString(el);
    } catch {
      // SVG 생성 실패해도 장면은 저장한다.
    }
    onChangeRef.current(
      {
        elements: [...cur.elements],
        files: (cur.files as Record<string, unknown>) ?? undefined,
      },
      svg,
    );
  }, []);

  const handleChange = useCallback(
    (elements: readonly unknown[], appState: unknown, files: unknown) => {
      latest.current = { elements, appState, files };
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
    },
    [flush],
  );

  // 언마운트 시 보류 중인 변경을 즉시 저장(메모 전환·탭 이동에도 유실 없게).
  useEffect(() => {
    return () => {
      if (timer.current) {
        window.clearTimeout(timer.current);
        void flush();
      }
    };
  }, [flush]);

  // 도구·펜 설정이 바뀔 때마다 Excalidraw에 반영. 펜/형광펜/도형은 locked로
  // 한 획마다 풀리지 않게 하여 연속 필기가 가능하고, 독과 상태가 어긋나지 않는다.
  useEffect(() => {
    if (!api) return;
    const isMarker = tool === "marker";
    const locked = tool !== "select" && tool !== "eraser";
    api.setActiveTool({ type: TOOL_TYPE[tool], locked });
    api.updateScene({
      appState: {
        currentItemStrokeColor: color,
        currentItemStrokeWidth: isMarker ? MARKER_WIDTH : width,
        currentItemOpacity: isMarker ? MARKER_OPACITY : 100,
        currentItemRoughness: smooth ? 0 : 1,
        currentItemStrokeStyle: style,
      },
    });
  }, [api, tool, color, width, smooth, style]);

  // 되돌리기/다시실행: 네이티브 UI를 숨겼으므로 Excalidraw 컨테이너에
  // Ctrl+Z / Ctrl+Shift+Z 키 이벤트를 보내 내장 히스토리를 그대로 활용한다.
  const undoRedo = useCallback((redo: boolean) => {
    const root =
      shellRef.current?.querySelector<HTMLElement>(".excalidraw") ?? null;
    const target: EventTarget = root ?? document;
    target.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "z",
        code: "KeyZ",
        ctrlKey: true,
        metaKey: true,
        shiftKey: redo,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, []);

  const chooseTool = useCallback((t: DrawTool) => {
    setTool(t);
    setShapesOpen(false);
  }, []);

  const shellBase = isFull
    ? "fixed inset-0 z-[60] bg-white"
    : "relative min-h-0 flex-1 overflow-hidden rounded-xl border border-border";

  return (
    <div ref={shellRef} className={`ds-draw-shell ${shellBase}`}>
      <button
        type="button"
        onClick={() => setIsFull((v) => !v)}
        title={isFull ? "전체화면 종료" : "전체화면"}
        className="absolute right-3 top-3 z-20 rounded-lg border border-border bg-surface-solid/90 px-2.5 py-1.5 text-xs font-medium text-fg shadow-sm backdrop-blur transition-colors hover:bg-surface-strong"
      >
        {isFull ? "✕ 닫기" : "⤢ 전체화면"}
      </button>

      {/* 슬림 펜 독 — 화면 좌측 구석에 작게. 캔버스가 거의 전체 입력 공간. */}
      <div className="absolute left-2 top-1/2 z-20 -translate-y-1/2">
        <div className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-surface-solid/95 p-1.5 shadow-lg backdrop-blur">
          <DockButton active={tool === "pen"} onClick={() => chooseTool("pen")} title="펜">
            <IconPen className="h-[18px] w-[18px]" />
          </DockButton>
          <DockButton active={tool === "marker"} onClick={() => chooseTool("marker")} title="형광펜">
            <IconMarker className="h-[18px] w-[18px]" />
          </DockButton>
          <DockButton
            active={SHAPE_TOOLS.includes(tool)}
            onClick={() => setShapesOpen((o) => !o)}
            title="도형"
          >
            <IconShapes className="h-[18px] w-[18px]" />
          </DockButton>
          <DockButton active={tool === "eraser"} onClick={() => chooseTool("eraser")} title="지우개">
            <IconEraser className="h-[18px] w-[18px]" />
          </DockButton>
          <DockButton active={tool === "select"} onClick={() => chooseTool("select")} title="선택·이동">
            <IconCursor className="h-[18px] w-[18px]" />
          </DockButton>

          <span className="my-0.5 h-px w-6 bg-border" />

          <DockButton active={settingsOpen} onClick={() => setSettingsOpen((o) => !o)} title="펜 설정">
            <IconSettings className="h-[18px] w-[18px]" />
          </DockButton>
          <DockButton onClick={() => undoRedo(false)} title="되돌리기">
            <IconUndo className="h-[18px] w-[18px]" />
          </DockButton>
          <DockButton onClick={() => undoRedo(true)} title="다시 실행">
            <IconRedo className="h-[18px] w-[18px]" />
          </DockButton>
        </div>

        {/* 도형 선택 플라이아웃 */}
        {shapesOpen && (
          <div className="absolute left-full top-0 ml-2 flex gap-1 rounded-xl border border-border bg-surface-solid/95 p-1.5 shadow-lg backdrop-blur">
            <DockButton active={tool === "rect"} onClick={() => chooseTool("rect")} title="사각형">
              <IconSquare className="h-[18px] w-[18px]" />
            </DockButton>
            <DockButton active={tool === "ellipse"} onClick={() => chooseTool("ellipse")} title="원">
              <IconCircle className="h-[18px] w-[18px]" />
            </DockButton>
            <DockButton active={tool === "line"} onClick={() => chooseTool("line")} title="선">
              <IconLine className="h-[18px] w-[18px]" />
            </DockButton>
            <DockButton active={tool === "arrow"} onClick={() => chooseTool("arrow")} title="화살표">
              <IconArrow className="h-[18px] w-[18px]" />
            </DockButton>
          </div>
        )}

        {/* 펜 설정 팝오버 — 색 / 굵기(무단계) / 선 스타일 / 부드럽게 */}
        {settingsOpen && (
          <div className="absolute bottom-0 left-full ml-2 w-52 rounded-2xl border border-border bg-surface-solid/95 p-3 shadow-xl backdrop-blur">
            <div className="text-xs font-medium text-muted">색</div>
            <div className="mt-1.5 flex gap-1.5">
              {STROKE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={c}
                  onClick={() => setColor(c)}
                  className={`h-6 w-6 rounded-full border transition ${
                    color === c
                      ? "ring-2 ring-accent ring-offset-2 ring-offset-[var(--surface-solid)]"
                      : "border-border"
                  }`}
                  style={{ background: c }}
                />
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between text-xs font-medium text-muted">
              <span>굵기</span>
              <span className="text-fg">{width}</span>
            </div>
            <input
              type="range"
              min={WIDTH_MIN}
              max={WIDTH_MAX}
              step={1}
              value={width}
              onChange={(e) => setWidth(Number(e.target.value))}
              className="mt-1 w-full accent-[var(--accent)]"
            />
            {tool === "marker" && (
              <p className="mt-1 text-[11px] leading-tight text-muted">
                형광펜은 굵고 반투명한 고정 두께예요.
              </p>
            )}

            <div className="mt-3 text-xs font-medium text-muted">선 스타일</div>
            <div className="mt-1.5 grid grid-cols-3 gap-1">
              {(
                [
                  ["solid", "──"],
                  ["dashed", "- -"],
                  ["dotted", "···"],
                ] as [StrokeStyle, string][]
              ).map(([s, glyph]) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStyle(s)}
                  className={`rounded-lg border px-2 py-1.5 text-sm transition-colors ${
                    style === s
                      ? "border-accent bg-accent/15 text-fg"
                      : "border-border text-muted hover:bg-surface-strong hover:text-fg"
                  }`}
                >
                  {glyph}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setSmooth((v) => !v)}
              className="mt-3 flex w-full items-center justify-between"
            >
              <span className="text-xs font-medium text-muted">부드럽게</span>
              <span
                className={`relative h-5 w-9 rounded-full transition-colors ${
                  smooth ? "bg-accent" : "bg-surface-strong"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                    smooth ? "left-[1.125rem]" : "left-0.5"
                  }`}
                />
              </span>
            </button>
          </div>
        )}
      </div>

      <Excalidraw
        initialData={initialData as never}
        excalidrawAPI={(a) => setApi(a as unknown as ExcalidrawApi)}
        onChange={handleChange as never}
        langCode="ko"
      />
    </div>
  );
}

/* ----------------------------- 독 버튼 ----------------------------- */

function DockButton({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${
        active
          ? "bg-accent text-accent-fg"
          : "text-muted hover:bg-surface-strong hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

/* ------------------------------- 아이콘 ------------------------------- */
// 공통 stroke 스타일. SVG presentation 속성은 자식 path로 상속된다.
const SVG = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function IconPen({ className }: { className?: string }) {
  return (
    <svg {...SVG} className={className}>
      <path d="M4 20l1-4L15.5 5.5a2 2 0 0 1 3 0l0 0a2 2 0 0 1 0 3L8 19l-4 1z" />
      <path d="M14 7l3 3" />
    </svg>
  );
}

function IconMarker({ className }: { className?: string }) {
  return (
    <svg {...SVG} className={className}>
      <path d="M5 21h14" />
      <path d="M9 17l-3 1 1-3 9-9 2 2-9 9z" />
      <path d="M13 6l5 5" />
    </svg>
  );
}

function IconShapes({ className }: { className?: string }) {
  return (
    <svg {...SVG} className={className}>
      <rect x="3.5" y="3.5" width="11" height="11" rx="1.5" />
      <circle cx="16" cy="16" r="4.5" />
    </svg>
  );
}

function IconEraser({ className }: { className?: string }) {
  return (
    <svg {...SVG} className={className}>
      <path d="M8 20l-4-4a1.5 1.5 0 0 1 0-2l7-7 6 6-7 7H8z" />
      <path d="M11 20h9" />
    </svg>
  );
}

function IconCursor({ className }: { className?: string }) {
  return (
    <svg {...SVG} className={className}>
      <path d="M5 4l13 5.5-5.5 2-2 5.5L5 4z" />
    </svg>
  );
}

function IconSettings({ className }: { className?: string }) {
  return (
    <svg {...SVG} className={className}>
      <path d="M4 7h8" />
      <path d="M16 7h4" />
      <circle cx="14" cy="7" r="2" />
      <path d="M4 17h4" />
      <path d="M12 17h8" />
      <circle cx="10" cy="17" r="2" />
    </svg>
  );
}

function IconUndo({ className }: { className?: string }) {
  return (
    <svg {...SVG} className={className}>
      <path d="M9 7L4 12l5 5" />
      <path d="M4 12h10a5 5 0 0 1 0 10h-2" />
    </svg>
  );
}

function IconRedo({ className }: { className?: string }) {
  return (
    <svg {...SVG} className={className}>
      <path d="M15 7l5 5-5 5" />
      <path d="M20 12H10a5 5 0 0 0 0 10h2" />
    </svg>
  );
}

function IconSquare({ className }: { className?: string }) {
  return (
    <svg {...SVG} className={className}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  );
}

function IconCircle({ className }: { className?: string }) {
  return (
    <svg {...SVG} className={className}>
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}

function IconLine({ className }: { className?: string }) {
  return (
    <svg {...SVG} className={className}>
      <path d="M5 19L19 5" />
    </svg>
  );
}

function IconArrow({ className }: { className?: string }) {
  return (
    <svg {...SVG} className={className}>
      <path d="M5 19L19 5" />
      <path d="M10 5h9v9" />
    </svg>
  );
}
