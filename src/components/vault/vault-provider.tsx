"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  emptyVault,
  isVaultEmpty,
  type Alarm,
  type Memo,
  type Task,
  type VaultData,
} from "@/lib/vault-types";

/**
 * Vault(Markdown) 동기화 계층.
 *
 * - 원본은 서버의 md(Vault). 앱 시작 시 GET /api/vault 로 읽어 상태를 채운다.
 * - 변경 시 debounce 후 PUT /api/vault 로 저장(바뀐 파일만 기록).
 * - localStorage(ds.*)는 즉시 캐시 + 최초 마이그레이션 소스 + 서버 미응답 시 폴백.
 * - 충돌(외부에서 더 최근에 수정)이 보고되면 외부 변경을 우선해 다시 읽어온다(최근 수정 우선).
 */

const CACHE_KEYS = {
  tasks: "ds.tasks",
  memos: "ds.memos",
  alarms: "ds.alarms.v2",
} as const;

const SAVE_DEBOUNCE_MS = 800;

type SyncStatus = {
  loaded: boolean;
  saving: boolean;
  syncedAt: number | null;
  error: string | null;
  conflicts: string[];
  targetDir: string | null;
};

type VaultContextValue = {
  tasks: Task[];
  memos: Memo[];
  alarms: Alarm[];
  setTasks: Dispatch<SetStateAction<Task[]>>;
  setMemos: Dispatch<SetStateAction<Memo[]>>;
  setAlarms: Dispatch<SetStateAction<Alarm[]>>;
  status: SyncStatus;
  syncNow: () => Promise<void>;
  reload: () => Promise<void>;
  updateTargetDir: (targetDir: string) => Promise<void>;
};

const VaultContext = createContext<VaultContextValue | null>(null);

function readCache(): VaultData {
  const v = emptyVault();
  try {
    const t = localStorage.getItem(CACHE_KEYS.tasks);
    const m = localStorage.getItem(CACHE_KEYS.memos);
    const a = localStorage.getItem(CACHE_KEYS.alarms);
    if (t) v.tasks = JSON.parse(t) as Task[];
    if (m) v.memos = JSON.parse(m) as Memo[];
    if (a) v.alarms = JSON.parse(a) as Alarm[];
  } catch {
    // 손상된 캐시는 무시
  }
  return v;
}

function writeCache(v: VaultData) {
  try {
    localStorage.setItem(CACHE_KEYS.tasks, JSON.stringify(v.tasks));
    localStorage.setItem(CACHE_KEYS.memos, JSON.stringify(v.memos));
    localStorage.setItem(CACHE_KEYS.alarms, JSON.stringify(v.alarms));
  } catch {
    // 용량 초과 등은 조용히 무시
  }
}

export function VaultProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [memos, setMemos] = useState<Memo[]>([]);
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [status, setStatus] = useState<SyncStatus>({
    loaded: false,
    saving: false,
    syncedAt: null,
    error: null,
    conflicts: [],
    targetDir: null,
  });

  const loadedRef = useRef(false);
  const baseSyncedAtRef = useRef(0);
  const saveTimer = useRef<number | null>(null);
  const stateRef = useRef<VaultData>(emptyVault());
  stateRef.current = { tasks, memos, alarms };

  const apply = useCallback((v: VaultData) => {
    setTasks(v.tasks);
    setMemos(v.memos);
    setAlarms(v.alarms);
    writeCache(v);
  }, []);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/vault", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "불러오기 실패");
      const data = json.data as VaultData;
      baseSyncedAtRef.current = json.syncedAt ?? 0;

      if (isVaultEmpty(data)) {
        // Vault가 비어 있으면 기존 localStorage 데이터를 1회 승격(마이그레이션)
        const cache = readCache();
        apply(isVaultEmpty(cache) ? emptyVault() : cache);
      } else {
        apply(data);
      }
      loadedRef.current = true;
      setStatus((s) => ({
        ...s,
        loaded: true,
        error: null,
        conflicts: [],
        syncedAt: json.syncedAt ?? s.syncedAt,
        targetDir: json.targetDir ?? s.targetDir,
      }));
    } catch (error) {
      // 서버 미응답(개발 중/오프라인 등): 캐시로 동작 유지, 저장은 보류
      apply(readCache());
      loadedRef.current = true;
      setStatus((s) => ({ ...s, loaded: true, error: (error as Error).message }));
    }
  }, [apply]);

  const save = useCallback(async () => {
    if (!loadedRef.current) return;
    const data = stateRef.current;
    writeCache(data);
    setStatus((s) => ({ ...s, saving: true }));
    try {
      const res = await fetch("/api/vault", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, baseSyncedAt: baseSyncedAtRef.current }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "저장 실패");
      baseSyncedAtRef.current = json.syncedAt ?? baseSyncedAtRef.current;
      setStatus((s) => ({
        ...s,
        saving: false,
        error: null,
        syncedAt: json.syncedAt ?? s.syncedAt,
        conflicts: json.conflicts ?? [],
      }));
      // 외부(Obsidian)에서 더 최근에 수정된 파일이 있으면 그쪽을 우선해 다시 읽어온다
      if (Array.isArray(json.conflicts) && json.conflicts.length > 0) {
        await reload();
      }
    } catch (error) {
      setStatus((s) => ({ ...s, saving: false, error: (error as Error).message }));
    }
  }, [reload]);

  const syncNow = useCallback(async () => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    await save();
  }, [save]);

  const updateTargetDir = useCallback(
    async (targetDir: string) => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      writeCache(stateRef.current);
      setStatus((s) => ({ ...s, saving: true, error: null }));
      try {
        const res = await fetch("/api/vault/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetDir }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "저장 위치 변경 실패");
        baseSyncedAtRef.current = 0;
        setStatus((s) => ({
          ...s,
          saving: false,
          error: null,
          targetDir: json.targetDir ?? targetDir,
        }));
        await reload();
      } catch (error) {
        const message = (error as Error).message;
        setStatus((s) => ({
          ...s,
          saving: false,
          error: message,
        }));
        throw error;
      }
    },
    [reload],
  );

  // 최초 1회 로드
  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 변경 시 debounce 저장
  useEffect(() => {
    if (!loadedRef.current) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void save();
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [tasks, memos, alarms, save]);

  return (
    <VaultContext.Provider
      value={{
        tasks,
        memos,
        alarms,
        setTasks,
        setMemos,
        setAlarms,
        status,
        syncNow,
        reload,
        updateTargetDir,
      }}
    >
      {children}
    </VaultContext.Provider>
  );
}

export function useVault() {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault must be used within VaultProvider");
  return ctx;
}
