import { Entity, PITCH } from "../../data/types";
import { ScoreReport, classifyError } from "../../engine/scoring";

const ERR_COLOR = { ok: "#4ade80", warn: "#f59e0b", bad: "#ef4444" } as const;
const KIND_FILL = { ally: "#38e1ff", enemy: "#ff3a6e", ball: "#ffe066" } as const;
const KIND_STROKE = { ally: "#0a3346", enemy: "#3a0916", ball: "#3a2900" } as const;

export interface RevealOptions {
  truth: Entity[];
  placed: Entity[];
  observer: { x: number; z: number };
  report: ScoreReport;
  onRetry: () => void;
  onMenu: () => void;
}

/** Animated reveal: zooms from a low angle up to the 20m overhead view
 *  while the user's pieces and the truth pieces are drawn with linking
 *  error vectors. */
export class RevealView {
  el: HTMLElement;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private startedAt = 0;
  private rafId = 0;
  private altitudeM = 0.5; // start "on the ground"

  constructor(container: HTMLElement, private opts: RevealOptions) {
    this.el = this.build();
    container.appendChild(this.el);
    requestAnimationFrame(() => {
      this.fitCanvas();
      this.startedAt = performance.now();
      this.loop();
    });
    window.addEventListener("resize", this.onResize);
  }

  destroy() {
    cancelAnimationFrame(this.rafId);
    window.removeEventListener("resize", this.onResize);
    this.el.remove();
  }

  private build() {
    const root = document.createElement("div");
    root.className = "stage result-stage";
    const r = this.opts.report;
    root.innerHTML = `
      <div class="hud-top">
        <div class="left">MODE&nbsp;:&nbsp;SHUNSUKE</div>
        <div class="right">PHASE&nbsp;:&nbsp;REVEAL</div>
      </div>
      <div class="altitude-banner">VIEWPOINT &nbsp; ALTITUDE &nbsp; — m</div>
      <div class="result-canvas-wrap">
        <canvas></canvas>
      </div>
      <div class="result-summary">
        <div class="metric">
          <div class="label">VIEWPOINT</div>
          <div class="value">${r.viewpointAltitudeM.toFixed(1)} m</div>
          <div class="sub">「上空 ${r.viewpointAltitudeM.toFixed(1)} m から見えていた」</div>
        </div>
        <div class="metric">
          <div class="label">AVG ERROR</div>
          <div class="value">${formatErr(r.averageErrorCm)}</div>
          <div class="sub">中央値 ${formatErr(r.medianErrorCm)}</div>
        </div>
        <div class="metric">
          <div class="label">RETENTION</div>
          <div class="value">${r.iq.infoRetention}<span style="font-size:14px"> / 100</span></div>
          <div class="sub">${r.placedCount} / ${r.totalTruthCount} 配置</div>
        </div>
        <div class="metric">
          <div class="label">VISION IQ</div>
          <div class="value">${r.iq.overall}</div>
          <div class="sub">レジェンド基準 ${r.legendBenchmark}</div>
        </div>
      </div>
      <div class="result-actions">
        <button class="btn secondary" data-act="menu">MENU</button>
        <button class="btn" data-act="retry">RETRY</button>
      </div>
    `;
    this.canvas = root.querySelector("canvas") as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d")!;
    root.querySelector('[data-act="retry"]')!.addEventListener("click", () => this.opts.onRetry());
    root.querySelector('[data-act="menu"]')!.addEventListener("click", () => this.opts.onMenu());
    return root;
  }

  private fitCanvas = () => {
    const wrap = this.el.querySelector(".result-canvas-wrap") as HTMLElement;
    const cw = wrap.clientWidth - 32;
    const ch = wrap.clientHeight - 32;
    const ratio = PITCH.length / PITCH.width;
    let W = cw, H = cw / ratio;
    if (H > ch) { H = ch; W = ch * ratio; }
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.canvas.style.width = `${W}px`;
    this.canvas.style.height = `${H}px`;
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  private onResize = () => { this.fitCanvas(); };

  private loop = () => {
    const t = (performance.now() - this.startedAt) / 1500; // 1.5s rise
    const e = easeOutCubic(Math.min(t, 1));
    this.altitudeM = lerp(0.5, this.opts.report.viewpointAltitudeM, e);

    // Update banner
    const banner = this.el.querySelector(".altitude-banner")!;
    banner.textContent = `VIEWPOINT ALTITUDE  ${this.altitudeM.toFixed(1)} m`;

    this.render();
    if (t < 1) this.rafId = requestAnimationFrame(this.loop);
  };

  private render() {
    const ctx = this.ctx;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;

    // Background — gets darker as we rise (stylized).
    ctx.fillStyle = "#0c2418";
    ctx.fillRect(0, 0, w, h);

    // Apply zoom-out: at altitude=0.5m we see only ~6m radius;
    // at altitude=20m we see the full pitch.
    const fullViewAlt = 20;
    const zoom = Math.min(1, this.altitudeM / fullViewAlt);
    drawFieldLines(ctx, w, h, zoom);

    // Observer
    const obs = pitchToCanvas(this.opts.observer.x, this.opts.observer.z, w, h, zoom);
    ctx.save();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(obs.x, obs.y, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Truth markers (solid)
    for (const e of this.opts.truth) {
      const c = pitchToCanvas(e.pos.x, e.pos.z, w, h, zoom);
      drawMarker(ctx, c.x, c.y, e.kind, false);
    }

    // Placed markers (ghost) + error lines
    for (const pair of this.opts.report.pairs) {
      const a = pitchToCanvas(pair.placed.pos.x, pair.placed.pos.z, w, h, zoom);
      const b = pitchToCanvas(pair.truth.pos.x, pair.truth.pos.z, w, h, zoom);
      ctx.save();
      ctx.strokeStyle = ERR_COLOR[classifyError(pair.errorCm)];
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.restore();
      drawMarker(ctx, a.x, a.y, pair.placed.kind, true);
    }
  }
}

function drawMarker(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  k: keyof typeof KIND_FILL,
  ghost: boolean
) {
  const r = k === "ball" ? 6 : 9;
  ctx.save();
  ctx.globalAlpha = ghost ? 0.55 : 1;
  ctx.fillStyle = ghost ? "transparent" : KIND_FILL[k];
  ctx.strokeStyle = ghost ? KIND_FILL[k] : KIND_STROKE[k];
  ctx.lineWidth = ghost ? 2 : 2;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  if (!ghost) ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function pitchToCanvas(x: number, z: number, w: number, h: number, zoom: number) {
  // zoom 0..1; we zoom around the pitch center.
  const cx = ((x + PITCH.length / 2) / PITCH.length) * w;
  const cy = ((z + PITCH.width / 2) / PITCH.width) * h;
  const ox = w / 2, oy = h / 2;
  // When zoom < 1 we scale outward (zoomed-in == seeing less area).
  const k = lerp(3.5, 1, zoom);
  return { x: ox + (cx - ox) * k, y: oy + (cy - oy) * k };
}

function drawFieldLines(ctx: CanvasRenderingContext2D, w: number, h: number, zoom: number) {
  ctx.save();
  ctx.strokeStyle = `rgba(255,255,255,${0.25 + 0.4 * zoom})`;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();
  const r = (9.15 / PITCH.width) * h * lerp(3.5, 1, zoom);
  ctx.beginPath(); ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function easeOutCubic(t: number) { return 1 - Math.pow(1 - t, 3); }
function formatErr(cm: number) {
  if (cm < 100) return `${cm.toFixed(0)} cm`;
  return `${(cm / 100).toFixed(2)} m`;
}
