"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

export function DrawCanvas({ initialScene, legacyInk, onChange }: Props) {
  const [isFull, setIsFull] = useState(false);

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
    onChange(
      {
        elements: [...cur.elements],
        files: (cur.files as Record<string, unknown>) ?? undefined,
      },
      svg,
    );
  }, [onChange]);

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

  return (
    <div
      className={
        isFull
          ? "fixed inset-0 z-[60] bg-white"
          : "relative min-h-0 flex-1 overflow-hidden rounded-xl border border-border"
      }
    >
      <button
        type="button"
        onClick={() => setIsFull((v) => !v)}
        title={isFull ? "전체화면 종료" : "전체화면"}
        className="absolute right-3 top-3 z-10 rounded-lg border border-border bg-surface-solid/90 px-2.5 py-1.5 text-xs font-medium text-fg shadow-sm backdrop-blur transition-colors hover:bg-surface-strong"
      >
        {isFull ? "✕ 닫기" : "⤢ 전체화면"}
      </button>
      <Excalidraw
        initialData={initialData as never}
        onChange={handleChange as never}
        langCode="ko"
      />
    </div>
  );
}
