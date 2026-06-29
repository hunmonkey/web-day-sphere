"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  hitTestStroke,
  lassoContainsStroke,
  normalizePaper,
  strokeBBox,
  strokeOpacity,
  strokePathD,
  translateStroke,
  unionBBox,
  type Point,
} from "@/lib/ink-engine";
import { strokesToSvg } from "@/lib/ink-svg";
import type { DeviceKind } from "@/lib/device-prefs";
import type { InkPoint, InkStroke, InkTool, PaperKind } from "@/lib/vault-types";

type Props = {
  initialInk?: InkStroke[];
  initialPaper?: PaperKind;
  deviceKind?: DeviceKind | null;
  onChange: (ink: InkStroke[], svg: string, paper: PaperKind) => void;
};

type CanvasTool = InkTool | "eraser" | "lasso" | "move" | "hand";

type Viewport = {
  zoom: number;
  x: number;
  y: number;
};

type ScreenPoint = Point;

type ActivePointer = ScreenPoint & { type: string };

type Action =
  | { kind: "draw"; pointerId: number; stroke: InkStroke }
  | { kind: "erase"; pointerId: number; erased: boolean; base: InkStroke[] }
  | { kind: "lasso"; pointerId: number; points: InkPoint[] }
  | {
      kind: "move";
      pointerId: number;
      start: Point;
      base: InkStroke[];
      selected: string[];
      moved: boolean;
    }
  | { kind: "pan"; pointerId: number; start: ScreenPoint; base: Viewport }
  | {
      kind: "pinch";
      ids: [number, number];
      distance: number;
      center: ScreenPoint;
      worldCenter: Point;
      base: Viewport;
    };

const SAVE_DEBOUNCE_MS = 700;
const HISTORY_LIMIT = 80;

const STROKE_COLORS = ["#1e1e1e", "#e03131", "#2f9e44", "#1971c2", "#f08c00"];
const HIGHLIGHT_COLORS = ["#ffe066", "#b2f2bb", "#a5d8ff", "#ffc9c9", "#e5dbff"];
const WIDTH_MIN = 1;
const WIDTH_MAX = 28;

const TOOL_WIDTHS: Record<InkTool, number> = {
  pen: 3,
  pencil: 4,
  fountain: 3,
  highlighter: 20,
};

const TOOL_OPACITY: Record<InkTool, number> = {
  pen: 1,
  pencil: 0.82,
  fountain: 1,
  highlighter: 0.34,
};

const INK_TOOLS: InkTool[] = ["pen", "pencil", "fountain", "highlighter"];

function isInkTool(tool: CanvasTool): tool is InkTool {
  return INK_TOOLS.includes(tool as InkTool);
}

const TOOL_STORAGE_KEY = "ds.draw.tool";
const PEN_ONLY_STORAGE_KEY = "ds.draw.penOnly";

/** 마지막으로 쓰던 '쓰기' 도구를 복원(없으면 펜). 지우개·선택·이동은 기억하지 않는다. */
function loadStoredTool(): CanvasTool {
  if (typeof window === "undefined") return "pen";
  const v = localStorage.getItem(TOOL_STORAGE_KEY);
  return v && INK_TOOLS.includes(v as InkTool) ? (v as InkTool) : "pen";
}

function cloneInk(strokes: InkStroke[]) {
  return strokes.map((stroke) => ({
    ...stroke,
    points: stroke.points.map((point) => ({ ...point })),
  }));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: Point, b: Point): ScreenPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function normalizePressure(event: PointerEvent) {
  return clamp(event.pressure && event.pressure > 0 ? event.pressure : 0.5, 0.05, 1);
}

