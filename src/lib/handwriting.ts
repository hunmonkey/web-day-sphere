import type { InkStroke } from "@/lib/vault-types";

/**
 * 손글씨 → 텍스트 변환 (브라우저 내장 Handwriting Recognition API).
 *
 * 외부 전송·API 키 없음(완전 오프라인). 기기/브라우저(주로 Chromium 계열 + 해당 언어 모델)가
 * 지원할 때만 동작하며, 미지원 환경은 checkHandwritingSupport()로 감지해 기능을 비활성화한다.
 * 우리가 이미 저장하는 stroke 좌표(+timeStamp)를 그대로 입력으로 사용한다.
 *
 * 참고: https://developer.chrome.com/docs/web-platform/handwriting-recognition
 */

type HwPoint = { x: number; y: number; t?: number };
type HwStroke = { points: HwPoint[] };
type HwHints = {
  recognitionType?: string;
  inputType?: string;
  alternatives?: number;
  textContext?: string;
};
type HwPrediction = { text: string };
type HwDrawing = {
  addStroke(stroke: HwStroke): void;
  getPrediction(): Promise<HwPrediction[]>;
  clear(): void;
};
type HwRecognizer = {
  startDrawing(hints?: HwHints): HwDrawing;
  finish?(): void;
};
type HwNavigator = {
  queryHandwritingRecognizerSupport?: (c: {
    languages?: string[];
  }) => Promise<{ languages?: boolean } | null>;
  createHandwritingRecognizer?: (c: {
    languages: string[];
  }) => Promise<HwRecognizer>;
};

function hwNavigator(): HwNavigator | null {
  if (typeof navigator === "undefined") return null;
  return navigator as unknown as HwNavigator;
}

/** API 자체가 브라우저에 있는지(동기). */
export function isHandwritingApiPresent(): boolean {
  const nav = hwNavigator();
  return !!nav?.createHandwritingRecognizer;
}

/** 주어진 언어로 변환이 가능한지(비동기, 기기 모델 보유 여부까지 확인). */
export async function checkHandwritingSupport(
  languages: string[] = ["ko"],
): Promise<boolean> {
  const nav = hwNavigator();
  if (!nav?.queryHandwritingRecognizerSupport || !nav.createHandwritingRecognizer) {
    return false;
  }
  try {
    const res = await nav.queryHandwritingRecognizerSupport({ languages });
    return !!res && res.languages !== false;
  } catch {
    return false;
  }
}

type RecognizeOptions = {
  languages?: string[];
  inputType?: "mouse" | "stylus" | "touch";
};

/** 획 묶음을 텍스트로 변환. 최상위 예측 문자열을 반환(없으면 ""). 미지원/실패 시 throw. */
export async function recognizeStrokes(
  strokes: InkStroke[],
  options: RecognizeOptions = {},
): Promise<string> {
  const nav = hwNavigator();
  if (!nav?.createHandwritingRecognizer) {
    throw new Error("이 브라우저/기기에서는 손글씨 변환을 지원하지 않습니다.");
  }
  if (strokes.length === 0) return "";

  const recognizer = await nav.createHandwritingRecognizer({
    languages: options.languages ?? ["ko"],
  });
  try {
    const drawing = recognizer.startDrawing({
      recognitionType: "text",
      inputType: options.inputType ?? "stylus",
      alternatives: 0,
    });

    // 모든 점에 실제 시간값이 있으면 그대로, 하나라도 없으면 순번으로 단조 증가 부여
    const hasAllTime = strokes.every((s) => s.points.every((p) => typeof p.t === "number"));
    let seq = 0;
    for (const stroke of strokes) {
      const points = stroke.points.map((p) => ({
        x: p.x,
        y: p.y,
        t: hasAllTime ? Math.round(p.t as number) : seq++,
      }));
      drawing.addStroke({ points });
    }

    const predictions = await drawing.getPrediction();
    drawing.clear();
    return predictions?.[0]?.text ?? "";
  } finally {
    recognizer.finish?.();
  }
}
