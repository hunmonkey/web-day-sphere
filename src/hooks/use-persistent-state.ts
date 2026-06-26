"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

/**
 * useState와 동일하게 쓰되 값이 localStorage에 자동 저장되는 훅.
 *
 * SSR 안전: 서버/클라이언트 첫 렌더는 initial 값으로 동일하게 그려 hydration 불일치를 막고,
 * 마운트된 뒤에 저장값을 불러와 반영한다. 저장값을 불러오기 전에는 덮어쓰지 않는다.
 *
 * 추후 DB(Prisma + PostgreSQL) 연동 시, 이 훅의 load/save 부분만 서버 호출로 교체하면 된다.
 */
export function usePersistentState<T>(
  key: string,
  initial: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);

  // 마운트 후 1회 저장값 로드
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) setState(JSON.parse(raw) as T);
    } catch {
      // 손상된 값은 무시하고 initial 유지
    }
    setLoaded(true);
  }, [key]);

  // 로드 완료 후 변경분 저장
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // 저장 용량 초과 등은 조용히 무시
    }
  }, [key, state, loaded]);

  return [state, setState];
}
