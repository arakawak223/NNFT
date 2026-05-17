import { EntityKind, PITCH, Vec2 } from "../../data/types";
import { Clip } from "../../data/clips";
import { positionAt } from "../../engine/physics";
import { HidetoshiReport, KILLER_PASS_DIST_M, KILLER_PASS_RT_MS } from "../../engine/scoring";
import { AxisValues, RadarChart } from "../../ui/radar";

const KIND_FILL: Record<EntityKind, string> = {
  ally: "#38e1ff",
  enemy: "#ff3a6e",
  ball: "#ffe066",
};
const KIND_STROKE: Record<EntityKind, string> = {
  ally: "#0a3346",
  enemy: "#3a0916",
  ball: "#3a2900",
};

export interface RevealOptions {
  clip: Clip;
  prediction: Vec2;
  truth: Vec2;
  report: HidetoshiReport;
  /** Personal best per axis BEFORE this run. */
  previousBests: AxisValues;
  onRetry: () => void;
  onMenu: () => void;
}

/** Animated 3-second forward simulation showing prediction vs truth. */
export class HidetoshiRevealView {
  el: HTMLElement;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private radarCanvas!: HTMLCanvasElement;
  private radar!: RadarChart;
  private startedAt = 0;
  private rafId = 0;

  constructor(container: HTMLElement, private opts: RevealOptions) {
    this.el = this.build();
    container.appendChild(this.el);
    requestAnimationFrame(() => {
      this.fitCanvas();
      this.fitRadar();
      this.startedAt = performance.now();
      this.loop();
      this.radar.start();
    });
    window.addEventListener("resize", this.onResize);
  }

  destroy() {
    cancelAnimationFrame(this.rafId);
    this.radar?.destroy();
    window.removeEventListener("resize", this.onResize);
    this.el.remove();
  }

