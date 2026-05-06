import { EntityKind, PITCH, Vec2 } from "../../data/types";
import { Clip, MovingEntity } from "../../data/clips";
import { positionAt } from "../../engine/physics";

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

export interface PredictResult {
  prediction: Vec2;
  reactionMs: number;
}

export interface PredictOptions {
  clip: Clip;
  onSubmit: (r: PredictResult) => void;
}

/** Frozen tactics-board view. The user gets one tap to commit the prediction;
 *  the timer starts at the first paint after the post-blackout fade-in. */
export class PredictView {
  el: HTMLElement;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private goTime = 0;
  private prediction: Vec2 | null = null;
  private reactionMs = 0;
  private frozenSnapshot: { e: MovingEntity; pos: Vec2 }[] = [];
  private submitBtn!: HTMLButtonElement;
  private targetEntity!: MovingEntity;
  private flashTimeout: number | null = null;

  constructor(container: HTMLElement, private opts: PredictOptions) {
    // Snapshot every entity's position at freeze time.
    for (const e of opts.clip.entities) {
      this.frozenSnapshot.push({ e, pos: positionAt(e, opts.clip.freezeAtMs) });
    }
    this.targetEntity = opts.clip.entities.find(
      (e) => e.id === opts.clip.targetEntityId
    )!;

    this.el = this.build();
    container.appendChild(this.el);
    requestAnimationFrame(() => {
      this.fitCanvas();
      this.render();
      // Start RT clock the moment the answer surface is first rendered.
      this.goTime = performance.now();
    });
    window.addEventListener("resize", this.onResize);
  }

  destroy() {
    if (this.flashTimeout != null) clearTimeout(this.flashTimeout);
    window.removeEventListener("resize", this.onResize);
    this.el.remove();
  }

  private build() {
    const root = document.createElement("div");
    root.className = "stage plot-stage";
    root.innerHTML = `
      <div class="hud-top">
        <div class="left">MODE&nbsp;:&nbsp;HIDETOSHI</div>
        <div class="right">PHASE&nbsp;:&nbsp;PREDICT</div>
      </div>
      <div class="plot-status">3秒後、ターゲット (★) はどこへ到達するか — タップで回答</div>
      <div class="plot-canvas-wrap">
        <canvas class="plot-canvas"></canvas>
      </div>
      <div class="tray">
        <div class="group"><span class="pip ally">★</span><span>TARGET</span></div>
        <div class="group"><span class="rt-label">REACTION</span><span class="rt-value">— ms</span></div>
        <button class="btn secondary" data-act="reset">RESET</button>
        <button class="btn" data-act="submit" disabled>SUBMIT</button>
      </div>
    `;
    this.canvas = root.querySelector(".plot-canvas") as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d")!;
    this.submitBtn = root.querySelector('[data-act="submit"]') as HTMLButtonElement;

    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    (root.querySelector('[data-act="reset"]') as HTMLButtonElement).onclick = () => {
      this.prediction = null;
      this.reactionMs = 0;
      this.goTime = performance.now();
      this.submitBtn.disabled = true;
      (root.querySelector(".rt-value") as HTMLElement).textContent = "— ms";
      this.render();
    };
    this.submitBtn.onclick = () => {
      if (!this.prediction) return;
      this.opts.onSubmit({ prediction: this.prediction, reactionMs: this.reactionMs });
    };
    return root;
  }

  private onPointerDown = (e: PointerEvent) => {
    // Capture RT only on the first commit (user can adjust afterwards
    // up until SUBMIT — but the decision-time is the first tap).
    if (this.prediction == null) {
      this.reactionMs = performance.now() - this.goTime;
    }
    const pos = this.clientToPitch(e.clientX, e.clientY);
    this.prediction = pos;
    this.submitBtn.disabled = false;
    const rtLabel = this.el.querySelector(".rt-value") as HTMLElement;
    rtLabel.textContent = `${this.reactionMs.toFixed(1)} ms`;
    rtLabel.style.color = this.reactionMs < 500 ? "var(--ok)" : "var(--warn)";
    // Brief flash so the tap feels committed.
    this.flashState = true;
    this.render();
    if (this.flashTimeout != null) clearTimeout(this.flashTimeout);
    this.flashTimeout = window.setTimeout(() => {
      this.flashState = false;
      this.render();
    }, 220);
  };

  private flashState = false;

  private fitCanvas = () => {
    const wrap = this.el.querySelector(".plot-canvas-wrap") as HTMLElement;
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

  private onResize = () => { this.fitCanvas(); this.render(); };

  private render() {
    const ctx = this.ctx;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    ctx.fillStyle = "#0c2418";
    ctx.fillRect(0, 0, w, h);
    drawFieldLines(ctx, w, h);

    // Frozen positions
    for (const { e, pos } of this.frozenSnapshot) {
      const c = pitchToCanvas(pos.x, pos.z, w, h);
      drawMarker(ctx, c.x, c.y, e.kind);
      // Faint velocity arrow (visual hint — same info the user saw moving).
      const speed = Math.hypot(e.vel.x, e.vel.z);
      if (speed > 0.5) {
        const len = Math.min(28, speed * 7);
        const ang = Math.atan2(e.vel.z, e.vel.x);
        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,0.18)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(c.x + Math.cos(ang) * len, c.y + Math.sin(ang) * len);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Highlight target with a star ring
    const tp = positionAt(this.targetEntity, this.opts.clip.freezeAtMs);
    const tc = pitchToCanvas(tp.x, tp.z, w, h);
    ctx.save();
    ctx.strokeStyle = "#ffb84a";
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(tc.x, tc.y, 16, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#ffb84a";
    ctx.font = "700 12px monospace";
    ctx.textAlign = "center";
    ctx.fillText("★", tc.x, tc.y - 22);
    ctx.restore();

    // User prediction
    if (this.prediction) {
      const p = pitchToCanvas(this.prediction.x, this.prediction.z, w, h);
      ctx.save();
      ctx.strokeStyle = this.flashState ? "#fff" : "rgba(255,184,74,0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, 14, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p.x - 6, p.y); ctx.lineTo(p.x + 6, p.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p.x, p.y - 6); ctx.lineTo(p.x, p.y + 6); ctx.stroke();
      // Connector from target → prediction
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = "rgba(255,184,74,0.4)";
      ctx.beginPath(); ctx.moveTo(tc.x, tc.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.restore();
    }
  }

  private clientToPitch(clientX: number, clientY: number): Vec2 {
    const rect = this.canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    return {
      x: (px / w) * PITCH.length - PITCH.length / 2,
      z: (py / h) * PITCH.width - PITCH.width / 2,
    };
  }
}

function pitchToCanvas(x: number, z: number, w: number, h: number) {
  return {
    x: ((x + PITCH.length / 2) / PITCH.length) * w,
    y: ((z + PITCH.width / 2) / PITCH.width) * h,
  };
}

function drawMarker(ctx: CanvasRenderingContext2D, x: number, y: number, k: EntityKind) {
  const r = k === "ball" ? 5 : 8;
  ctx.save();
  ctx.fillStyle = KIND_FILL[k];
  ctx.strokeStyle = KIND_STROKE[k];
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
}

function drawFieldLines(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
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
