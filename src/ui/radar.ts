/** Vision IQ radar — shared across SHUNSUKE / HIDETOSHI reveal screens.
 *
 *  Four axes (clockwise from top):
 *    1. COORD ACCURACY    — 座標精度
 *    2. PREDICTION SPEED  — 予測速度
 *    3. INFO RETENTION    — 情報保持
 *    4. PERIPHERAL VISION — 周辺視 (Phase 3 で測定開始予定)
 *
 *  Each value is 0..100 or null (= 未測定). null axes render as a faint dot
 *  at the origin so the user can see which axis is missing from this mode.
 *
 *  An optional `best` overlay shows the user's personal best on each axis
 *  (cross-mode, persisted to localStorage). Drawn as a thin dashed outline.
 *
 *  The 100-mark "legend benchmark" ring is always drawn as a gold dashed
 *  circle, providing a visual anchor for "how close to a legend".
 */

export type AxisKey =
  | "coordAccuracy"
  | "predictionSpeed"
  | "infoRetention"
  | "peripheralReaction";

export interface AxisValues {
  coordAccuracy: number | null;
  predictionSpeed: number | null;
  infoRetention: number | null;
  peripheralReaction: number | null;
}

export interface RadarOptions {
  values: AxisValues;
  best?: AxisValues;
  /** Defaults to true. */
  showBenchmark?: boolean;
  /** Defaults to true. Smooth grow-in for the polygon. */
  animate?: boolean;
}

const AXES: { key: AxisKey; label: string; sub: string }[] = [
  { key: "coordAccuracy",     label: "COORD ACC",    sub: "座標精度" },
  { key: "predictionSpeed",   label: "PRED SPEED",   sub: "予測速度" },
  { key: "infoRetention",     label: "RETENTION",    sub: "情報保持" },
  { key: "peripheralReaction", label: "PERIPHERAL",  sub: "周辺視" },
];

const COLOR = {
  grid:      "rgba(255,255,255,0.10)",
  gridMajor: "rgba(255,255,255,0.18)",
  axis:      "rgba(255,255,255,0.22)",
  label:     "rgba(231,238,252,0.85)",
  sub:       "rgba(154,167,199,0.65)",
  poly:      "rgba(56,225,255,0.65)",
  polyFill:  "rgba(56,225,255,0.18)",
  polyDim:   "rgba(56,225,255,0.30)",
  best:      "rgba(255,184,74,0.55)",
  benchmark: "rgba(255,184,74,0.35)",
  vertex:    "#38e1ff",
  vertexBest: "#ffb84a",
};

/** Draws into a fitted canvas (assumes caller has already sized + DPR-set). */
export class RadarChart {
  private ctx: CanvasRenderingContext2D;
  private rafId = 0;
  private startedAt = 0;
  private destroyed = false;

  constructor(private canvas: HTMLCanvasElement, private opts: RadarOptions) {
    this.ctx = canvas.getContext("2d")!;
  }

  start() {
    if (this.opts.animate === false) {
      this.render(1);
      return;
    }
    this.startedAt = performance.now();
    const tick = () => {
      if (this.destroyed) return;
      const t = (performance.now() - this.startedAt) / 700;
      const e = easeOutCubic(Math.min(t, 1));
      this.render(e);
      if (t < 1) this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.rafId);
  }

  /** Re-render at full strength (called on resize). */
  redraw() {
    this.render(1);
  }

  private render(progress: number) {
    const ctx = this.ctx;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) / 2 - 36; // label margin

    ctx.clearRect(0, 0, w, h);