  private build() {
    const root = document.createElement("div");
    root.className = "stage result-stage";
    const r = this.opts.report;
    const rtCls = r.reactionMs < KILLER_PASS_RT_MS ? "ok" : "bad";
    const distCls = r.errorM < KILLER_PASS_DIST_M ? "ok" : r.errorM < 8 ? "warn" : "bad";
    const verdict = r.killerPassSuccess
      ? `<span style="color:var(--ok)">KILLER PASS ✓</span>`
      : `<span style="color:var(--bad)">KILLER PASS ✗</span>`;

    root.innerHTML = `
      <div class="hud-top">
        <div class="left">MODE&nbsp;:&nbsp;HIDETOSHI</div>
        <div class="right">PHASE&nbsp;:&nbsp;REVEAL</div>
      </div>
      <div class="altitude-banner">${verdict} &nbsp;·&nbsp; +3.0s SIMULATION</div>
      <div class="result-canvas-wrap">
        <canvas></canvas>
      </div>
      <div class="result-radar">
        <canvas class="radar-canvas"></canvas>
        <div class="radar-legend">
          <div class="radar-title">VISION&nbsp;IQ&nbsp;RADAR</div>
          <div class="radar-row"><span class="dot now"></span><span>このラン</span></div>
          <div class="radar-row"><span class="dot best"></span><span>自己ベスト (前回まで)</span></div>
          <div class="radar-row"><span class="dot bench"></span><span>レジェンド基準 100</span></div>
          <div class="radar-foot">情報保持は SHUNSUKE で · 周辺視は Phase 3</div>
        </div>
      </div>
      <div class="result-summary">
        <div class="metric">
          <div class="label">REACTION</div>
          <div class="value" style="color:var(--${rtCls})">${r.reactionMs.toFixed(1)} ms</div>
          <div class="sub">キラーパスの閾値 ${KILLER_PASS_RT_MS} ms</div>
        </div>
        <div class="metric">
          <div class="label">ERROR</div>
          <div class="value" style="color:var(--${distCls})">${formatErr(r.errorM)}</div>
          <div class="sub">許容誤差 ${KILLER_PASS_DIST_M.toFixed(1)} m</div>
        </div>
        <div class="metric">
          <div class="label">PRED. SPEED</div>
          <div class="value">${r.iq.predictionSpeed}</div>
          <div class="sub">/ 100</div>
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
    this.canvas = root.querySelector(".result-canvas-wrap canvas") as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d")!;
    this.radarCanvas = root.querySelector(".radar-canvas") as HTMLCanvasElement;
    this.radar = new RadarChart(this.radarCanvas, {
      values: {
        coordAccuracy: r.iq.coordAccuracy,
        predictionSpeed: r.iq.predictionSpeed,
        infoRetention: null,
        peripheralReaction: null,
      },
      best: this.opts.previousBests,
    });
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

  private fitRadar = () => {
    const wrap = this.radarCanvas.parentElement as HTMLElement;
    const size = Math.min(wrap.clientHeight - 16, 220);
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.radarCanvas.style.width = `${size}px`;
    this.radarCanvas.style.height = `${size}px`;
    this.radarCanvas.width = Math.round(size * dpr);
    this.radarCanvas.height = Math.round(size * dpr);
    const rctx = this.radarCanvas.getContext("2d")!;
    rctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.radar.redraw();
  };

  private onResize = () => {
    this.fitCanvas();
    this.fitRadar();
  };

  private loop = () => {
    const elapsed = performance.now() - this.startedAt;
    // Slow the simulation a touch — 3s real-world prediction shown over 2.4s.
    const SIM_DURATION_MS = 2400;
    const tNorm = Math.min(1, elapsed / SIM_DURATION_MS);
    const simT = tNorm * this.opts.clip.predictionDeltaMs;
    this.render(simT);
    if (tNorm < 1) this.rafId = requestAnimationFrame(this.loop);
  };

  private render(simT: number) {
    const ctx = this.ctx;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    ctx.fillStyle = "#0c2418";
    ctx.fillRect(0, 0, w, h);
    drawFieldLines(ctx, w, h);

    const freezeT = this.opts.clip.freezeAtMs;
    const target = this.opts.clip.entities.find(
      (e) => e.id === this.opts.clip.targetEntityId
    )!;

    // Trails + current positions for every entity.
    for (const e of this.opts.clip.entities) {
      const trailFrom = positionAt(e, freezeT);
      const cur = positionAt(e, freezeT + simT);
      const a = pitchToCanvas(trailFrom.x, trailFrom.z, w, h);
      const b = pitchToCanvas(cur.x, cur.z, w, h);
      // Trail
      ctx.save();
      ctx.strokeStyle =
        e.id === target.id
          ? "rgba(255,184,74,0.9)"
          : `rgba(255,255,255,0.18)`;
      ctx.lineWidth = e.id === target.id ? 2 : 1;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.restore();
      // Current
      drawMarker(ctx, b.x, b.y, e.kind, e.id === target.id);
    }

    // User prediction (static)
    const p = pitchToCanvas(this.opts.prediction.x, this.opts.prediction.z, w, h);
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, 14, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p.x - 6, p.y); ctx.lineTo(p.x + 6, p.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p.x, p.y - 6); ctx.lineTo(p.x, p.y + 6); ctx.stroke();
    ctx.font = "10px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.textAlign = "center";
    ctx.fillText("YOU", p.x, p.y - 18);
    ctx.restore();

    // Truth marker (final destination)
    const t = pitchToCanvas(this.opts.truth.x, this.opts.truth.z, w, h);
    ctx.save();
    ctx.fillStyle = "rgba(74, 222, 128, 0.25)";
    ctx.strokeStyle = "var(--ok)";
    ctx.strokeStyle = "#4ade80";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(t.x, t.y, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.font = "10px monospace";
    ctx.fillStyle = "#4ade80";
    ctx.textAlign = "center";
    ctx.fillText("TRUTH", t.x, t.y - 18);

    // Error vector
    if (simT >= this.opts.clip.predictionDeltaMs * 0.95) {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = this.opts.report.killerPassSuccess ? "#4ade80" : "#ef4444";
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(t.x, t.y); ctx.stroke();
    }
    ctx.restore();
  }
}

function pitchToCanvas(x: number, z: number, w: number, h: number) {
  return {
    x: ((x + PITCH.length / 2) / PITCH.length) * w,
    y: ((z + PITCH.width / 2) / PITCH.width) * h,
  };
}

function drawMarker(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  k: EntityKind,
  isTarget: boolean
) {
  const r = k === "ball" ? 5 : 8;
  ctx.save();
  ctx.fillStyle = KIND_FILL[k];
  ctx.strokeStyle = KIND_STROKE[k];
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  if (isTarget) {
    ctx.strokeStyle = "#ffb84a";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r + 5, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function drawFieldLines(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();
  const r = (9.15 / PITCH.width) * h;
  ctx.beginPath(); ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2); ctx.stroke();
  const pbW = (16.5 / PITCH.length) * w;
  const pbH = (40.32 / PITCH.width) * h;
  ctx.strokeRect(0, (h - pbH) / 2, pbW, pbH);
  ctx.strokeRect(w - pbW, (h - pbH) / 2, pbW, pbH);
  ctx.restore();
}

function formatErr(m: number) {
  return m < 1 ? `${(m * 100).toFixed(0)} cm` : `${m.toFixed(2)} m`;
}
