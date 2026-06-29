import "server-only";

import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import matter from "gray-matter";
import { longDate } from "@/lib/date";
import { getVaultRoot as getConfiguredVaultRoot } from "@/lib/server/vault-settings";
import {
  emptyVault,
  type Alarm,
  type AudioClip,
  type ExcalidrawScene,
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

const CALENDAR_DIR = "Calendar";
const MEMOS_DIR = "Memos";
const ASSETS_DIR = "_assets";
const ALARMS_FILE = "Alarms.md";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// - [x] 15:00 제목 ^id  (시간·id는 선택)
const TASK_RE = /^- \[([ xX])\]\s+(?:(\d{1,2}:\d{2})\s+)?(.*?)(?:\s+\^([\w-]+))?\s*$/;

export async function getVaultRoot() {
  return getConfiguredVaultRoot();
}

// ─────────────────────────────── 공용 유틸 ───────────────────────────────

function abs(root: string, relativePath: string) {
  return path.join(root, relativePath);
}

function rel(root: string, fullPath: string) {
  return path.relative(root, fullPath).replace(/\\/g, "/");
}

function safeId(value: string | undefined, fallback: string) {
  const cleaned = (value ?? "")
    .normalize("NFKC")
    .replace(/[^\w-]/g, "-")
    .slice(0, 80);
  return cleaned || fallback;
}

/** 음성 클립의 사이드카 상대 경로(서버·클라 공통 규칙). 항상 같은 함수로 만들어 어긋나지 않게. */
function audioRel(memoId: string, clipId: string) {
  return `${ASSETS_DIR}/${safeId(memoId, "memo")}.audio-${safeId(clipId, "clip")}.webm`;
}

/** 알람 표기용: 초가 00이면 HH:MM, 아니면 HH:MM:SS */
function fmtAt(at: string) {
  const [h, m, s] = at.split(":");
  return s === "00" ? `${h}:${m}` : `${h}:${m}:${s ?? "00"}`;
}

async function listMd(root: string, dir: string): Promise<string[]> {
  try {
    const entries = await readdir(abs(root, dir), { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".md"))
      .map((e) => e.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function readTextOrNull(
  root: string,
  relativePath: string,
): Promise<string | null> {
  try {
    return await readFile(abs(root, relativePath), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function exists(root: string, relativePath: string): Promise<boolean> {
  try {
    await stat(abs(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

/** _assets 폴더의 파일 이름 목록(없으면 빈 배열). 오디오 고아 정리에 사용. */
async function listAssets(root: string): Promise<string[]> {
  try {
    const entries = await readdir(abs(root, ASSETS_DIR), { withFileTypes: true });
    return entries.filter((e) => e.isFile()).map((e) => e.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

// ─────────────────────────────── 음성 사이드카(바이너리) ───────────────────────────────

/** 녹음 파일 저장(원자적). 메타데이터는 메모 md(frontmatter)가 따로 보관한다. */
export async function saveAudio(memoId: string, clipId: string, buf: Buffer) {
  const root = await getVaultRoot();
  const full = abs(root, audioRel(memoId, clipId));
  await mkdir(path.dirname(full), { recursive: true });
  const tmp = `${full}.tmp`;
  await writeFile(tmp, buf);
  await rename(tmp, full);
}

export async function readAudio(
  memoId: string,
  clipId: string,
): Promise<Buffer | null> {
  const root = await getVaultRoot();
  try {
    return await readFile(abs(root, audioRel(memoId, clipId)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function deleteAudio(memoId: string, clipId: string) {
  const root = await getVaultRoot();
  try {
    await unlink(abs(root, audioRel(memoId, clipId)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
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

function hasScene(memo: Memo) {
  return Array.isArray(memo.scene?.elements) && (memo.scene?.elements.length ?? 0) > 0;
}

function generateMemo(memo: Memo) {
  const scene = hasScene(memo);
  const ink = !scene && Array.isArray(memo.ink) && memo.ink.length > 0; // 레거시 손글씨
  const audio = Array.isArray(memo.audio)
    ? memo.audio.filter((c) => c && typeof c.id === "string")
    : [];
  const data: Record<string, unknown> = { id: memo.id, source: "Day Sphere" };
  if (memo.created) data.created = memo.created;
  if (scene) data.excalidraw = `${ASSETS_DIR}/${memo.id}.excalidraw`;
  else if (ink) data.ink = `${ASSETS_DIR}/${memo.id}.ink.json`;
  if (audio.length > 0) {
    data.audio = audio.map((c) => ({
      id: c.id,
      created: c.created,
      duration: c.duration,
    }));
  }
  let content = `\n${memoText(memo)}\n`;
  if (scene || ink) content += `\n![[${ASSETS_DIR}/${memo.id}.svg]]\n`;
  // Obsidian에서도 첨부 음성을 바로 들을 수 있게 임베드(webm 오디오 지원).
  for (const c of audio) content += `\n![[${audioRel(memo.id, c.id)}]]\n`;
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

async function parseMemoFile(root: string, fileName: string): Promise<Memo> {
  const raw = (await readTextOrNull(root, `${MEMOS_DIR}/${fileName}`)) ?? "";
  const { data, content } = matter(raw);
  const id = typeof data.id === "string" ? data.id : fileName.replace(/\.md$/i, "");

  // 우리가 붙인 표시용 임베드(![[_assets/<id>...]])는 텍스트가 아니므로 제거
  // (SVG 미리보기 + 음성 webm 임베드 모두 — 본문 텍스트만 남긴다)
  const text = content
    .replace(new RegExp(`!\\[\\[${ASSETS_DIR}/${id}[^\\]]*\\]\\]\\s*`, "g"), "")
    .trim();

  const memo: Memo = { id, text };
  if (typeof data.created === "string") memo.created = data.created;

  // 첨부 음성: frontmatter의 메타데이터를 읽되, 실제 파일이 있는 클립만 살린다(끊긴 재생 방지).
  if (Array.isArray(data.audio)) {
    const clips: AudioClip[] = [];
    for (const a of data.audio) {
      if (!a || typeof a !== "object") continue;
      const r = a as Record<string, unknown>;
      const clipId = typeof r.id === "string" ? r.id : "";
      if (!clipId) continue;
      if (!(await exists(root, audioRel(id, clipId)))) continue;
      clips.push({
        id: clipId,
        created: typeof r.created === "string" ? r.created : "",
        duration: typeof r.duration === "number" ? r.duration : 0,
      });
    }
    if (clips.length > 0) memo.audio = clips;
  }

  // 그림(Excalidraw) 우선, 없으면 (구) 손글씨를 레거시로 읽는다.
  if (typeof data.excalidraw === "string") {
    const sceneRaw = await readTextOrNull(root, data.excalidraw);
    if (sceneRaw) {
      try {
        const parsed = JSON.parse(sceneRaw) as ExcalidrawScene;
        if (parsed && Array.isArray(parsed.elements)) memo.scene = parsed;
      } catch {
        // 손상된 장면은 무시(텍스트는 보존)
      }
    }
  } else if (typeof data.ink === "string") {
    const inkRaw = await readTextOrNull(root, data.ink);
    if (inkRaw) {
      try {
        const parsed = JSON.parse(inkRaw) as InkStroke[];
        if (Array.isArray(parsed) && parsed.length > 0) memo.ink = parsed;
      } catch {
        // 손상된 사이드카는 무시
      }
    }
  }
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
  const root = await getVaultRoot();
  const data = emptyVault();

  for (const name of await listMd(root, CALENDAR_DIR)) {
    const date = name.replace(/\.md$/i, "");
    if (!DATE_RE.test(date)) continue;
    const raw = await readTextOrNull(root, `${CALENDAR_DIR}/${name}`);
    if (raw) data.tasks.push(...parseDayNote(date, raw));
  }

  for (const name of await listMd(root, MEMOS_DIR)) {
    data.memos.push(await parseMemoFile(root, name));
  }

  const alarmsRaw = await readTextOrNull(root, ALARMS_FILE);
  if (alarmsRaw) data.alarms = parseAlarms(alarmsRaw);

  return { data, syncedAt: Date.now() };
}

// ─────────────────────────────── 쓰기(원자적 + 충돌 가드) ───────────────────────────────

async function writeAtomic(root: string, relativePath: string, content: string) {
  const full = abs(root, relativePath);
  await mkdir(path.dirname(full), { recursive: true });
  const tmp = `${full}.tmp`;
  await writeFile(tmp, content, "utf8");
  await rename(tmp, full);
}

type WriteCtx = {
  base: number;
  root: string;
  written: string[];
  conflicts: string[];
};

/** 내용이 바뀌었고 충돌이 없을 때만 기록. base 이후 외부 수정이 있으면 충돌로 보고하고 보존. */
async function writeIfSafe(relativePath: string, content: string, ctx: WriteCtx) {
  const full = abs(ctx.root, relativePath);
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
    ctx.conflicts.push(rel(ctx.root, full));
    return;
  }
  await writeAtomic(ctx.root, relativePath, content);
  ctx.written.push(rel(ctx.root, full));
}

/** base 이후 외부 수정이 없을 때만 삭제. */
async function deleteIfSafe(relativePath: string, ctx: WriteCtx) {
  const full = abs(ctx.root, relativePath);
  try {
    const mtime = (await stat(full)).mtimeMs;
    if (ctx.base > 0 && mtime > ctx.base) {
      ctx.conflicts.push(rel(ctx.root, full));
      return;
    }
    await unlink(full);
    ctx.written.push(`삭제: ${rel(ctx.root, full)}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function writeVault(
  data: VaultData,
  baseSyncedAt = 0,
): Promise<{ syncedAt: number; written: string[]; conflicts: string[] }> {
  const ctx: WriteCtx = {
    base: baseSyncedAt,
    root: await getVaultRoot(),
    written: [],
    conflicts: [],
  };

  // 1) 할 일 → 날짜별 노트
  const byDate = new Map<string, Task[]>();
  for (const t of data.tasks) {
    if (!DATE_RE.test(t.date)) continue;
    byDate.set(t.date, [...(byDate.get(t.date) ?? []), t]);
  }
  for (const [date, tasks] of byDate) {
    await writeIfSafe(`${CALENDAR_DIR}/${date}.md`, generateDayNote(date, tasks), ctx);
  }
  for (const name of await listMd(ctx.root, CALENDAR_DIR)) {
    const date = name.replace(/\.md$/i, "");
    if (DATE_RE.test(date) && !byDate.has(date)) {
      await deleteIfSafe(`${CALENDAR_DIR}/${name}`, ctx);
    }
  }

  // 2) 메모 → Memos/<id>.md + 그림 사이드카(.excalidraw 원본 + .svg 표시용)
  // 오디오는 별도 엔드포인트가 디스크에 먼저 쓰므로, 여기선 메타데이터에 없는 고아 파일만 정리한다.
  // 갓 업로드된 파일은 mtime이 base보다 커서 deleteIfSafe가 건드리지 않는다(경쟁 상태 보호).
  const assetFiles = await listAssets(ctx.root);
  const memoIds = new Set(data.memos.map((m) => m.id));
  for (const memo of data.memos) {
    await writeIfSafe(`${MEMOS_DIR}/${memo.id}.md`, generateMemo(memo), ctx);
    if (hasScene(memo)) {
      await writeIfSafe(
        `${ASSETS_DIR}/${memo.id}.excalidraw`,
        `${JSON.stringify(memo.scene, null, 2)}\n`,
        ctx,
      );
      // 표시용 SVG는 클라이언트가 생성해 보낸 값을 그대로 기록(서버는 생성하지 않음).
      if (memo.svg) await writeIfSafe(`${ASSETS_DIR}/${memo.id}.svg`, memo.svg, ctx);
      else await deleteIfSafe(`${ASSETS_DIR}/${memo.id}.svg`, ctx);
      await deleteIfSafe(`${ASSETS_DIR}/${memo.id}.ink.json`, ctx); // 레거시 정리
    } else if (Array.isArray(memo.ink) && memo.ink.length > 0) {
      // 레거시: 아직 그림으로 열지 않은 손글씨 — 기존 .ink.json/.svg를 보존
      await writeIfSafe(
        `${ASSETS_DIR}/${memo.id}.ink.json`,
        `${JSON.stringify(memo.ink, null, 2)}\n`,
        ctx,
      );
    } else {
      await deleteIfSafe(`${ASSETS_DIR}/${memo.id}.excalidraw`, ctx);
      await deleteIfSafe(`${ASSETS_DIR}/${memo.id}.ink.json`, ctx);
      await deleteIfSafe(`${ASSETS_DIR}/${memo.id}.svg`, ctx);
    }

    // 이 메모에 더 이상 속하지 않는 오디오 사이드카 정리
    const keepAudio = new Set(
      (memo.audio ?? []).map((c) => audioRel(memo.id, c.id)),
    );
    const audioPrefix = `${safeId(memo.id, "memo")}.audio-`;
    for (const name of assetFiles) {
      if (!name.startsWith(audioPrefix) || !name.endsWith(".webm")) continue;
      const relP = `${ASSETS_DIR}/${name}`;
      if (!keepAudio.has(relP)) await deleteIfSafe(relP, ctx);
    }
  }
  for (const name of await listMd(ctx.root, MEMOS_DIR)) {
    const id = name.replace(/\.md$/i, "");
    if (!memoIds.has(id)) {
      await deleteIfSafe(`${MEMOS_DIR}/${name}`, ctx);
      await deleteIfSafe(`${ASSETS_DIR}/${id}.excalidraw`, ctx);
      await deleteIfSafe(`${ASSETS_DIR}/${id}.ink.json`, ctx);
      await deleteIfSafe(`${ASSETS_DIR}/${id}.svg`, ctx);
      const audioPrefix = `${safeId(id, "memo")}.audio-`;
      for (const asset of assetFiles) {
        if (asset.startsWith(audioPrefix) && asset.endsWith(".webm")) {
          await deleteIfSafe(`${ASSETS_DIR}/${asset}`, ctx);
        }
      }
    }
  }

  // 3) 알람
  await writeIfSafe(ALARMS_FILE, generateAlarms(data.alarms), ctx);

  return { syncedAt: Date.now(), written: ctx.written, conflicts: ctx.conflicts };
}
