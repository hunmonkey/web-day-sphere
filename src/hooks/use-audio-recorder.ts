"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 브라우저 내장 MediaRecorder로 음성을 녹음한다(외부 전송/API 키 없음).
 * start() 뒤 stop()을 호출하면 녹음 Blob과 길이(ms)를 돌려준다.
 * 지원 여부(supported)가 false면 버튼을 비활성화한다.
 */
export type RecorderState = "idle" | "recording";

export function useAudioRecorder() {
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const resolveRef = useRef<
    ((r: { blob: Blob; duration: number } | null) => void) | null
  >(null);

  const supported =
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback(async () => {
    if (!supported) {
      setError("이 브라우저는 녹음을 지원하지 않아요.");
      return false;
    }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        clearTimer();
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, {
          type: rec.mimeType || "audio/webm",
        });
        const duration = Date.now() - startedRef.current;
        setState("idle");
        resolveRef.current?.({ blob, duration });
        resolveRef.current = null;
      };
      recRef.current = rec;
      startedRef.current = Date.now();
      rec.start();
      setState("recording");
      setElapsed(0);
      timerRef.current = window.setInterval(() => {
        setElapsed(Date.now() - startedRef.current);
      }, 200);
      return true;
    } catch {
      setError("마이크 권한이 필요해요.");
      setState("idle");
      return false;
    }
  }, [supported, clearTimer]);

  const stop = useCallback(() => {
    return new Promise<{ blob: Blob; duration: number } | null>((resolve) => {
      const rec = recRef.current;
      if (!rec || rec.state === "inactive") {
        resolve(null);
        return;
      }
      resolveRef.current = resolve;
      rec.stop();
    });
  }, []);

  // 언마운트 때 진행 중인 녹음과 타이머 정리
  useEffect(() => {
    return () => {
      clearTimer();
      const rec = recRef.current;
      if (rec && rec.state !== "inactive") rec.stop();
    };
  }, [clearTimer]);

  return { supported, state, elapsed, error, start, stop };
}