    // Concentric grid (25 / 50 / 75 / 100).
    for (let i = 1; i <= 4; i++) {
      const r = (radius * i) / 4;
      ctx.beginPath();
      for (let a = 0; a < 4; a++) {
        const ang = angleFor(a);
        const x = cx + Math.cos(ang) * r;
        const y = cy + Math.sin(ang) * r;
        if (a === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = i === 4 ? COLOR.gridMajor : COLOR.grid;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Axis spokes.
    for (let a = 0; a < 4; a++) {
      const ang = angleFor(a);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(ang) * radius, cy + Math.sin(ang) * radius);
      ctx.strokeStyle = COLOR.axis;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Legend benchmark — 100 on every axis = the outer ring. Render dashed gold.
    if (this.opts.showBenchmark !== false) {
      ctx.save();
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = COLOR.benchmark;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let a = 0; a < 4; a++) {
        const ang = angleFor(a);
        const x = cx + Math.cos(ang) * radius;
        const y = cy + Math.sin(ang) * radius;
        if (a === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    // Personal-best overlay (dashed amber polygon).
    if (this.opts.best) {
      this.drawPolygon(this.opts.best, radius, cx, cy, {
        stroke: COLOR.best,
        fill: "transparent",
        lineWidth: 1.4,
        dash: [4, 4],
        vertexColor: COLOR.vertexBest,
        vertexRadius: 2.5,
        progress: 1, // best doesn't animate
      });
    }

    // Current-run polygon.
    this.drawPolygon(this.opts.values, radius, cx, cy, {
      stroke: COLOR.poly,
      fill: COLOR.polyFill,
      lineWidth: 2,
      vertexColor: COLOR.vertex,
      vertexRadius: 3.5,
      progress,
    });

    // Axis labels (drawn last so they sit on top).
    ctx.save();
    ctx.fillStyle = COLOR.label;
    ctx.font = "600 10px var(--font-mono, monospace)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let a = 0; a < AXES.length; a++) {
      const ang = angleFor(a);
      const lx = cx + Math.cos(ang) * (radius + 22);
      const ly = cy + Math.sin(ang) * (radius + 22);
      ctx.fillStyle = COLOR.label;
      ctx.fillText(AXES[a].label, lx, ly - 5);
      ctx.fillStyle = COLOR.sub;
      ctx.font = "10px sans-serif";
      ctx.fillText(AXES[a].sub, lx, ly + 7);
      ctx.font = "600 10px var(--font-mono, monospace)";
    }
    ctx.restore();
  }

  private drawPolygon(
    vals: AxisValues,
    radius: number,
    cx: number,
    cy: number,
    style: {
      stroke: string;
      fill: string;
      lineWidth: number;
      dash?: number[];
      vertexColor: string;
      vertexRadius: number;
      progress: number;
    }
  ) {
    const ctx = this.ctx;
    const pts = AXES.map((axis, idx) => {
      const v = vals[axis.key];
      const norm = v == null ? 0 : Math.max(0, Math.min(1, v / 100));
      const r = radius * norm * style.progress;
      const ang = angleFor(idx);
      return {
        x: cx + Math.cos(ang) * r,
        y: cy + Math.sin(ang) * r,
        measured: v != null,
      };
    });

    // Fill + stroke the polygon. If any axis is null we draw it dimmer.
    const anyMissing = pts.some((p) => !p.measured);
    ctx.save();
    if (style.dash) ctx.setLineDash(style.dash);
    ctx.strokeStyle = anyMissing && style.fill !== "transparent" ? COLOR.polyDim : style.stroke;
    ctx.lineWidth = style.lineWidth;
    ctx.fillStyle = style.fill;
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    if (style.fill !== "transparent") ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Vertex dots — only on measured axes.
    for (const p of pts) {
      if (!p.measured) continue;
      ctx.save();
      ctx.fillStyle = style.vertexColor;
      ctx.beginPath();
      ctx.arc(p.x, p.y, style.vertexRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

function angleFor(axisIdx: number) {
  // Top, right, bottom, left.
  return -Math.PI / 2 + (axisIdx * Math.PI) / 2;
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

// ---------- Personal-best persistence (cross-mode) ----------

const BESTS_KEY = "vc.bests";

const EMPTY_BESTS: AxisValues = {
  coordAccuracy: null,
  predictionSpeed: null,
  infoRetention: null,
  peripheralReaction: null,
};

export function loadBests(): AxisValues {
  try {
    const raw = localStorage.getItem(BESTS_KEY);
    if (!raw) return { ...EMPTY_BESTS };
    const parsed = JSON.parse(raw);
    return {
      coordAccuracy: numOrNull(parsed.coordAccuracy),
      predictionSpeed: numOrNull(parsed.predictionSpeed),
      infoRetention: numOrNull(parsed.infoRetention),
      peripheralReaction: numOrNull(parsed.peripheralReaction),
    };
  } catch {
    return { ...EMPTY_BESTS };
  }
}

/** Updates the persistent best per axis (max-of) and returns the new state.
 *  Pass null on axes you didn't measure this run. */
export function updateBests(partial: Partial<AxisValues>): AxisValues {
  const cur = loadBests();
  const next: AxisValues = { ...cur };
  for (const k of Object.keys(partial) as AxisKey[]) {
    const v = partial[k];
    if (v == null) continue;
    if (next[k] == null || v > (next[k] as number)) next[k] = v;
  }
  try {
    localStorage.setItem(BESTS_KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
  return next;
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && isFinite(v) ? v : null;
}
