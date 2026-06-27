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

type AppSettings = {
  obsidianDir?: string;
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

function ensureInsideDataDir(input: string) {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("저장 위치를 입력해 주세요.");

  const root = path.resolve(dataDir());
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
  const targetDir = ensureInsideDataDir(input);
  await mkdir(targetDir, { recursive: true });
  await access(targetDir, constants.W_OK);
  const settings = await readSettings();
  await writeSettings({ ...settings, obsidianDir: targetDir });
  return getVaultSettings();
}

export async function listVaultDirectories(input?: string) {
  const root = path.resolve(dataDir());
  await mkdir(root, { recursive: true });

  const target = input ? ensureInsideDataDir(input) : root;
  const info = await stat(target);
  if (!info.isDirectory()) throw new Error("폴더만 선택할 수 있습니다.");

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
