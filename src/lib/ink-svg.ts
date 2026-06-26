import type { InkStroke } from "@/lib/vault-types";

/**
 * 손글씨 획(stroke) → SVG 문자열.
 *
 * 앱(내보내기)과 서버(_assets/*.svg 저장)가 같은 결과를 내도록 단일 소스로 둔다.
 * 좌표계는 캔버스와 동일한 1000×600 viewBox.
 */

export const INK_VIEWBOX_WIDTH = 1000;
export const INK_VIEWBOX_HEIGHT = 600;

export function strokesToSvg(
  strokes: InkStroke[],
  opts: { background?: string } = {},
): string {
  const w = INK_VIEWBOX_WIDTH;
  const h = INK_VIEWBOX_HEIGHT;
  const bg = opts.background ?? "white";
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`,
    `<rect width="${w}" height="${h}" fill="${bg}"/>`,
  ];

  for (const stroke of strokes) {
    const points = (stroke.points ?? []).filter(
      (p) =>
        typeof p.x === "number" &&
        typeof p.y === "number" &&
        typeof p.pressure === "number",
    );
    const color = (stroke.color ?? "#5b8cff").replace(/[<>"]/g, "");
    const baseWidth = typeof stroke.baseWidth === "number" ? stroke.baseWidth : 6;
    if (points.length === 1) {
      const p = points[0];
      const r = (baseWidth * (0.5 + p.pressure)) / 2;
      parts.push(`<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="${color}"/>`);
      continue;
    }
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const p = points[i];
      const width = baseWidth * (0.5 + Math.max(prev.pressure, p.pressure));
      parts.push(
        `<line x1="${prev.x}" y1="${prev.y}" x2="${p.x}" y2="${p.y}" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`,
      );
    }
  }

  parts.push("</svg>");
  return `${parts.join("\n")}\n`;
}
