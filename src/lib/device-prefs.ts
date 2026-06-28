/**
 * 기기별 화면 설정(앱·서버 공용).
 *
 * 세 종류 기기(폰/타블렛/PC)마다 "앱을 켰을 때 먼저 보일 탭(시작 탭)"을 정한다.
 * 값은 서버의 `.day-sphere/settings.json`에 저장되어 모든 기기가 같은 설정을 공유한다.
 * (UI 설정이므로 Obsidian Vault(md)에는 넣지 않는다.)
 */

export type TabId = "planner" | "memo" | "alarm" | "settings";

export type DeviceKind = "mobile" | "tablet" | "desktop";

export type DevicePref = {
  startTab: TabId;
};

export type DevicePrefs = Record<DeviceKind, DevicePref>;

export const TAB_IDS: TabId[] = ["planner", "memo", "alarm", "settings"];
export const DEVICE_KINDS: DeviceKind[] = ["mobile", "tablet", "desktop"];

export const TAB_LABELS: Record<TabId, string> = {
  planner: "할 일 · 캘린더",
  memo: "메모",
  alarm: "알람",
  settings: "설정",
};

export const DEVICE_LABELS: Record<DeviceKind, string> = {
  mobile: "모바일(폰)",
  tablet: "타블렛",
  desktop: "PC",
};

/** 기본값: 폰=할 일, 타블렛=메모(S펜), PC=할 일 */
export function defaultDevicePrefs(): DevicePrefs {
  return {
    mobile: { startTab: "planner" },
    tablet: { startTab: "memo" },
    desktop: { startTab: "planner" },
  };
}

function normalizeTab(value: unknown, fallback: TabId): TabId {
  return TAB_IDS.includes(value as TabId) ? (value as TabId) : fallback;
}

/** 부분·손상 입력을 안전한 DevicePrefs로 정규화(누락 키는 기본값으로 채움). */
export function normalizeDevicePrefs(raw: unknown): DevicePrefs {
  const base = defaultDevicePrefs();
  if (!raw || typeof raw !== "object") return base;
  const input = raw as Partial<Record<DeviceKind, { startTab?: unknown }>>;
  const out = {} as DevicePrefs;
  for (const kind of DEVICE_KINDS) {
    out[kind] = { startTab: normalizeTab(input[kind]?.startTab, base[kind].startTab) };
  }
  return out;
}
