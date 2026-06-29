/**
 * 그림 외부 내보내기 (브라우저 클라이언트, 외부 전송 없음).
 *
 * 메모 그림은 잉크 캔버스가 표시용 SVG 문자열을 만들어 함께 저장하므로,
 * 내보내기는 그 SVG를 그대로(SVG) 또는 래스터화(JPG)해서 다운로드한다.
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

export function downloadSvg(svg: string, filename = "그림.svg") {
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

export async function downloadSvgAsJpg(
  svg: string,
  filename = "그림.jpg",
  scale = 2,
) {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = await loadImage(url);
    const w = img.naturalWidth || img.width || 1000;
    const h = img.naturalHeight || img.height || 600;
    const canvas = document.createElement("canvas");
    canvas.width = w * scale;
    canvas.height = h * scale;
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
