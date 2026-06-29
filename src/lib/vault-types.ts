/**
 * Day Sphere 데이터 모델 (앱·서버 공용).
 *
 * 이 타입들은 곧 Markdown(Vault)으로 직렬화되어 저장된다.
 * 서버(vault-store)와 클라이언트(vault-provider)가 같은 모양을 공유하도록 한곳에 모은다.
 */

export type InkPoint = {
  x: number;
  y: number;
  pressure: number;
  /** 포인터 이벤트 timeStamp(ms). 손글씨 인식(Phase 2)에 사용. 과거 데이터는 없을 수 있음. */
  t?: number;
};

export type InkStroke = {
  id: string;
  color: string;
  baseWidth: number;
  input: string;
  points: InkPoint[];
};

export type Task = {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // "" 또는 HH:MM
  title: string;
  done: boolean;
};

/**
 * Excalidraw 장면(그림). elements가 원본이며 appState/files는 일부만 보관한다.
 * 우리 코드는 Excalidraw에 통째로 넘기고 받기만 하므로 느슨한 타입으로 둔다.
 */
export type ExcalidrawScene = {
  elements: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
};

/**
 * 메모에 첨부된 음성 녹음 한 개.
 * 실제 오디오 파일은 _assets/<memoId>.audio-<id>.webm 에 저장되며,
 * 경로는 서버가 일관되게 만든다(여기엔 메타데이터만).
 */
export type AudioClip = {
  id: string;
  /** 녹음 시작 시각(ISO). */
  created: string;
  /** 녹음 길이(ms). */
  duration: number;
};

export type Memo = {
  id: string;
  text: string;
  /** 그림(Excalidraw). 원본 장면. */
  scene?: ExcalidrawScene;
  /** 표시용 SVG(클라이언트가 scene에서 생성). Obsidian 임베드/미리보기용. */
  svg?: string;
  /** (구) 손글씨 자유선 — 레거시 데이터 마이그레이션 소스로만 사용. */
  ink?: InkStroke[];
  /** 첨부된 음성 녹음(있을 때만). */
  audio?: AudioClip[];
  created?: string; // ISO
};

export type Alarm = {
  id: string;
  at: string; // HH:MM:SS (매일 반복)
  on: boolean;
};

/** Vault 전체 문서(한 번에 읽고/쓴다). */
export type VaultData = {
  tasks: Task[];
  memos: Memo[];
  alarms: Alarm[];
};

export function emptyVault(): VaultData {
  return { tasks: [], memos: [], alarms: [] };
}

export function isVaultEmpty(v: VaultData): boolean {
  return v.tasks.length === 0 && v.memos.length === 0 && v.alarms.length === 0;
}
