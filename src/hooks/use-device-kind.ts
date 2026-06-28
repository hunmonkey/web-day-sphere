"use client";

import { useEffect, useState } from "react";
import type { DeviceKind } from "@/lib/device-prefs";

/**
 * 현재 기기 유형 감지(폰/타블렛/PC).
 *
 * 포인터(터치 여부) + 화면의 짧은 변으로 판별해 회전(가로/세로)에 안정적이다.
 *  - 마우스 주력(any-pointer: fine 전용)        → desktop(PC)
 *  - 터치 가능 + 짧은 변 < 600px                 → mobile(폰: 짧은 변 ~412)
 *  - 터치 가능 + 짧은 변 ≥ 600px                 → tablet(탭S11: 짧은 변 ~840, 가로/세로 무관)
 *
 * SSR 안전: 서버/첫 렌더는 null(미확정), 마운트 후 확정. resize/회전 시 갱신.
 */
function detect(): DeviceKind {
  const coarse = window.matchMedia("(any-pointer: coarse)").matches;
  if (!coarse) return "desktop";
  const minDim = Math.min(window.innerWidth, window.innerHeight);
  return minDim < 600 ? "mobile" : "tablet";
}

export function useDeviceKind(): DeviceKind | null {
  const [kind, setKind] = useState<DeviceKind | null>(null);

  useEffect(() => {
    const update = () => setKind(detect());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return kind;
}
