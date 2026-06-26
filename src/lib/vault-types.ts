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

export type Memo = {
  id: string;
  text: string;
  ink?: InkStroke[];
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
