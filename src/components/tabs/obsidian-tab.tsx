"use client";

import { useVault } from "@/components/vault/vault-provider";
import { exportMemosPdf, exportTasksPdf } from "@/lib/export-pdf";

function formatTime(ms: number | null) {
  if (!ms) return "아직 없음";
  try {
    return new Date(ms).toLocaleString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function ObsidianTab() {
  const { tasks, memos, alarms, status, syncNow, reload } = useVault();
  const inkCount = memos.filter((m) => (m.ink?.length ?? 0) > 0).length;

  const stats: [string, number][] = [
    ["할 일", tasks.length],
    ["메모", memos.length],
    ["손글씨", inkCount],
    ["알람", alarms.length],
  ];

  return (
    <section className="glass flex h-full flex-col rounded-3xl p-5">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-fg">Obsidian 동기화</h2>
          <p className="mt-0.5 text-xs text-muted">
            모든 데이터는 Markdown으로 자동 저장됩니다. Syncthing이 이 폴더를 서버로 동기화합니다.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void reload()}
            className="rounded-xl border border-border px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-strong hover:text-fg"
          >
            다시 불러오기
          </button>
          <button
            type="button"
            onClick={() => void syncNow()}
            disabled={status.saving}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status.saving ? "저장 중…" : "지금 동기화"}
          </button>
        </div>
      </div>

      <div className="mt-4 grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-border bg-surface-strong p-3">
            <p className="text-xs text-muted">{label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-fg">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto rounded-2xl border border-border bg-surface-strong p-4">
        <div>
          <p className="text-xs font-medium text-muted">저장 위치</p>
          <p className="mt-1 break-all font-mono text-sm text-fg">
            {status.targetDir ?? "불러오는 중…"}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-medium text-muted">마지막 동기화</p>
            <p className="mt-1 text-sm tabular-nums text-fg">{formatTime(status.syncedAt)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted">상태</p>
            <p
              className={`mt-1 text-sm ${
                status.error
                  ? "text-danger"
                  : status.saving
                    ? "text-accent"
                    : "text-ok"
              }`}
            >
              {status.error
                ? `오류: ${status.error}`
                : status.saving
                  ? "저장 중…"
                  : status.loaded
                    ? "동기화됨"
                    : "불러오는 중…"}
            </p>
          </div>
        </div>

        {status.conflicts.length > 0 && (
          <div role="alert" className="rounded-xl border border-accent/40 bg-accent/10 p-3">
            <p className="text-xs font-medium text-accent">
              외부(Obsidian)에서 더 최근에 수정된 파일이 있어 그쪽을 우선해 다시 불러왔습니다.
            </p>
            <ul className="mt-1.5 space-y-0.5">
              {status.conflicts.slice(0, 8).map((f) => (
                <li key={f} className="break-all font-mono text-xs text-muted">
                  {f}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <p className="text-xs font-medium text-muted">외부 저장 (PDF)</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => exportTasksPdf(tasks)}
              className="rounded-xl border border-border px-3 py-2 text-sm font-medium text-fg transition-colors hover:bg-surface-solid"
            >
              할 일·캘린더 PDF
            </button>
            <button
              type="button"
              onClick={() => exportMemosPdf(memos)}
              className="rounded-xl border border-border px-3 py-2 text-sm font-medium text-fg transition-colors hover:bg-surface-solid"
            >
              메모 PDF
            </button>
          </div>
          <p className="mt-2 text-xs text-muted">
            인쇄 창이 열리면 대상으로 “PDF로 저장”을 선택하세요. 손글씨 SVG·JPG는 메모 편집기에서 내보낼 수 있습니다.
          </p>
        </div>
      </div>
    </section>
  );
}
