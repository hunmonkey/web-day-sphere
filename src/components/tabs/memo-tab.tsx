"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { usePersistentState } from "@/hooks/use-persistent-state";

type Memo = { id: string; text: string };

const seedMemos: Memo[] = [
  { id: "m1", text: "글래스모피즘 + 벤토 그리드로 첫 화면을 잡자." },
];

const panel = "glass rounded-3xl p-5 min-h-0";

/** 메모 첫 줄을 목록 미리보기로 */
function preview(text: string) {
  const first = text.split("\n")[0].trim();
  return first || "빈 메모";
}

export function MemoTab() {
  const [memos, setMemos] = usePersistentState<Memo[]>("ds.memos", seedMemos);
  const [selectedId, setSelectedId] = useState<string | null>(
    seedMemos[0]?.id ?? null,
  );

  const selected = memos.find((m) => m.id === selectedId) ?? memos[0] ?? null;

  function addMemo() {
    const id = crypto.randomUUID();
    setMemos((prev) => [{ id, text: "" }, ...prev]);
    setSelectedId(id);
  }

  function updateMemo(id: string, text: string) {
    setMemos((prev) => prev.map((m) => (m.id === id ? { ...m, text } : m)));
  }

  function removeMemo(id: string) {
    setMemos((prev) => prev.filter((m) => m.id !== id));
    if (selectedId === id) {
      const rest = memos.filter((m) => m.id !== id);
      setSelectedId(rest[0]?.id ?? null);
    }
  }

  return (
    <div className="grid h-full grid-cols-1 gap-4 sm:grid-cols-[3.5fr_6.5fr]">
      {/* 메모 목록 */}
      <section className={`${panel} flex flex-col`}>
        <div className="flex shrink-0 items-center justify-between">
          <h2 className="text-base font-semibold text-fg">메모</h2>
          <button
            type="button"
            onClick={addMemo}
            className="rounded-lg bg-accent px-3 py-1 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-strong"
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
                  onClick={() => setSelectedId(m.id)}
                  className={`flex-1 truncate rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    selected?.id === m.id
                      ? "bg-accent/15 text-fg"
                      : "text-muted hover:bg-surface-strong hover:text-fg"
                  }`}
                >
                  {preview(m.text)}
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
          {memos.length === 0 && (
            <li className="px-1 text-sm text-muted">
              메모가 없습니다. ‘새 메모’로 추가하세요.
            </li>
          )}
        </ul>
      </section>

      {/* 편집기 */}
      <section className={`${panel} flex flex-col`}>
        {selected ? (
          <>
            <div className="mb-3 flex shrink-0 items-center justify-between">
              <span className="text-sm text-muted">메모 편집</span>
              <span className="rounded-full bg-neutral/15 px-2.5 py-1 text-xs font-medium text-neutral">
                자동 저장
              </span>
            </div>
            <textarea
              value={selected.text}
              onChange={(e) => updateMemo(selected.id, e.target.value)}
              aria-label="메모 내용"
              placeholder="메모를 입력하세요. 입력하는 즉시 저장됩니다."
              className="min-h-0 flex-1 resize-none rounded-xl border border-border bg-surface-strong px-3.5 py-3 text-sm leading-relaxed text-fg placeholder:text-muted"
            />
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            왼쪽에서 메모를 선택하거나 ‘새 메모’를 추가하세요.
          </div>
        )}
      </section>
    </div>
  );
}
