import { longDate } from "@/lib/date";
import { strokesToSvg } from "@/lib/ink-svg";
import type { Memo, Task } from "@/lib/vault-types";

/**
 * 할일·캘린더 / 메모 텍스트 → PDF 내보내기.
 *
 * 한글 출력을 위해 별도 폰트를 번들하지 않고, 브라우저 인쇄 창을 띄워
 * 시스템 한글 폰트로 렌더한 뒤 사용자가 "PDF로 저장"하도록 한다(오프라인, 의존성 0).
 */

function esc(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const PRINT_CSS = `
  * { box-sizing: border-box; }
  body {
    font-family: "Pretendard", -apple-system, "Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif;
    color: #1a1a1a; margin: 32px; line-height: 1.6;
  }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 16px; margin: 24px 0 8px; border-bottom: 1px solid #e5e5e5; padding-bottom: 4px; }
  .meta { color: #888; font-size: 12px; margin-bottom: 16px; }
  ul { list-style: none; padding: 0; margin: 0; }
  li { padding: 3px 0; font-size: 14px; }
  .time { color: #2b6cff; font-variant-numeric: tabular-nums; margin-right: 6px; }
  .done { color: #999; text-decoration: line-through; }
  .memo { page-break-inside: avoid; margin-bottom: 24px; }
  .memo pre { white-space: pre-wrap; font-family: inherit; font-size: 14px; margin: 8px 0; }
  .memo svg { max-width: 100%; height: auto; border: 1px solid #e5e5e5; border-radius: 8px; }
  @page { margin: 16mm; }
`;

function openPrintWindow(title: string, bodyHtml: string) {
  const w = window.open("", "_blank");
  if (!w) {
    alert("팝업이 차단되었습니다. 브라우저에서 팝업을 허용한 뒤 다시 시도해 주세요.");
    return;
  }
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>${esc(title)}</title><style>${PRINT_CSS}</style></head>
<body>${bodyHtml}
<script>window.addEventListener("load",function(){setTimeout(function(){window.focus();window.print();},250);});</script>
</body></html>`;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function stamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function exportTasksPdf(tasks: Task[]) {
  const byDate = new Map<string, Task[]>();
  for (const t of tasks) {
    byDate.set(t.date, [...(byDate.get(t.date) ?? []), t]);
  }
  const groups = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));

  const sections = groups
    .map(([date, items]) => {
      const lis = [...items]
        .sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"))
        .map((t) => {
          const time = t.time ? `<span class="time">${esc(t.time)}</span>` : "";
          const box = t.done ? "☑" : "☐";
          const cls = t.done ? ' class="done"' : "";
          return `<li>${box} ${time}<span${cls}>${esc(t.title)}</span></li>`;
        })
        .join("");
      return `<h2>${esc(longDate(date))}</h2><ul>${lis}</ul>`;
    })
    .join("");

  const body = `<h1>할 일 · 캘린더</h1><div class="meta">Day Sphere · 내보낸 시각 ${stamp()} · 총 ${tasks.length}건</div>${
    sections || "<p>저장된 할 일이 없습니다.</p>"
  }`;
  openPrintWindow("Day Sphere — 할 일·캘린더", body);
}

function memoTitle(memo: Memo, index: number) {
  const first = (memo.text ?? "").split("\n")[0]?.trim();
  return first || `메모 ${index + 1}`;
}

export function exportMemosPdf(memos: Memo[]) {
  const sections = memos
    .map((memo, i) => {
      const hasInk = Array.isArray(memo.ink) && memo.ink.length > 0;
      const text = memo.text?.trim()
        ? `<pre>${esc(memo.text.trim())}</pre>`
        : `<pre style="color:#999">(텍스트 없음)</pre>`;
      // 그림: 저장된 표시용 SVG 우선, 없으면 잉크 원본을 다시 렌더.
      const drawing = memo.svg ? memo.svg : hasInk ? strokesToSvg(memo.ink ?? []) : "";
      return `<div class="memo"><h2>${esc(memoTitle(memo, i))}</h2>${text}${drawing}</div>`;
    })
    .join("");

  const body = `<h1>메모</h1><div class="meta">Day Sphere · 내보낸 시각 ${stamp()} · 총 ${memos.length}건</div>${
    sections || "<p>저장된 메모가 없습니다.</p>"
  }`;
  openPrintWindow("Day Sphere — 메모", body);
}
