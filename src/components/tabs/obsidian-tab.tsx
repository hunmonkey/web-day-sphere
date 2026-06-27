"use client";

import { useCallback, useState, type FormEvent } from "react";
import { useVault } from "@/components/vault/vault-provider";
import { exportMemosPdf, exportTasksPdf } from "@/lib/export-pdf";

type DirectoryEntry = {
  name: string;
  path: string;
};

type DirectoryListing = {
  root: string;
  path: string;
  parent: string | null;
  entries: DirectoryEntry[];
};

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

export function ObsidianTab({ canManageVault }: { canManageVault: boolean }) {
  const { tasks, memos, alarms, status, syncNow, reload, updateTargetDir } = useVault();
  const [draftDir, setDraftDir] = useState<string | null>(null);
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderLoading, setFolderLoading] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [folderListing, setFolderListing] = useState<DirectoryListing | null>(null);
  const [applying, setApplying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const inkCount = memos.filter((m) => (m.ink?.length ?? 0) > 0).length;

  const stats: [string, number][] = [
    ["할 일", tasks.length],
    ["메모", memos.length],
    ["손글씨", inkCount],
    ["알람", alarms.length],
  ];
  const displayedDir = draftDir ?? status.targetDir ?? "";

  const loadDirectories = useCallback(async (target?: string) => {
    setFolderLoading(true);
    setFolderError(null);
    try {
      const query = target ? `?path=${encodeURIComponent(target)}` : "";
      const res = await fetch(`/api/vault/directories${query}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "폴더 목록을 불러오지 못했습니다.");
      setFolderListing({
        root: json.root,
        path: json.path,
        parent: json.parent,
        entries: Array.isArray(json.entries) ? json.entries : [],
      });
    } catch (error) {
      setFolderError((error as Error).message);
    } finally {
      setFolderLoading(false);
    }
  }, []);

  function openFolderPicker() {
    setFolderOpen(true);
    void loadDirectories(displayedDir || undefined);
  }

  async function applyTargetDir(event: FormEvent) {
    event.preventDefault();
    const targetDir = displayedDir.trim();
    if (!targetDir) return;
    setApplying(true);
    setNotice(null);
    try {
      await updateTargetDir(targetDir);
      setDraftDir(null);
      setNotice("저장 위치가 변경되었습니다.");
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setApplying(false);
    }
  }

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
          <form
            onSubmit={(event) => void applyTargetDir(event)}
            className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto_auto]"
          >
            <input
              value={displayedDir}
              onChange={(event) => setDraftDir(event.target.value)}
              disabled={!canManageVault || applying || status.saving}
              aria-label="Obsidian 저장 위치"
              className="min-w-0 rounded-xl border border-border bg-surface-solid px-3 py-2 font-mono text-sm text-fg outline-none transition-colors focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
            />
            <button
              type="button"
              onClick={openFolderPicker}
              disabled={!canManageVault || applying || status.saving}
              className="rounded-xl border border-border px-3 py-2 text-sm font-medium text-fg transition-colors hover:bg-surface-solid disabled:cursor-not-allowed disabled:opacity-50"
            >
              폴더 찾기
            </button>
            <button
              type="submit"
              disabled={!canManageVault || applying || status.saving || !displayedDir.trim()}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
            >
              {applying ? "적용 중…" : "적용"}
            </button>
          </form>
          {notice && (
            <p
              className={`mt-2 text-xs ${
                notice.includes("변경") ? "text-ok" : "text-danger"
              }`}
            >
              {notice}
            </p>
          )}
          {!canManageVault && (
            <p className="mt-2 text-xs text-muted">관리자만 저장 위치를 변경할 수 있습니다.</p>
          )}
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

      {folderOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Obsidian 저장 폴더 선택"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm"
        >
          <div className="flex max-h-[82vh] w-full max-w-2xl flex-col rounded-3xl border border-border bg-surface-solid p-4 shadow-2xl">
            <div className="flex shrink-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-fg">저장 폴더 선택</h3>
                <p className="mt-1 break-all font-mono text-xs text-muted">
                  {folderListing?.path ?? displayedDir}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFolderOpen(false)}
                className="shrink-0 rounded-xl border border-border px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-strong hover:text-fg"
              >
                닫기
              </button>
            </div>

            <div className="mt-3 flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                onClick={() => folderListing?.parent && void loadDirectories(folderListing.parent)}
                disabled={!folderListing?.parent || folderLoading}
                className="rounded-xl border border-border px-3 py-2 text-sm font-medium text-fg transition-colors hover:bg-surface-strong disabled:cursor-not-allowed disabled:opacity-50"
              >
                상위
              </button>
              <button
                type="button"
                onClick={() => {
                  if (folderListing?.path) setDraftDir(folderListing.path);
                  setFolderOpen(false);
                }}
                disabled={!folderListing?.path || folderLoading}
                className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
              >
                이 폴더 선택
              </button>
            </div>

            {folderError && (
              <p role="alert" className="mt-3 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
                {folderError}
              </p>
            )}

            <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-2xl border border-border bg-surface-strong p-2">
              {folderLoading ? (
                <p className="p-3 text-sm text-muted">불러오는 중…</p>
              ) : folderListing?.entries.length ? (
                <div className="grid gap-1">
                  {folderListing.entries.map((entry) => (
                    <button
                      key={entry.path}
                      type="button"
                      onClick={() => void loadDirectories(entry.path)}
                      className="min-w-0 rounded-xl px-3 py-2 text-left transition-colors hover:bg-surface-solid"
                    >
                      <span className="block truncate text-sm font-medium text-fg">
                        {entry.name}
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-xs text-muted">
                        {entry.path}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="p-3 text-sm text-muted">하위 폴더가 없습니다.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
