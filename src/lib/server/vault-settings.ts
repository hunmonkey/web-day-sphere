import "server-only";

import { constants } from "node:fs";
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import {
  defaultDevicePrefs,
  normalizeDevicePrefs,
  type DevicePrefs,
} from "@/lib/device-prefs";

type AppSettings = {
  obsidianDir?: string;
  devicePrefs?: DevicePrefs;
};

export type DirectoryEntry = {
  name: string;
  path: string;
};

function dataDir() {
  return process.env.DAY_SPHERE_DATA_DIR ?? path.join(process.cwd(), ".day-sphere");
}

function settingsFile() {
  return path.join(dataDir(), "settings.json");
}

function defaultVaultRoot() {
  return (
    process.env.DAY_SPHERE_OBSIDIAN_DIR ?? path.join(dataDir(), "obsidian-vault")
  );
}

// 폴더 탐색·저장 위치 선택의 허용 루트.
// 기본은 데이터 폴더(.day-sphere)이지만, DAY_SPHERE_BROWSE_ROOT로 더 넓게(예: /mnt/appdata) 열 수 있다.
function browseRoot() {
  return path.resolve(process.env.DAY_SPHERE_BROWSE_ROOT ?? dataDir());
}

async function readSettings(): Promise<AppSettings> {
  try {
    const raw = await readFile(settingsFile(), "utf8");
    const parsed = JSON.parse(raw) as AppSettings;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

async function writeSettings(settings: AppSettings) {
  await mkdir(dataDir(), { recursive: true });
  const target = settingsFile();
  const tmp = `${target}.tmp`;
  await writeFile(tmp, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  await rename(tmp, target);
}

function ensureInsideBrowseRoot(input: string) {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("저장 위치를 입력해 주세요.");

  const root = browseRoot();
  const resolved = path.isAbsolute(trimmed)
    ? path.resolve(trimmed)
    : path.resolve(root, trimmed);
  const relative = path.relative(root, resolved);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`저장 위치는 ${root} 안의 폴더만 사용할 수 있습니다.`);
  }
  return resolved;
}

export async function getVaultRoot() {
  const settings = await readSettings();
  return settings.obsidianDir ?? defaultVaultRoot();
}

export async function getVaultSettings() {
  return {
    dataDir: path.resolve(dataDir()),
    defaultDir: path.resolve(defaultVaultRoot()),
    targetDir: path.resolve(await getVaultRoot()),
  };
}

export async function setVaultRoot(input: string) {
  const targetDir = ensureInsideBrowseRoot(input);
  await mkdir(targetDir, { recursive: true });
  await access(targetDir, constants.W_OK);
  const settings = await readSettings();
  await writeSettings({ ...settings, obsidianDir: targetDir });
  return getVaultSettings();
}

export async function getDevicePrefs(): Promise<DevicePrefs> {
  const settings = await readSettings();
  return settings.devicePrefs
    ? normalizeDevicePrefs(settings.devicePrefs)
    : defaultDevicePrefs();
}

export async function setDevicePrefs(input: unknown): Promise<DevicePrefs> {
  const devicePrefs = normalizeDevicePrefs(input);
  const settings = await readSettings();
  await writeSettings({ ...settings, devicePrefs });
  return devicePrefs;
}

export async function listVaultDirectories(input?: string) {
  const root = browseRoot();
  await mkdir(root, { recursive: true });

  // 입력 경로가 허용 루트 밖이거나 존재하지 않으면 조용히 루트에서 다시 시작한다.
  let target = root;
  if (input) {
    try {
      const resolved = ensureInsideBrowseRoot(input);
      const info = await stat(resolved);
      if (info.isDirectory()) target = resolved;
    } catch {
      target = root;
    }
  }

  const entries = await readdir(target, { withFileTypes: true });
  const directories: DirectoryEntry[] = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => ({
      name: entry.name,
      path: path.join(target, entry.name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));

  const parent = path.resolve(target) === root ? null : path.dirname(target);
  return {
    root,
    path: target,
    parent,
    entries: directories,
  };
}
