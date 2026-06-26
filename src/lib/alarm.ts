export type Alarm = { id: string; at: string; on: boolean }; // at = "HH:MM:SS" 목표 시각(매일 반복)

const p2 = (n: number) => String(n).padStart(2, "0");

/** 현재 시각을 "HH:MM:SS" 문자열로 */
export function nowHHMMSS(d = new Date()) {
  return `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
}

/** 현재 시각(current "HH:MM:SS") 기준 다가오는 켜진 알람. 오늘 남은 게 없으면 가장 이른 것(내일). */
export function nextUpcoming(alarms: Alarm[], current: string): string | null {
  const on = alarms.filter((a) => a.on).map((a) => a.at).sort();
  if (on.length === 0) return null;
  return on.find((t) => t > current) ?? on[0];
}

/** 표시용: 초가 00이면 HH:MM, 아니면 HH:MM:SS */
export function fmtAt(at: string) {
  const [h, m, s] = at.split(":");
  return s === "00" ? `${h}:${m}` : `${h}:${m}:${s}`;
}

/** Web Audio 짧은 알림음 (브라우저 정책상 사전 사용자 클릭이 있어야 소리가 납니다). */
export function beep() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.7);
    osc.start();
    osc.stop(ctx.currentTime + 0.7);
    osc.onended = () => ctx.close();
  } catch {
    // 오디오 미지원/차단 시 배너만 표시
  }
}