export function InkCanvas({ initialInk, initialPaper, deviceKind, onChange }: Props) {
  const [isFull, setIsFull] = useState(false);
  const [tool, setTool] = useState<CanvasTool>(loadStoredTool);
  const [color, setColor] = useState(STROKE_COLORS[0]);
  const [width, setWidth] = useState(TOOL_WIDTHS.pen);
  const [paper, setPaper] = useState<PaperKind>(() => normalizePaper(initialPaper));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [penOnly, setPenOnly] = useState<boolean>(
    () =>
      typeof window !== "undefined" &&
      localStorage.getItem("ds.draw.penOnly") === "1",
  );
  const [strokes, setStrokes] = useState<InkStroke[]>(() => cloneInk(initialInk ?? []));
  const [liveStroke, setLiveStroke] = useState<InkStroke | null>(null);
  const [lassoPoints, setLassoPoints] = useState<InkPoint[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [undoStack, setUndoStack] = useState<InkStroke[][]>([]);
  const [redoStack, setRedoStack] = useState<InkStroke[][]>([]);
  const [viewport, setViewport] = useState<Viewport>({ zoom: 1, x: 24, y: 24 });
  const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 });

  const shellRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef(strokes);
  const liveStrokeRef = useRef(liveStroke);
  const paperRef = useRef(paper);
  const viewportRef = useRef(viewport);
  const selectedIdsRef = useRef(selectedIds);
  const actionRef = useRef<Action | null>(null);
  const activePointersRef = useRef(new Map<number, ActivePointer>());
  const saveTimerRef = useRef<number | null>(null);
  const onChangeRef = useRef(onChange);
  const mountedRef = useRef(false);

  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  useEffect(() => {
    liveStrokeRef.current = liveStroke;
  }, [liveStroke]);

  useEffect(() => {
    paperRef.current = paper;
  }, [paper]);

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(PEN_ONLY_STORAGE_KEY, penOnly ? "1" : "0");
    }
  }, [penOnly]);

  // 마지막 '쓰기' 도구를 기억(다음에 캔버스를 열면 그 도구로 시작).
  useEffect(() => {
    if (typeof window !== "undefined" && isInkTool(tool)) {
      localStorage.setItem(TOOL_STORAGE_KEY, tool);
    }
  }, [tool]);

  // S펜 주력 타블렛은 사용자가 따로 설정한 적 없으면 손바닥 거치를 기본으로 켠다.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(PEN_ONLY_STORAGE_KEY) === null && deviceKind === "tablet") {
      // 저장된 설정이 없을 때 기기 기본값을 1회 적용하는 동기화.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPenOnly(true);
    }
  }, [deviceKind]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const observer = new ResizeObserver(([entry]) => {
      const rect = entry.contentRect;
      setCanvasSize({
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
      });
    });
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  const screenPoint = useCallback((event: PointerEvent | ReactPointerEvent) => {
    const canvas = canvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }, []);

  const toWorld = useCallback((point: Point, view = viewportRef.current): Point => {
    return {
      x: (point.x - view.x) / view.zoom,
      y: (point.y - view.y) / view.zoom,
    };
  }, []);

  const pushHistory = useCallback((base: InkStroke[]) => {
    setUndoStack((prev) => [...prev.slice(-HISTORY_LIMIT + 1), cloneInk(base)]);
    setRedoStack([]);
  }, []);

  const commitStrokes = useCallback(
    (next: InkStroke[], base = strokesRef.current) => {
      pushHistory(base);
      setStrokes(cloneInk(next));
    },
    [pushHistory],
  );

  const flush = useCallback(() => {
    const ink = strokesRef.current;
    const svg = ink.length > 0 ? strokesToSvg(ink, { paper: paperRef.current }) : "";
    onChangeRef.current(cloneInk(ink), svg, paperRef.current);
  }, []);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(flush, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [strokes, paper, flush]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        flush();
      }
    };
  }, [flush]);

  const undo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const nextPrev = prev.slice(0, -1);
      const target = prev[prev.length - 1];
      setRedoStack((redo) => [...redo, cloneInk(strokesRef.current)]);
      setStrokes(cloneInk(target));
      setSelectedIds([]);
      return nextPrev;
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const nextPrev = prev.slice(0, -1);
      const target = prev[prev.length - 1];
      setUndoStack((undoItems) => [...undoItems, cloneInk(strokesRef.current)]);
      setStrokes(cloneInk(target));
      setSelectedIds([]);
      return nextPrev;
    });
  }, []);

  const zoomBy = useCallback(
    (factor: number) => {
      const center = { x: canvasSize.width / 2, y: canvasSize.height / 2 };
      const worldCenter = toWorld(center);
      setViewport((view) => {
        const zoom = clamp(view.zoom * factor, 0.25, 5);
        return {
          zoom,
          x: center.x - worldCenter.x * zoom,
          y: center.y - worldCenter.y * zoom,
        };
      });
    },
    [canvasSize.height, canvasSize.width, toWorld],
  );

  const resetView = useCallback(() => {
    const box = unionBBox(strokesRef.current.map(strokeBBox));
    if (!box) {
      setViewport({ zoom: 1, x: 24, y: 24 });
      return;
    }
    const pad = 80;
    const w = Math.max(1, box.maxX - box.minX);
    const h = Math.max(1, box.maxY - box.minY);
    const zoom = clamp(
      Math.min(canvasSize.width / (w + pad), canvasSize.height / (h + pad)),
      0.25,
      3,
    );
    setViewport({
      zoom,
      x: (canvasSize.width - w * zoom) / 2 - box.minX * zoom,
      y: (canvasSize.height - h * zoom) / 2 - box.minY * zoom,
    });
  }, [canvasSize.height, canvasSize.width]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedCount = selectedIds.length;

  const deleteSelected = useCallback(() => {
    const ids = new Set(selectedIdsRef.current);
    if (ids.size === 0) return;
    const base = strokesRef.current;
    commitStrokes(
      base.filter((stroke) => !ids.has(stroke.id)),
      base,
    );
    setSelectedIds([]);
  }, [commitStrokes]);

  const chooseTool = useCallback((nextTool: CanvasTool) => {
    setTool(nextTool);
    setSettingsOpen(false);
    if (isInkTool(nextTool)) {
      setWidth((current) =>
        current === TOOL_WIDTHS.highlighter && nextTool !== "highlighter"
          ? TOOL_WIDTHS[nextTool]
          : current,
      );
      if (nextTool === "highlighter" && !HIGHLIGHT_COLORS.includes(color)) {
        setColor(HIGHLIGHT_COLORS[0]);
      }
      if (nextTool !== "highlighter" && !STROKE_COLORS.includes(color)) {
        setColor(STROKE_COLORS[0]);
      }
    }
  }, [color]);

  const makePoint = useCallback(
    (event: PointerEvent): InkPoint => {
      const world = toWorld(screenPoint(event));
      return {
        ...world,
        pressure: normalizePressure(event),
        t: event.timeStamp,
      };
    },
    [screenPoint, toWorld],
  );

  const startPinchIfReady = useCallback(() => {
    // 핀치는 손가락(비펜)만으로 구성한다. 손바닥+펜을 줌으로 오인하지 않도록.
    const entries = [...activePointersRef.current.entries()].filter(
      ([, p]) => p.type !== "pen",
    );
    if (entries.length < 2) return false;
    const [a, b] = [entries[0], entries[1]];
    const center = midpoint(a[1], b[1]);
    actionRef.current = {
      kind: "pinch",
      ids: [a[0], b[0]],
      distance: Math.max(1, distance(a[1], b[1])),
      center,
      worldCenter: toWorld(center),
      base: viewportRef.current,
    };
    setLiveStroke(null);
    setLassoPoints([]);
    return true;
  }, [toWorld]);

  const eraseAt = useCallback(
    (point: Point) => {
      const action = actionRef.current;
      if (!action || action.kind !== "erase") return;
      const hit = [...strokesRef.current]
        .reverse()
        .find((stroke) => hitTestStroke(stroke, point, 8 / viewportRef.current.zoom));
      if (!hit) return;
      if (!action.erased) {
        pushHistory(action.base);
        action.erased = true;
      }
      setStrokes((prev) => prev.filter((stroke) => stroke.id !== hit.id));
      setSelectedIds((prev) => prev.filter((id) => id !== hit.id));
    },
    [pushHistory],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const native = event.nativeEvent;
      const isPen = native.pointerType === "pen";
      canvas.setPointerCapture(event.pointerId);
      const point = screenPoint(event);
      activePointersRef.current.set(event.pointerId, {
        ...point,
        type: native.pointerType,
      });

      // 손가락 2개 이상이면 핀치 줌/팬. 펜으로 그리는 중에는 펜 입력이 우선이다.
      if (actionRef.current?.kind !== "draw" && startPinchIfReady()) {
        event.preventDefault();
        return;
      }

      if (actionRef.current) return;

      // "S펜만 인식": 손가락·손바닥 단일 입력은 그리기/도구 동작 없이 무시(핀치에만 참여).
      if (penOnly && !isPen) return;

      event.preventDefault();
      const world = toWorld(point);

      // S펜 사이드 버튼을 누른 채 그으면 임시 지우개(떼면 원래 도구로 복귀).
      // 사이드 버튼은 기기/브라우저에 따라 barrel(2)·eraser(32) 비트로 들어온다.
      const penButtonErase = isPen && (native.buttons & 0b100010) !== 0;
      const activeTool: CanvasTool = penButtonErase ? "eraser" : tool;

      if (isInkTool(activeTool)) {
        const stroke: InkStroke = {
          id: crypto.randomUUID(),
          color,
          baseWidth:
            activeTool === "highlighter"
              ? Math.max(width, TOOL_WIDTHS.highlighter)
              : width,
          input: native.pointerType || "pointer",
          opacity: TOOL_OPACITY[activeTool],
          tool: activeTool,
          points: [makePoint(native)],
        };
        actionRef.current = { kind: "draw", pointerId: event.pointerId, stroke };
        setSelectedIds([]);
        setLiveStroke(stroke);
        return;
      }

      if (activeTool === "eraser") {
        actionRef.current = {
          kind: "erase",
          pointerId: event.pointerId,
          erased: false,
          base: cloneInk(strokesRef.current),
        };
        eraseAt(world);
        return;
      }

      if (activeTool === "lasso") {
        const points = [{ ...world, pressure: 0.5, t: native.timeStamp }];
        actionRef.current = { kind: "lasso", pointerId: event.pointerId, points };
        setLassoPoints(points);
        return;
      }

      if (activeTool === "move") {
        const hit = [...strokesRef.current]
          .reverse()
          .find((stroke) => hitTestStroke(stroke, world, 8 / viewportRef.current.zoom));
        const ids =
          hit && selectedIdsRef.current.includes(hit.id)
            ? selectedIdsRef.current
            : hit
              ? [hit.id]
              : selectedIdsRef.current;
        if (ids.length === 0) return;
        setSelectedIds(ids);
        actionRef.current = {
          kind: "move",
          pointerId: event.pointerId,
          start: world,
          base: cloneInk(strokesRef.current),
          selected: ids,
          moved: false,
        };
        return;
      }

      actionRef.current = {
        kind: "pan",
        pointerId: event.pointerId,
        start: point,
        base: viewportRef.current,
      };
    },
    [
      color,
      eraseAt,
      makePoint,
      penOnly,
      screenPoint,
      startPinchIfReady,
      toWorld,
      tool,
      width,
    ],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const point = screenPoint(event);
      activePointersRef.current.set(event.pointerId, {
        ...point,
        type: event.nativeEvent.pointerType,
      });
      const action = actionRef.current;
      if (!action) return;
      event.preventDefault();

      if (action.kind === "pinch") {
        const a = activePointersRef.current.get(action.ids[0]);
        const b = activePointersRef.current.get(action.ids[1]);
        if (!a || !b) return;
        const center = midpoint(a, b);
        const zoom = clamp(
          action.base.zoom * (distance(a, b) / action.distance),
          0.25,
          5,
        );
        setViewport({
          zoom,
          x: center.x - action.worldCenter.x * zoom,
          y: center.y - action.worldCenter.y * zoom,
        });
        return;
      }

      if (action.pointerId !== event.pointerId) return;

      if (action.kind === "draw") {
        const coalesced = event.nativeEvent.getCoalescedEvents?.();
        const events =
          coalesced && coalesced.length > 0 ? coalesced : [event.nativeEvent];
        const nextPoints = [...action.stroke.points];
        for (const native of events) nextPoints.push(makePoint(native));
        action.stroke = { ...action.stroke, points: nextPoints };
        setLiveStroke(action.stroke);
        return;
      }

      const world = toWorld(point);
      if (action.kind === "erase") {
        eraseAt(world);
        return;
      }

      if (action.kind === "lasso") {
        const nextPoints = [
          ...action.points,
          { ...world, pressure: 0.5, t: event.nativeEvent.timeStamp },
        ];
        action.points = nextPoints;
        setLassoPoints(nextPoints);
        return;
      }

      if (action.kind === "move") {
        const dx = world.x - action.start.x;
        const dy = world.y - action.start.y;
        if (Math.abs(dx) + Math.abs(dy) > 0.1) action.moved = true;
        const ids = new Set(action.selected);
        setStrokes(
          action.base.map((stroke) =>
            ids.has(stroke.id) ? translateStroke(stroke, dx, dy) : stroke,
          ),
        );
        return;
      }

      if (action.kind === "pan") {
        setViewport({
          ...action.base,
          x: action.base.x + point.x - action.start.x,
          y: action.base.y + point.y - action.start.y,
        });
      }
    },
    [eraseAt, makePoint, screenPoint, toWorld],
  );

  const finishPointer = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      activePointersRef.current.delete(event.pointerId);
      const action = actionRef.current;
      if (!action) return;

      if (action.kind === "pinch") {
        actionRef.current = null;
        startPinchIfReady();
        return;
      }

      if ("pointerId" in action && action.pointerId !== event.pointerId) return;
      event.preventDefault();

      if (action.kind === "draw") {
        const stroke = action.stroke;
        actionRef.current = null;
        setLiveStroke(null);
        if (stroke.points.length > 0) {
          commitStrokes([...strokesRef.current, stroke]);
        }
        return;
      }

      if (action.kind === "lasso") {
        const polygon = action.points;
        const ids = strokesRef.current
          .filter((stroke) => lassoContainsStroke(stroke, polygon))
          .map((stroke) => stroke.id);
        setSelectedIds(ids);
        setLassoPoints([]);
        actionRef.current = null;
        if (ids.length > 0) setTool("move");
        return;
      }

      if (action.kind === "move") {
        if (action.moved) {
          pushHistory(action.base);
          setRedoStack([]);
        }
        actionRef.current = null;
        return;
      }

      actionRef.current = null;
    },
    [commitStrokes, pushHistory, startPinchIfReady],
  );

  const drawPaper = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      const view = viewportRef.current;
      const min = toWorld({ x: 0, y: 0 }, view);
      const max = toWorld({ x: canvasSize.width, y: canvasSize.height }, view);
      ctx.save();
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(min.x - 200, min.y - 200, max.x - min.x + 400, max.y - min.y + 400);
      if (paperRef.current !== "plain") {
        const spacing = paperRef.current === "grid" ? 32 : 36;
        ctx.lineWidth = 1 / view.zoom;
        ctx.strokeStyle =
          paperRef.current === "grid"
            ? "rgba(151, 164, 190, 0.38)"
            : "rgba(95, 121, 169, 0.32)";
        ctx.beginPath();
        if (paperRef.current === "grid") {
          for (
            let x = Math.floor((min.x - 200) / spacing) * spacing;
            x <= max.x + 200;
            x += spacing
          ) {
            ctx.moveTo(x, min.y - 200);
            ctx.lineTo(x, max.y + 200);
          }
        }
        for (
          let y = Math.floor((min.y - 200) / spacing) * spacing;
          y <= max.y + 200;
          y += spacing
        ) {
          ctx.moveTo(min.x - 200, y);
          ctx.lineTo(max.x + 200, y);
        }
        ctx.stroke();
      }
      ctx.restore();
    },
    [canvasSize.height, canvasSize.width, toWorld],
  );

  const drawStroke = useCallback(
    (ctx: CanvasRenderingContext2D, stroke: InkStroke, selected = false) => {
      const d = strokePathD(stroke, !liveStrokeRef.current || stroke.id !== liveStrokeRef.current.id);
      if (!d) return;
      ctx.save();
      ctx.globalAlpha = strokeOpacity(stroke);
      ctx.fillStyle = stroke.color;
      ctx.fill(new Path2D(d));
      ctx.restore();

      if (selected) {
        const box = strokeBBox(stroke);
        if (!box) return;
        ctx.save();
        ctx.setLineDash([8 / viewportRef.current.zoom, 5 / viewportRef.current.zoom]);
        ctx.lineWidth = 1.4 / viewportRef.current.zoom;
        ctx.strokeStyle = "#3d6dff";
        ctx.strokeRect(box.minX, box.minY, box.maxX - box.minX, box.maxY - box.minY);
        ctx.restore();
      }
    },
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const pixelWidth = Math.max(1, Math.floor(canvasSize.width * dpr));
    const pixelHeight = Math.max(1, Math.floor(canvasSize.height * dpr));
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    canvas.style.width = `${canvasSize.width}px`;
    canvas.style.height = `${canvasSize.height}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);
    ctx.fillStyle = "#f7f8fb";
    ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);

    ctx.save();
    ctx.translate(viewport.x, viewport.y);
    ctx.scale(viewport.zoom, viewport.zoom);
    drawPaper(ctx);
    for (const stroke of strokes) drawStroke(ctx, stroke, selectedSet.has(stroke.id));
    if (liveStroke) drawStroke(ctx, liveStroke);

    if (lassoPoints.length > 1) {
      ctx.save();
      ctx.lineWidth = 1.5 / viewport.zoom;
      ctx.setLineDash([8 / viewport.zoom, 5 / viewport.zoom]);
      ctx.strokeStyle = "#3d6dff";
      ctx.beginPath();
      ctx.moveTo(lassoPoints[0].x, lassoPoints[0].y);
      for (const point of lassoPoints.slice(1)) ctx.lineTo(point.x, point.y);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }, [
    canvasSize.height,
    canvasSize.width,
    drawPaper,
    drawStroke,
    lassoPoints,
    liveStroke,
    paper,
    selectedSet,
    strokes,
    viewport,
  ]);

  const currentPalette = tool === "highlighter" ? HIGHLIGHT_COLORS : STROKE_COLORS;
  const shellBase = isFull
    ? "fixed inset-0 z-[60] bg-white"
    : "relative min-h-0 flex-1 overflow-hidden rounded-xl border border-border";

  return (
    <div ref={shellRef} className={`ds-ink-shell ${shellBase}`}>
      <canvas
        ref={canvasRef}
        className="ds-ink-canvas absolute inset-0 h-full w-full"
        style={{
          cursor:
            tool === "hand"
              ? "grab"
              : tool === "move"
                ? "move"
                : tool === "eraser"
                  ? "cell"
                  : "crosshair",
          touchAction: "none",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
        onContextMenu={(event) => event.preventDefault()}
      />

      <button
        type="button"
        onClick={() => setIsFull((v) => !v)}
        title={isFull ? "전체화면 종료" : "전체화면"}
        className="absolute right-3 top-3 z-20 rounded-lg border border-border bg-surface-solid/90 px-2.5 py-1.5 text-xs font-medium text-fg shadow-sm backdrop-blur transition-colors hover:bg-surface-strong"
      >
        {isFull ? "닫기" : "전체화면"}
      </button>

      <div className="absolute left-2 top-1/2 z-20 -translate-y-1/2">
        <div className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-surface-solid/95 p-1.5 shadow-lg backdrop-blur">
          <DockButton active={tool === "pen"} onClick={() => chooseTool("pen")} title="펜">
            <IconPen className="h-[18px] w-[18px]" />
          </DockButton>
          <DockButton active={tool === "pencil"} onClick={() => chooseTool("pencil")} title="연필">
            <IconPencil className="h-[18px] w-[18px]" />
          </DockButton>
          <DockButton
            active={tool === "fountain"}
            onClick={() => chooseTool("fountain")}
            title="만년필"
          >
            <IconFountain className="h-[18px] w-[18px]" />
          </DockButton>
          <DockButton
            active={tool === "highlighter"}
            onClick={() => chooseTool("highlighter")}
            title="형광펜"
          >
            <IconMarker className="h-[18px] w-[18px]" />
          </DockButton>
          <DockButton active={tool === "eraser"} onClick={() => chooseTool("eraser")} title="지우개">
            <IconEraser className="h-[18px] w-[18px]" />
          </DockButton>
          <DockButton active={tool === "lasso"} onClick={() => chooseTool("lasso")} title="라쏘 선택">
            <IconLasso className="h-[18px] w-[18px]" />
          </DockButton>
          <DockButton active={tool === "move"} onClick={() => chooseTool("move")} title="선택 이동">
            <IconMove className="h-[18px] w-[18px]" />
          </DockButton>
          <DockButton active={tool === "hand"} onClick={() => chooseTool("hand")} title="화면 이동">
            <IconHand className="h-[18px] w-[18px]" />
          </DockButton>

          <span className="my-0.5 h-px w-6 bg-border" />

          <DockButton onClick={() => zoomBy(1.2)} title="확대">
            <IconZoomIn className="h-[18px] w-[18px]" />
          </DockButton>
          <DockButton onClick={() => zoomBy(1 / 1.2)} title="축소">
            <IconZoomOut className="h-[18px] w-[18px]" />
          </DockButton>
          <DockButton onClick={resetView} title="화면 맞춤">
            <IconFit className="h-[18px] w-[18px]" />
          </DockButton>

          <span className="my-0.5 h-px w-6 bg-border" />

          <DockButton active={settingsOpen} onClick={() => setSettingsOpen((o) => !o)} title="필기 설정">
            <IconSettings className="h-[18px] w-[18px]" />
          </DockButton>
          <DockButton onClick={undo} title="되돌리기" disabled={undoStack.length === 0}>
            <IconUndo className="h-[18px] w-[18px]" />
          </DockButton>
          <DockButton onClick={redo} title="다시 실행" disabled={redoStack.length === 0}>
            <IconRedo className="h-[18px] w-[18px]" />
          </DockButton>
          <DockButton
            onClick={deleteSelected}
            title={`선택 삭제${selectedCount > 0 ? ` ${selectedCount}` : ""}`}
            disabled={selectedCount === 0}
          >
            <IconTrash className="h-[18px] w-[18px]" />
          </DockButton>
        </div>

        {settingsOpen && (
          <div className="absolute bottom-0 left-full ml-2 w-56 rounded-2xl border border-border bg-surface-solid/95 p-3 shadow-xl backdrop-blur">
            <div className="text-xs font-medium text-muted">색</div>
            <div className="mt-1.5 flex gap-1.5">
              {currentPalette.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={c}
                  onClick={() => setColor(c)}
                  className={`h-6 w-6 rounded-full border transition ${
                    color === c
                      ? "ring-2 ring-accent ring-offset-2 ring-offset-[var(--surface-solid)]"
                      : "border-border"
                  }`}
                  style={{ background: c }}
                />
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between text-xs font-medium text-muted">
              <span>굵기</span>
              <span className="text-fg">{width}</span>
            </div>
            <input
              type="range"
              min={WIDTH_MIN}
              max={WIDTH_MAX}
              step={1}
              value={width}
              onChange={(event) => setWidth(Number(event.target.value))}
              className="mt-1 w-full accent-[var(--accent)]"
            />

            <div className="mt-3 text-xs font-medium text-muted">종이</div>
            <div className="mt-1.5 grid grid-cols-3 gap-1">
              {(
                [
                  ["plain", "무지"],
                  ["lines", "줄"],
                  ["grid", "모눈"],
                ] as [PaperKind, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPaper(value)}
                  className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                    paper === value
                      ? "border-accent bg-accent/15 text-fg"
                      : "border-border text-muted hover:bg-surface-strong hover:text-fg"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <ToggleRow label="S펜만 인식" on={penOnly} onClick={() => setPenOnly((v) => !v)} />
          </div>
        )}
      </div>
    </div>
  );
}

function DockButton({
  active,
  disabled,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
        active
          ? "bg-accent text-accent-fg"
          : "text-muted hover:bg-surface-strong hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

function ToggleRow({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="mt-3 flex w-full items-center justify-between"
    >
      <span className="text-xs font-medium text-muted">{label}</span>
      <span
        className={`relative h-5 w-9 rounded-full transition-colors ${
          on ? "bg-accent" : "bg-surface-strong"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
            on ? "left-[1.125rem]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}

const SVG = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function IconPen({ className }: { className?: string }) {
  return (
    <svg {...SVG} className={className}>
      <path d="M4 20l1-4L15.5 5.5a2 2 0 0 1 3 0 2 2 0 0 1 0 3L8 19l-4 1z" />
      <path d="M14 7l3 3" />
    </svg>
  );
}

function IconPencil({ className }: { className?: string }) {
  return (
    <svg {...SVG} className={className}>
      <path d="M4 20l4.5-1 10-10a2 2 0 0 0-3-3l-10 10L4 20z" />
      <path d="M13.5 7.5l3 3" />
    </svg>
  );
}

function IconFountain({ className }: { className?: string }) {
  return (
    <svg {...SVG} className={className}>
      <path d="M12 3l7 7-4 9-3-5-3 5-4-9 7-7z" />
      <path d="M12 3v11" />
      <circle cx="12" cy="14" r="1" />
    </svg>
  );
}

function IconMarker({ className }: { className?: string }) {
  return (
    <svg {...SVG} className={className}>
      <path d="M5 21h14" />
      <path d="M9 17l-3 1 1-3 9-9 2 2-9 9z" />
      <path d="M13 6l5 5" />
    </svg>
  );
}

function IconEraser({ className }: { className?: string }) {
  return (
    <svg {...SVG} className={className}>
      <path d="M8 20l-4-4a1.5 1.5 0 0 1 0-2l7-7 6 6-7 7H8z" />
      <path d="M11 20h9" />
    </svg>
  );
}

function IconLasso({ className }: { className?: string }) {
  return (
    <svg {...SVG} className={className}>
      <path d="M7 5c-3 2-4 6-2 9 2.5 3.5 9.5 4 13 1 3-2.5 2-7-2-9C13 4.5 9.5 3.7 7 5z" />
      <path d="M12 17l4 4" />
      <path d="M15 20h4" />
    </svg>
  );
}

function IconMove({ className }: { className?: string }) {
  return (
    <svg {...SVG} className={className}>
      <path d="M12 4v16M4 12h16" />
      <path d="M9 7l3-3 3 3M9 17l3 3 3-3M7 9l-3 3 3 3M17 9l3 3-3 3" />
    </svg>
  );
}

function IconHand({ className }: { className?: string }) {
  return (
    <svg {...SVG} className={className}>
      <path d="M8 12V7a1.5 1.5 0 0 1 3 0v4" />
      <path d="M11 11V6a1.5 1.5 0 0 1 3 0v5" />
      <path d="M14 11V8a1.5 1.5 0 0 1 3 0v5" />
      <path d="M8 12l-1-1a1.6 1.6 0 0 0-2.3 2.2l4.8 5.4A5 5 0 0 0 13.3 20H15a5 5 0 0 0 5-5v-3a1.5 1.5 0 0 0-3 0" />
    </svg>
  );
}

function IconSettings({ className }: { className?: string }) {
  return (
    <svg {...SVG} className={className}>
      <path d="M4 7h8" />
      <path d="M16 7h4" />
      <circle cx="14" cy="7" r="2" />
      <path d="M4 17h4" />
      <path d="M12 17h8" />
      <circle cx="10" cy="17" r="2" />
    </svg>
  );
}

function IconUndo({ className }: { className?: string }) {
  return (
    <svg {...SVG} className={className}>
      <path d="M9 7L4 12l5 5" />
      <path d="M4 12h10a5 5 0 0 1 0 10h-2" />
    </svg>
  );
}

function IconRedo({ className }: { className?: string }) {
  return (
    <svg {...SVG} className={className}>
      <path d="M15 7l5 5-5 5" />
      <path d="M20 12H10a5 5 0 0 0 0 10h2" />
    </svg>
  );
}

function IconZoomIn({ className }: { className?: string }) {
  return (
    <svg {...SVG} className={className}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20 20l-5-5" />
      <path d="M10.5 7.5v6M7.5 10.5h6" />
    </svg>
  );
}

function IconZoomOut({ className }: { className?: string }) {
  return (
    <svg {...SVG} className={className}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20 20l-5-5" />
      <path d="M7.5 10.5h6" />
    </svg>
  );
}

function IconFit({ className }: { className?: string }) {
  return (
    <svg {...SVG} className={className}>
      <path d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4" />
      <path d="M9 9h6v6H9z" />
    </svg>
  );
}

function IconTrash({ className }: { className?: string }) {
  return (
    <svg {...SVG} className={className}>
      <path d="M4 7h16" />
      <path d="M10 11v6M14 11v6" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M9 7V4h6v3" />
    </svg>
  );
}
