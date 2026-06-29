import {
  strokeBBox,
  strokeOpacity,
  strokePathD,
  unionBBox,
} from "@/lib/ink-engine";
import type { InkStroke, PaperKind } from "@/lib/vault-types";

/**
 * 손글씨 획(stroke) → SVG 문자열.
 *
 * 앱(내보내기)과 서버(_assets/*.svg 저장)가 같은 결과를 내도록 단일 소스로 둔다.
 * viewBox는 획 범위에 맞춰 자동으로 잡는다. 획이 없으면 1000×600 기본 종이를 쓴다.
 */

export const INK_VIEWBOX_WIDTH = 1000;
export const INK_VIEWBOX_HEIGHT = 600;

export function strokesToSvg(
  strokes: InkStroke[],
  opts: { background?: string; paper?: PaperKind } = {},
): string {
  const box = unionBBox(strokes.map(strokeBBox));
  const pad = 36;
  const minX = box ? Math.floor(box.minX - pad) : 0;
  const minY = box ? Math.floor(box.minY - pad) : 0;
  const maxX = box ? Math.ceil(box.maxX + pad) : INK_VIEWBOX_WIDTH;
  const maxY = box ? Math.ceil(box.maxY + pad) : INK_VIEWBOX_HEIGHT;
  const w = Math.max(120, maxX - minX);
  const h = Math.max(90, maxY - minY);
  const bg = opts.background ?? "white";
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${w} ${h}" width="${w}" height="${h}">`,
    `<rect x="${minX}" y="${minY}" width="${w}" height="${h}" fill="${bg}"/>`,
    ...paperSvg(opts.paper ?? "plain", minX, minY, maxX, maxY),
  ];

  for (const stroke of strokes) {
    const d = strokePathD(stroke);
    if (!d) continue;
    const color = safeColor(stroke.color ?? "#1e1e1e");
    parts.push(
      `<path d="${d}" fill="${color}" fill-opacity="${strokeOpacity(stroke)}"/>`,
    );
  }

  parts.push("</svg>");
  return `${parts.join("\n")}\n`;
}

function safeColor(value: string) {
  return value.replace(/[<>"'&]/g, "");
}

function paperSvg(
  paper: PaperKind,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
) {
  if (paper === "plain") return [];
  const parts: string[] = [];
  const spacing = paper === "grid" ? 32 : 36;
  const color = paper === "grid" ? "#cdd8ea" : "#b9c8df";

  if (paper === "grid") {
    for (let x = Math.floor(minX / spacing) * spacing; x <= maxX; x += spacing) {
      parts.push(
        `<line x1="${x}" y1="${minY}" x2="${x}" y2="${maxY}" stroke="${color}" stroke-opacity="0.45" stroke-width="1"/>`,
      );
    }
  }

  for (let y = Math.floor(minY / spacing) * spacing; y <= maxY; y += spacing) {
    parts.push(
      `<line x1="${minX}" y1="${y}" x2="${maxX}" y2="${y}" stroke="${color}" stroke-opacity="0.5" stroke-width="1"/>`,
    );
  }
  return parts;
}
