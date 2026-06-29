import { getStroke, type StrokeOptions } from "perfect-freehand";
import type { InkPoint, InkStroke, InkTool, PaperKind } from "@/lib/vault-types";

export type Point = { x: number; y: number };

export type BBox = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type StrokeTuple = [number, number, number];

const DEFAULT_TOOL: InkTool = "pen";

const TOOL_OPTIONS: Record<
  InkTool,
  { opacity: number; options: Omit<StrokeOptions, "size" | "last"> }
> = {
  pen: {
    opacity: 1,
    options: {
      thinning: 0.52,
      smoothing: 0.55,
      streamline: 0.42,
      simulatePressure: false,
    },
  },
  pencil: {
    opacity: 0.82,
    options: {
      thinning: 0.64,
      smoothing: 0.42,
      streamline: 0.32,
      simulatePressure: false,
    },
  },
  fountain: {
    opacity: 1,
    options: {
      thinning: 0.78,
      smoothing: 0.62,
      streamline: 0.48,
      simulatePressure: false,
      start: { taper: 4 },
      end: { taper: 14 },
    },
  },
  highlighter: {
    opacity: 0.34,
    options: {
      thinning: 0,
      smoothing: 0.35,
      streamline: 0.2,
      simulatePressure: false,
      start: { cap: true },
      end: { cap: true },
    },
  },
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function cleanTool(tool: InkStroke["tool"]): InkTool {
  return tool && tool in TOOL_OPTIONS ? tool : DEFAULT_TOOL;
}

function cleanPoints(points: InkPoint[]): StrokeTuple[] {
  return points
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    .map((p) => [
      p.x,
      p.y,
      clamp(Number.isFinite(p.pressure) ? p.pressure : 0.5, 0.05, 1),
    ]);
}

function n(value: number) {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
}

function average(a: number, b: number) {
  return (a + b) / 2;
}

function circlePath(x: number, y: number, r: number) {
  const radius = Math.max(r, 0.5);
  return [
    `M ${n(x - radius)} ${n(y)}`,
    `a ${n(radius)} ${n(radius)} 0 1 0 ${n(radius * 2)} 0`,
    `a ${n(radius)} ${n(radius)} 0 1 0 ${n(-radius * 2)} 0`,
  ].join(" ");
}

export function strokeOpacity(stroke: InkStroke) {
  const explicit = stroke.opacity;
  if (typeof explicit === "number") return clamp(explicit, 0.05, 1);
  return TOOL_OPTIONS[cleanTool(stroke.tool)].opacity;
}

export function strokePathD(stroke: InkStroke, last = true) {
  const points = cleanPoints(stroke.points ?? []);
  if (points.length === 0) return "";
  const tool = cleanTool(stroke.tool);
  const size = Math.max(1, stroke.baseWidth || 2);
  if (points.length === 1) {
    const [x, y, pressure] = points[0];
    return circlePath(x, y, (size * (0.55 + pressure * 0.45)) / 2);
  }

  const outline = getStroke(points, {
    ...TOOL_OPTIONS[tool].options,
    size,
    last,
  });
  return outlineToPath(outline);
}

export function outlineToPath(points: number[][], closed = true) {
  const len = points.length;
  if (len < 4) return "";

  let a = points[0];
  let b = points[1];
  const c = points[2];
  let result = `M ${n(a[0])} ${n(a[1])} Q ${n(b[0])} ${n(b[1])} ${n(
    average(b[0], c[0]),
  )} ${n(average(b[1], c[1]))} T `;

  for (let i = 2, max = len - 1; i < max; i += 1) {
    a = points[i];
    b = points[i + 1];
    result += `${n(average(a[0], b[0]))} ${n(average(a[1], b[1]))} `;
  }

  return closed ? `${result}Z` : result;
}

export function strokeBBox(stroke: InkStroke): BBox | null {
  const points = stroke.points ?? [];
  if (points.length === 0) return null;
  const pad = Math.max(6, (stroke.baseWidth || 2) * 1.5);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  if (!Number.isFinite(minX)) return null;
  return {
    minX: minX - pad,
    minY: minY - pad,
    maxX: maxX + pad,
    maxY: maxY + pad,
  };
}

export function unionBBox(boxes: Array<BBox | null>): BBox | null {
  const valid = boxes.filter((box): box is BBox => box !== null);
  if (valid.length === 0) return null;
  return valid.reduce((acc, box) => ({
    minX: Math.min(acc.minX, box.minX),
    minY: Math.min(acc.minY, box.minY),
    maxX: Math.max(acc.maxX, box.maxX),
    maxY: Math.max(acc.maxY, box.maxY),
  }));
}

export function pointToSegmentDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

export function hitTestStroke(stroke: InkStroke, point: Point, tolerance = 7) {
  const points = stroke.points ?? [];
  if (points.length === 0) return false;
  const radius = Math.max(tolerance, (stroke.baseWidth || 2) / 2 + tolerance);
  if (points.length === 1) {
    return Math.hypot(point.x - points[0].x, point.y - points[0].y) <= radius;
  }
  for (let i = 1; i < points.length; i += 1) {
    if (pointToSegmentDistance(point, points[i - 1], points[i]) <= radius) {
      return true;
    }
  }
  return false;
}

export function pointInPolygon(point: Point, polygon: Point[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const pi = polygon[i];
    const pj = polygon[j];
    const crosses =
      pi.y > point.y !== pj.y > point.y &&
      point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y) + pi.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function lassoContainsStroke(stroke: InkStroke, polygon: Point[]) {
  if (polygon.length < 3 || (stroke.points?.length ?? 0) === 0) return false;
  const step = Math.max(1, Math.floor(stroke.points.length / 48));
  for (let i = 0; i < stroke.points.length; i += step) {
    if (!pointInPolygon(stroke.points[i], polygon)) return false;
  }
  return pointInPolygon(stroke.points[stroke.points.length - 1], polygon);
}

export function translateStroke(stroke: InkStroke, dx: number, dy: number): InkStroke {
  return {
    ...stroke,
    points: stroke.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })),
  };
}

export function normalizePaper(value: unknown): PaperKind {
  return value === "lines" || value === "grid" ? value : "plain";
}
