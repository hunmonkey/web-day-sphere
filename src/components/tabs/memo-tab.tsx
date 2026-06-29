"use client";

import { AnimatePresence, motion } from "framer-motion";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useVault } from "@/components/vault/vault-provider";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { downloadSvg, downloadSvgAsJpg } from "@/lib/export-image";
import type { DeviceKind } from "@/lib/device-prefs";
import type { AudioClip, ExcalidrawScene, Memo } from "@/lib/vault-types";

// 그림판(Excalidraw)은 SSR 불가 + 무거우므로, 그림 모드 진입 시에만 클라이언트에서 로드.
const DrawCanvas = dynamic(
  () => import("@/components/memo/draw-canvas").then((m) => m.DrawCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-border text-sm text-muted">
        그림판 불러오는 중…
      </div>
    ),
  },
);

const panel = "glass rounded-3xl p-5 min-h-0";

/** 메모 첫 줄을 목록 미리보기로 */
function preview(text: string) {
  const first = text.split("\n")[0].trim();
  return first || "빈 메모";
}

function hasDrawing(m: Memo) {
  return (m.scene?.elements?.length ?? 0) > 0 || (m.ink?.length ?? 0) > 0;
}

/** ms → m:ss */
function fmtClock(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** 클립 재생용 스트리밍 URL */
function clipSrc(memoId: string, clipId: string) {
  return `/api/vault/audio?memo=${encodeURIComponent(memoId)}&clip=${encodeURIComponent(clipId)}`;
}

export function MemoTab({ deviceKind }: { deviceKind: DeviceKind | null }) {
  const { memos, setMemos } = useVault();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"text" | "draw">("draw");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // 음성 녹음(메모에 첨부 → 언제든 재생)
  const recorder = useAudioRecorder();
  const [uploading, setUploading] = useState(false);
  const [clipsOpen, setClipsOpen] = useState(false);
  // 녹음 시작 시점의 메모에 붙도록 id를 고정(녹음 중 메모를 바꿔도 어긋나지 않게)
  const recordingMemoRef = useRef<string | null>(null);

  const selected = memos.find((m) => m.id === selectedId) ?? memos[0] ?? null;
  const selectedMemoId = selected?.id;

  // 메모를 선택하면 바로 입력할 수 있게 텍스트 모드에서 자동 포커스
  useEffect(() => {
    if (mode === "text" && selectedMemoId) textareaRef.current?.focus();
  }, [selectedMemoId, mode]);

  // 마이크 권한 거부 등 녹음 오류 안내
  useEffect(() => {
    if (recorder.error) window.alert(recorder.error);
  }, [recorder.error]);

  function addMemo() {
    const id = crypto.randomUUID();
    setMemos((prev) => [{ id, text: "" }, ...prev]);
    setSelectedId(id);
    setMode("draw");
  }

  function updateMemo(id: string, text: string) {
    setMemos((prev) => prev.map((m) => (m.id === id ? { ...m, text } : m)));
  }

  function updateScene(id: string, scene: ExcalidrawScene, svg: string) {
    setMemos((prev) =>
      prev.map((m) => (m.id === id ? { ...m, scene, svg, ink: undefined } : m)),
    );
  }

  function removeMemo(id: string) {
    setMemos((prev) => prev.filter((m) => m.id !== id));
    if (selectedId === id) {
      const rest = memos.filter((m) => m.id !== id);
      setSelectedId(rest[0]?.id ?? null);
    }
  }

  function addClip(memoId: string, clip: AudioClip) {
    setMemos((prev) =>
      prev.map((m) =>
        m.id === memoId ? { ...m, audio: [...(m.audio ?? []), clip] } : m,
      ),
    );
  }

  async function toggleRecord() {
    if (recorder.state === "recording") {
      const memoId = recordingMemoRef.current;
      const result = await recorder.stop();
      recordingMemoRef.current = null;
      if (!result || !memoId) return;
      const clipId = crypto.randomUUID();
      setUploading(true);
      try {
        const res = await fetch(clipSrc(memoId, clipId), {
          method: "POST",
          body: result.blob,
        });
        if (!res.ok) throw new Error("업로드 실패");
        // 바이너리가 디스크에 안전히 올라간 뒤에야 메타데이터를 붙인다(끊긴 재생 방지).
        addClip(memoId, {
          id: clipId,
          created: new Date().toISOString(),
          duration: result.duration,
        });
        setClipsOpen(true);
      } catch {
        alert("녹음 저장에 실패했어요. 다시 시도해 주세요.");
      } finally {
        setUploading(false);
      }
      return;
    }
    if (!selected) return;
    recordingMemoRef.current = selected.id;
    await recorder.start();
  }

  async function removeClip(memoId: string, clipId: string) {
    setMemos((prev) =>
      prev.map((m) =>
        m.id === memoId
          ? { ...m, audio: (m.audio ?? []).filter((c) => c.id !== clipId) }
          : m,
      ),
    );
    try {
      await fetch(clipSrc(memoId, clipId), { method: "DELETE" });
    } catch {
      // 파일 삭제 실패해도 다음 동기화에서 고아 정리됨
    }
  }

  const recording = recorder.state === "recording";
  const clips = selected?.audio ?? [];

  // 목록 칸을 기존의 절반 너비로 축소(요청). 모바일은 1단 유지.
  const gridClass =
    deviceKind === "mobile"
      ? "grid h-full grid-cols-1 gap-4"
      : deviceKind === "tablet"
        ? "grid h-full grid-cols-[minmax(13rem,1.7fr)_minmax(0,8.3fr)] gap-4"
        : deviceKind === "desktop"
          ? "grid h-full grid-cols-[1.75fr_8.25fr] gap-4"
          : "grid h-full grid-cols-1 gap-4 sm:grid-cols-[1.75fr_8.25fr]";

  const shortId = selected?.id.slice(0, 8) ?? "memo";

  return (
    <div className={gridClass}>
      {/* 메모 목록 */}
      <section className={`${panel} flex min-w-0 flex-col`}>
        <div className="flex shrink-0 items-center justify-between gap-2">
          <h2 className="whitespace-nowrap text-base font-semibold text-fg">메모</h2>
          <button
            type="button"
            onClick={addMemo}
            className="whitespace-nowrap rounded-lg bg-accent px-3 py-1 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-strong"
          >
            새 메모
          </button>
        </div>

        <ul className="mt-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto">
          <AnimatePresence initial={false}>
            {memos.map((m) => (
              <motion.li
                key={m.id}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-center gap-1"
              >
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(m.id);
                    setClipsOpen(false);
                  }}
                  className={`flex-1 truncate rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    selected?.id === m.id
                      ? "bg-accent/15 text-fg"
                      : "text-muted hover:bg-surface-strong hover:text-fg"
                  }`}
                >
                  {m.text.trim() ? preview(m.text) : hasDrawing(m) ? "그림 메모" : "빈 메모"}
                </button>
                <button
                  type="button"
                  onClick={() => removeMemo(m.id)}
                  aria-label="메모 삭제"
                  className="shrink-0 rounded-md px-1.5 py-1 text-sm text-muted opacity-60 transition hover:text-danger hover:opacity-100"
                >
                  ✕
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </section>

      {/* 편집기 */}
      <section className={`${panel} flex min-w-0 flex-col`}>
        {selected ? (
          <>
            <div className="mb-3 flex shrink-0 items-center justify-between">
              <div className="flex rounded-xl border border-border p-1">
                <button
                  type="button"
                  onClick={() => setMode("text")}
                  className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                    mode === "text"
                      ? "bg-accent text-accent-fg"
                      : "text-muted hover:bg-surface-strong hover:text-fg"
                  }`}
                >
                  텍스트
                </button>
                <button
                  type="button"
                  onClick={() => setMode("draw")}
                  className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                    mode === "draw"
                      ? "bg-accent text-accent-fg"
                      : "text-muted hover:bg-surface-strong hover:text-fg"
                  }`}
                >
                  그림
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                {mode === "draw" && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        selected.svg && downloadSvg(selected.svg, `그림-${shortId}.svg`)
                      }
                      disabled={!selected.svg}
                      className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-strong hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      SVG
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        selected.svg &&
                        void downloadSvgAsJpg(selected.svg, `그림-${shortId}.jpg`)
                      }
                      disabled={!selected.svg}
                      className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-strong hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      JPG
                    </button>
                  </>
                )}

                {/* 음성 녹음 — 텍스트·그림 모드 모두에서 사용 */}
                {recorder.supported && (
                  <>
                    <button
                      type="button"
                      onClick={toggleRecord}
                      disabled={uploading}
                      title={recording ? "녹음 정지" : "음성 녹음"}
                      aria-pressed={recording}
                      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                        recording
                          ? "border-danger bg-danger/15 text-danger"
                          : "border-border text-muted hover:bg-surface-strong hover:text-fg"
                      }`}
                    >
                      <span
                        className={`inline-block h-2.5 w-2.5 rounded-full bg-danger ${
                          recording ? "animate-pulse" : ""
                        }`}
                      />
                      {uploading
                        ? "저장 중…"
                        : recording
                          ? fmtClock(recorder.elapsed)
                          : "녹음"}
                    </button>

                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setClipsOpen((o) => !o)}
                        disabled={clips.length === 0}
                        title="녹음 목록"
                        className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-strong hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        🔊 {clips.length}
                      </button>
                      {clipsOpen && clips.length > 0 && (
                        <div className="absolute right-0 top-full z-30 mt-1.5 max-h-72 w-72 overflow-y-auto rounded-2xl border border-border bg-surface-solid/95 p-2 shadow-xl backdrop-blur">
                          {clips.map((c) => (
                            <div
                              key={c.id}
                              className="mb-2 rounded-xl border border-border p-2 last:mb-0"
                            >
                              <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
                                <span>
                                  {c.created
                                    ? new Date(c.created).toLocaleString("ko-KR", {
                                        month: "numeric",
                                        day: "numeric",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })
                                    : "녹음"}
                                  {c.duration ? ` · ${fmtClock(c.duration)}` : ""}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => removeClip(selected!.id, c.id)}
                                  aria-label="녹음 삭제"
                                  className="rounded px-1 text-muted transition hover:text-danger"
                                >
                                  ✕
                                </button>
                              </div>
                              <audio
                                controls
                                preload="none"
                                src={clipSrc(selected!.id, c.id)}
                                className="h-8 w-full"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}

                <span className="rounded-full bg-neutral/15 px-2.5 py-1 text-xs font-medium text-neutral">
                  자동 저장
                </span>
              </div>
            </div>
            {mode === "text" ? (
              <textarea
                ref={textareaRef}
                value={selected.text}
                onChange={(e) => updateMemo(selected.id, e.target.value)}
                aria-label="메모 내용"
                placeholder="메모를 입력하세요. 입력하는 즉시 저장됩니다."
                className="min-h-0 flex-1 resize-none rounded-xl border border-border bg-surface-strong px-3.5 py-3 text-sm leading-relaxed text-fg placeholder:text-muted"
              />
            ) : (
              <DrawCanvas
                key={selected.id}
                initialScene={selected.scene}
                legacyInk={selected.ink}
                onChange={(scene, svg) => updateScene(selected.id, scene, svg)}
              />
            )}
          </>
        ) : (
          <div className="flex h-full items-center justify-center" />
        )}
      </section>
    </div>
  );
}
