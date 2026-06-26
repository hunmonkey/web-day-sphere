import "server-only";

import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import matter from "gray-matter";
import { longDate } from "@/lib/date";
import { strokesToSvg } from "@/lib/ink-svg";
import {
  emptyVault,
  type Alarm,
  type InkStroke,
  type Memo,
  type Task,
  type VaultData,
} from "@/lib/vault-types";

/**
 * Vault(Markdown) 저장소 — Day Sphere 데이터의 "원본".
 *
 * 폴더 구조(EXPORT_ROOT 기준):
 *   Calendar/YYYY-MM-DD.md   날짜별 할 일(체크박스, ^id 블록참조로 무손실)
 *   Memos/<id>.md            메모 텍스트(+손글씨 변환 결과). 손글씨는 본문 임베드로 표시
 *   _assets/<id>.ink.json    손글씨 획 원본(무손실, 캔버스 재편집용)
 *   _assets/<id>.svg         손글씨 표시용(Obsidian에서 보이는 이미지)
 *   Alarms.md                알람(frontmatter가 원본, 표는 표시용)
 *
 * 쓰기는 auth-store와 동일하게 tmp 작성 후 rename(원자적). "최근 수정 우선" 가드:
 * 디스크 파일이 baseSyncedAt 이후 변경됐으면(=Obsidian/Syncthing이 건드림) 덮어쓰지 않고 충돌로 보고.
 */

const EXPORT_ROOT =
  process.env.DAY_SPHERE_OBSIDIAN_DIR ??
  path.join(process.cwd(), ".day-sphere", "obsidian-vault");

const CALENDAR_DIR = "Calendar";
const MEMOS_DIR = "Memos";
const ASSETS_DIR = "_assets";
const ALARMS_FILE = "Alarms.md";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// - [x] 15:00 제목 ^id  (시간·id는 선택)
const TASK_RE = /^- \[([ xX])\]\s+(?:(\d{1,2}:\d{2})\s+)?(.*?)(?:\s+\^([\w-]+))?\s*$/;

export function getVaultRoot() {
  return EXPORT_ROOT;
}

// ─────────────────────────────── 공용 유틸 ───────────────────────────────

function abs(relativePath: string) {
  return path.join(EXPORT_ROOT, relativePath);
}

function rel(fullPath: string) {
  return path.relative(EXPORT_ROOT, fullPath).replace(/\\/g, "/");
}

function safeId(value: string | undefined, fallback: string) {
  const cleaned = (value ?? "")
    .normalize("NFKC")
    .replace(/[^\w-]/g, "-")
    .slice(0, 80);
  return cleaned || fallback;
}

/** 알람 표기용: 초가 00이면 HH:MM, 아니면 HH:MM:SS */
function fmtAt(at: string) {
  const [h, m, s] = at.split(":");
  return s === "00" ? `${h}:${m}` : `${h}:${m}:${s ?? "00"}`;
}

