import type { ExcalidrawScene, InkStroke } from "@/lib/vault-types";

/**
 * Excalidraw 장면 유틸 (순수 데이터 — Excalidraw 모듈을 import 하지 않아 서버/클라 공용).
 *
 * - 저장/로드 시 장면을 안전하게 정규화한다.
 * - (구) 손글씨 자유선(InkStroke[])을 Excalidraw freedraw "스켈레톤"으로 바꾼다.
 *   필수 필드 채우기는 Excalidraw의 restoreElements가 담당하므로, 여기서는 좌표/색/굵기만 만든다.
 */

export const EMPTY_SCENE: ExcalidrawScene = { elements: [] };

/** 저장값이 손상/부분일 수 있으므로 elements 배열만 보장한다. */
export function normalizeScene(raw: unknown): ExcalidrawScene {
  if (!raw || typeof raw !== "object") return { elements: [] };
  const r = raw as Partial<ExcalidrawScene>;
  return {
    elements: Array.isArray(r.elements) ? r.elements : [],
    appState: r.appState && typeof r.appState === "object" ? r.appState : undefined,
    files: r.files && typeof r.files === "object" ? r.files : undefined,
  };
}

export function isSceneEmpty(scene: ExcalidrawScene | undefined): boolean {
  return !scene || !Array.isArray(scene.elements) || scene.elements.length === 0;
}

/**
 * (구) 손글씨 → Excalidraw freedraw 스켈레톤 배열.
 * 각 stroke를 하나의 freedraw element로. 좌표계는 동일(1000×600 기준 절대좌표).
 * 반환값을 Excalidraw의 restoreElements(skeleton, null)에 넣으면 완전한 element가 된다.
 */
export function inkToFreedrawSkeleton(ink: InkStroke[]): unknown[] {
  const out: unknown[] = [];
  for (const stroke of ink ?? []) {
    const pts = (stroke.points ?? []).filter(
      (p) => typeof p.x === "number" && typeof p.y === "number",
    );
    if (pts.length === 0) continue;
    const minX = Math.min(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    out.push({
      type: "freedraw",
      x: minX,
      y: minY,
      strokeColor: stroke.color ?? "#1e1e1e",
      backgroundColor: "transparent",
      strokeWidth: typeof stroke.baseWidth === "number" ? stroke.baseWidth : 2,
      points: pts.map((p) => [p.x - minX, p.y - minY]),
      pressures: pts.map((p) => (typeof p.pressure === "number" ? p.pressure : 0.5)),
    });
  }
  return out;
}
