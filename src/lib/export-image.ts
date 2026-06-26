import type { InkStroke } from "@/lib/vault-types";
import { INK_VIEWBOX_HEIGHT, INK_VIEWBOX_WIDTH, strokesToSvg } from "@/lib/ink-svg";

/**
 * 손글씨 외부 내보내기 (브라우저 클라이언트, 외부 전송 없음).
 * - SVG: 벡터 그대로 다운로드(확대해도 안 깨짐).
 * - JPG: 캔버스로 래스터화해 이미지 파일로 다운로드.
 */

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportStrokesSvg(strokes: InkStroke[], filename = "손글씨.svg") {
  const svg = strokesToSvg(strokes);
  downloadBlob(filename, new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("이미지 변환에 실패했습니다."));
    img.src = src;
  });
}

export async function exportStrokesJpg(
  strokes: InkStroke[],
  filename = "손글씨.jpg",
  scale = 2,
) {
  const svg = strokesToSvg(strokes);
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = INK_VIEWBOX_WIDTH * scale;
    canvas.height = INK_VIEWBOX_HEIGHT * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("캔버스를 사용할 수 없습니다.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, "image/jpeg", 0.92),
    );
    if (!blob) throw new Error("JPG 생성에 실패했습니다.");
    downloadBlob(filename, blob);
  } finally {
    URL.revokeObjectURL(url);
  }
}