async function listMd(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(abs(dir), { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".md"))
      .map((e) => e.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function readTextOrNull(relativePath: string): Promise<string | null> {
  try {
    return await readFile(abs(relativePath), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

// ─────────────────────────────── 생성(state → md) ───────────────────────────────

function taskLine(t: Task) {
  const check = t.done ? "x" : " ";
  const time = t.time ? `${t.time} ` : "";
  const title = (t.title ?? "").replace(/\r?\n/g, " ").trim() || "제목 없음";
  return `- [${check}] ${time}${title} ^${safeId(t.id, "task")}`;
}

function generateDayNote(date: string, tasks: Task[]) {
  const body = tasks.map(taskLine).join("\n");
  const content = `\n# ${longDate(date)}\n\n## 할 일\n\n${body}\n`;
  return matter.stringify(content, { date, source: "Day Sphere" });
}

function memoText(memo: Memo) {
  return (memo.text ?? "").replace(/\r\n/g, "\n");
}

function generateMemo(memo: Memo) {
  const hasInk = Array.isArray(memo.ink) && memo.ink.length > 0;
  const data: Record<string, unknown> = { id: memo.id, source: "Day Sphere" };
  if (memo.created) data.created = memo.created;
  if (hasInk) data.ink = `${ASSETS_DIR}/${memo.id}.ink.json`;
  let content = `\n${memoText(memo)}\n`;
  if (hasInk) content += `\n![[${ASSETS_DIR}/${memo.id}.svg]]\n`;
  return matter.stringify(content, data);
}

function generateAlarms(alarms: Alarm[]) {
  const rows = alarms
    .map((a) => `| ${fmtAt(a.at)} | ${a.on ? "켜짐" : "꺼짐"} |`)
    .join("\n");
  const table = `| 시각 | 상태 |\n| --- | --- |${rows ? `\n${rows}` : ""}`;
  const content = `\n# 알람\n\n${table}\n`;
  return matter.stringify(content, { source: "Day Sphere", alarms });
}

// ─────────────────────────────── 파싱(md → state) ───────────────────────────────

function parseDayNote(date: string, raw: string): Task[] {
  const { content } = matter(raw);
  const tasks: Task[] = [];
  for (const line of content.split("\n")) {
    const m = TASK_RE.exec(line.trim());
    if (!m) continue;
    const title = m[3].trim();
    if (!title) continue;
    tasks.push({
      id: m[4] ?? randomUUID(),
      date,
      time: m[2] ?? "",
      title,
      done: m[1].toLowerCase() === "x",
    });
  }
  return tasks;
}

async function parseMemoFile(fileName: string): Promise<Memo> {
  const raw = (await readTextOrNull(`${MEMOS_DIR}/${fileName}`)) ?? "";
  const { data, content } = matter(raw);
  const id = typeof data.id === "string" ? data.id : fileName.replace(/\.md$/i, "");

  // 우리가 붙인 표시용 임베드(![[_assets/<id>.svg]])는 텍스트가 아니므로 제거
  const text = content
    .replace(new RegExp(`!\\[\\[${ASSETS_DIR}/${id}\\.svg\\]\\]\\s*$`), "")
    .trim();

  let ink: InkStroke[] | undefined;
  if (typeof data.ink === "string") {
    const inkRaw = await readTextOrNull(data.ink);
    if (inkRaw) {
      try {
        const parsed = JSON.parse(inkRaw) as InkStroke[];
        if (Array.isArray(parsed) && parsed.length > 0) ink = parsed;
      } catch {
        // 손상된 사이드카는 무시(텍스트는 보존)
      }
    }
  }

  const memo: Memo = { id, text };
  if (typeof data.created === "string") memo.created = data.created;
  if (ink) memo.ink = ink;
  return memo;
}

function parseAlarms(raw: string): Alarm[] {
  const { data } = matter(raw);
  const list = Array.isArray(data.alarms) ? data.alarms : [];
  return list
    .map((a): Alarm | null => {
      if (!a || typeof a !== "object") return null;
      const r = a as Record<string, unknown>;
      const at = String(r.at ?? "");
      if (!at) return null;
      return {
        id: typeof r.id === "string" ? r.id : randomUUID(),
        at,
        on: r.on === true || r.on === "true",
      };
    })
    .filter((a): a is Alarm => a !== null);
}

// ─────────────────────────────── 읽기 ───────────────────────────────

export async function readVault(): Promise<{ data: VaultData; syncedAt: number }> {
  const data = emptyVault();

  for (const name of await listMd(CALENDAR_DIR)) {
    const date = name.replace(/\.md$/i, "");
    if (!DATE_RE.test(date)) continue;
    const raw = await readTextOrNull(`${CALENDAR_DIR}/${name}`);
    if (raw) data.tasks.push(...parseDayNote(date, raw));
  }

  for (const name of await listMd(MEMOS_DIR)) {
    data.memos.push(await parseMemoFile(name));
  }

  const alarmsRaw = await readTextOrNull(ALARMS_FILE);
  if (alarmsRaw) data.alarms = parseAlarms(alarmsRaw);

  return { data, syncedAt: Date.now() };
}

// ─────────────────────────────── 쓰기(원자적 + 충돌 가드) ───────────────────────────────

async function writeAtomic(relativePath: string, content: string) {
  const full = abs(relativePath);
  await mkdir(path.dirname(full), { recursive: true });
  const tmp = `${full}.tmp`;
  await writeFile(tmp, content, "utf8");
  await rename(tmp, full);
}

type WriteCtx = { base: number; written: string[]; conflicts: string[] };

/** 내용이 바뀌었고 충돌이 없을 때만 기록. base 이후 외부 수정이 있으면 충돌로 보고하고 보존. */
async function writeIfSafe(relativePath: string, content: string, ctx: WriteCtx) {
  const full = abs(relativePath);
  let existing: string | null = null;
  let mtime = 0;
  try {
    mtime = (await stat(full)).mtimeMs;
    existing = await readFile(full, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (existing === content) return;
  if (existing !== null && ctx.base > 0 && mtime > ctx.base) {
    ctx.conflicts.push(rel(full));
    return;
  }
  await writeAtomic(relativePath, content);
  ctx.written.push(rel(full));
}

/** base 이후 외부 수정이 없을 때만 삭제. */
async function deleteIfSafe(relativePath: string, ctx: WriteCtx) {
  const full = abs(relativePath);
  try {
    const mtime = (await stat(full)).mtimeMs;
    if (ctx.base > 0 && mtime > ctx.base) {
      ctx.conflicts.push(rel(full));
      return;
    }
    await unlink(full);
    ctx.written.push(`삭제: ${rel(full)}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function writeVault(
  data: VaultData,
  baseSyncedAt = 0,
): Promise<{ syncedAt: number; written: string[]; conflicts: string[] }> {
  const ctx: WriteCtx = { base: baseSyncedAt, written: [], conflicts: [] };

  // 1) 할 일 → 날짜별 노트
  const byDate = new Map<string, Task[]>();
  for (const t of data.tasks) {
    if (!DATE_RE.test(t.date)) continue;
    byDate.set(t.date, [...(byDate.get(t.date) ?? []), t]);
  }
  for (const [date, tasks] of byDate) {
    await writeIfSafe(`${CALENDAR_DIR}/${date}.md`, generateDayNote(date, tasks), ctx);
  }
  for (const name of await listMd(CALENDAR_DIR)) {
    const date = name.replace(/\.md$/i, "");
    if (DATE_RE.test(date) && !byDate.has(date)) {
      await deleteIfSafe(`${CALENDAR_DIR}/${name}`, ctx);
    }
  }

  // 2) 메모 → Memos/<id>.md + 손글씨 사이드카/표시용
  const memoIds = new Set(data.memos.map((m) => m.id));
  for (const memo of data.memos) {
    await writeIfSafe(`${MEMOS_DIR}/${memo.id}.md`, generateMemo(memo), ctx);
    const hasInk = Array.isArray(memo.ink) && memo.ink.length > 0;
    if (hasInk) {
      await writeIfSafe(
        `${ASSETS_DIR}/${memo.id}.ink.json`,
        `${JSON.stringify(memo.ink, null, 2)}\n`,
        ctx,
      );
      await writeIfSafe(`${ASSETS_DIR}/${memo.id}.svg`, strokesToSvg(memo.ink ?? []), ctx);
    } else {
      await deleteIfSafe(`${ASSETS_DIR}/${memo.id}.ink.json`, ctx);
      await deleteIfSafe(`${ASSETS_DIR}/${memo.id}.svg`, ctx);
    }
  }
  for (const name of await listMd(MEMOS_DIR)) {
    const id = name.replace(/\.md$/i, "");
    if (!memoIds.has(id)) {
      await deleteIfSafe(`${MEMOS_DIR}/${name}`, ctx);
      await deleteIfSafe(`${ASSETS_DIR}/${id}.ink.json`, ctx);
      await deleteIfSafe(`${ASSETS_DIR}/${id}.svg`, ctx);
    }
  }

  // 3) 알람
  await writeIfSafe(ALARMS_FILE, generateAlarms(data.alarms), ctx);

  return { syncedAt: Date.now(), written: ctx.written, conflicts: ctx.conflicts };
}
