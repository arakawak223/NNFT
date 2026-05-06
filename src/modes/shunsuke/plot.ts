import { Entity, EntityKind, PITCH } from "../../data/types";
import { countByKind } from "../../engine/scoring";

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

export interface PlotOptions {
  truth: Entity[];
  observer: { x: number; z: number };
  onSubmit: (placed: Entity[]) => void;
}

/** 2D top-down tactics board where the user drags-to-place markers.
 *  Each kind has a budget equal to the truth count (ally=11, enemy=11, ball=1). */
export class PlotView {
  el: HTMLElement;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private placed: Entity[] = [];
  private quotas: Record<EntityKind, number>;
  private dragging:
    | { kind: EntityKind; clientX: number; clientY: number; existingIdx?: number }
    | null = null;
  private statusEl!: HTMLDivElement;
  private submitBtn!: HTMLButtonElement;
  private nextId = 0;

  constructor(container: HTMLElement, private opts: PlotOptions) {
    this.quotas = countByKind(opts.truth);
    this.el = this.build();
    container.appendChild(this.el);
    requestAnimationFrame(() => {
      this.fitCanvas();
      this.render();
    });
    window.addEventListener("resize", this.onResize);
  }

  destroy() {
    window.removeEventListener("resize", this.onResize);
    this.el.remove();
  }

  private build() {
    const root = document.createElement("div");
    root.className = "stage plot-stage";
    root.innerHTML = `
      <div class="hud-top">
        <div class="left">MODE&nbsp;:&nbsp;SHUNSUKE</div>
        <div class="right">PHASE&nbsp;:&nbsp;PLOT</div>
      </div>
      <div class="plot-status"></div>
      <div class="plot-canvas-wrap">
        <canvas class="plot-canvas"></canvas>
      </div>
      <div class="tray"></div>
    `;
    this.canvas = root.querySelector(".plot-canvas") as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d")!;
    this.statusEl = root.querySelector(".plot-status") as HTMLDivElement;

    const tray = root.querySelector(".tray") as HTMLElement;
    (["ally", "enemy", "ball"] as const).forEach((k) => {
      const total = this.quotas[k];
      const group = document.createElement("div");
      group.className = "group";
      const pip = document.createElement("button");
      pip.className = `pip ${k}`;
      pip.dataset.kind = k;
      pip.textContent = String(total);
      pip.title = "ドラッグで配置";
      pip.style.border = "0";
      pip.style.cursor = "grab";
      this.bindTrayPointer(pip, k);
      const label = document.createElement("span");
      label.dataset.kindLabel = k;
      label.textContent = `${labelFor(k)}  ${this.placedOf(k)}/${total}`;
      group.append(pip, label);
      tray.appendChild(group);
    });

    const spacer = document.createElement("div"); spacer.style.flex = "0 0 24px";
    tray.appendChild(spacer);

    const reset = document.createElement("button");
    reset.className = "btn secondary";
    reset.textContent = "RESET";
    reset.onclick = () => { this.placed = []; this.refreshTray(); this.render(); this.refreshStatus(); };
    tray.appendChild(reset);

    this.submitBtn = document.createElement("button");
    this.submitBtn.className = "btn";
    this.submitBtn.textContent = "REVEAL";
    this.submitBtn.onclick = () => this.opts.onSubmit(this.placed.slice());
    tray.appendChild(this.submitBtn);

    // Canvas drag handlers (move existing markers, drop new ones from tray).
    this.canvas.addEventListener("pointerdown", this.onCanvasDown);
    this.canvas.addEventListener("pointermove", this.onCanvasMove);
    this.canvas.addEventListener("pointerup", this.onCanvasUp);
    this.canvas.addEventListener("pointercancel", this.onCanvasUp);

    this.refreshStatus();
    return root;
  }

  private placedOf(k: EntityKind) { return this.placed.filter((p) => p.kind === k).length; }

  private bindTrayPointer(el: HTMLElement, k: EntityKind) {
    el.addEventListener("pointerdown", (e: PointerEvent) => {
      if (this.placedOf(k) >= this.quotas[k]) return;
      this.dragging = { kind: k, clientX: e.clientX, clientY: e.clientY };
      el.setPointerCapture(e.pointerId);
      el.style.cursor = "grabbing";
    });
    el.addEventListener("pointermove", (e: PointerEvent) => {
      if (!this.dragging || this.dragging.existingIdx != null) return;
      this.dragging.clientX = e.clientX;
      this.dragging.clientY = e.clientY;
    });
    el.addEventListener("pointerup", (e: PointerEvent) => {
      el.style.cursor = "grab";
      try { el.releasePointerCapture(e.pointerId); } catch {}
      if (!this.dragging) return;
      const rect = this.canvas.getBoundingClientRect();
      if (
        e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom
      ) {
        const pos = this.clientToPitch(e.clientX, e.clientY);
        this.placed.push({ id: `U${this.nextId++}`, kind: this.dragging.kind, pos });
      }
      this.dragging = null;
      this.refreshTray();
      this.render();
      this.refreshStatus();
    });
    el.addEventListener("pointercancel", () => { this.dragging = null; el.style.cursor = "grab"; });
  }

  private onCanvasDown = (e: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    // Hit-test existing markers (radius 14px in canvas coords).
    let bestIdx = -1, bestD = 14 * 14;
    for (let i = 0; i < this.placed.length; i++) {
      const m = this.placed[i];
      const c = this.pitchToCanvas(m.pos.x, m.pos.z);
      const dx = c.x - px, dy = c.y - py;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD) { bestD = d2; bestIdx = i; }
    }
    if (bestIdx >= 0) {
      this.dragging = { kind: this.placed[bestIdx].kind, clientX: e.clientX, clientY: e.clientY, existingIdx: bestIdx };
      this.canvas.setPointerCapture(e.pointerId);
    }
  };

  private onCanvasMove = (e: PointerEvent) => {
    if (!this.dragging || this.dragging.existingIdx == null) return;
    const pos = this.clientToPitch(e.clientX, e.clientY);
    this.placed[this.dragging.existingIdx].pos = pos;
    this.render();
  };

  private onCanvasUp = (e: PointerEvent) => {
    if (this.dragging?.existingIdx != null) {
      try { this.canvas.releasePointerCapture(e.pointerId); } catch {}
      this.dragging = null;
      this.refreshStatus();
    }
  };

  private refreshTray() {
    (["ally", "enemy", "ball"] as const).forEach((k) => {
      const label = this.el.querySelector(`[data-kind-label="${k}"]`) as HTMLElement;
      const total = this.quotas[k];
      label.textContent = `${labelFor(k)}  ${this.placedOf(k)}/${total}`;
    });
  }

  private refreshStatus() {
    const total = this.opts.truth.length;
    this.statusEl.textContent = `${this.placed.length} / ${total}  PLACED`;
    // Allow submit even with partial placements — the user might run out of memory.
    this.submitBtn.disabled = this.placed.length === 0;
  }

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
    ctx.clearRect(0, 0, w, h);
    // Pitch background
    ctx.fillStyle = "#0c2418";
    ctx.fillRect(0, 0, w, h);
    drawFieldLines(ctx, w, h);

    // Observer marker
    const obs = this.pitchToCanvas(this.opts.observer.x, this.opts.observer.z);
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.arc(obs.x, obs.y, 12, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(obs.x, obs.y, 4, 0, Math.PI * 2); ctx.fill();
    ctx.font = "10px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText("YOU", obs.x + 8, obs.y - 8);
    ctx.restore();

    // Placed markers
    for (const m of this.placed) {
      const c = this.pitchToCanvas(m.pos.x, m.pos.z);
      this.drawMarker(ctx, c.x, c.y, m.kind, false);
    }
  }

  private drawMarker(ctx: CanvasRenderingContext2D, x: number, y: number, k: EntityKind, ghost: boolean) {
    const r = k === "ball" ? 6 : 9;
    ctx.save();
    ctx.globalAlpha = ghost ? 0.55 : 1;
    ctx.fillStyle = KIND_FILL[k];
    ctx.strokeStyle = KIND_STROKE[k];
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // ----- coordinate conversions -----
  private pitchToCanvas(x: number, z: number) {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    return {
      x: ((x + PITCH.length / 2) / PITCH.length) * w,
      y: ((z + PITCH.width / 2) / PITCH.width) * h,
    };
  }

  private clientToPitch(clientX: number, clientY: number) {
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

function labelFor(k: EntityKind) {
  return k === "ally" ? "ALLY" : k === "enemy" ? "ENEMY" : "BALL";
}

function drawFieldLines(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  // halfway
  ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();
  // center circle
  const r = (9.15 / PITCH.width) * h;
  ctx.beginPath(); ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2); ctx.stroke();
  // penalty boxes
  const pbW = (16.5 / PITCH.length) * w;
  const pbH = (40.32 / PITCH.width) * h;
  ctx.strokeRect(0, (h - pbH) / 2, pbW, pbH);
  ctx.strokeRect(w - pbW, (h - pbH) / 2, pbW, pbH);
  // goal boxes
  const gbW = (5.5 / PITCH.length) * w;
  const gbH = (18.32 / PITCH.width) * h;
  ctx.strokeRect(0, (h - gbH) / 2, gbW, gbH);
  ctx.strokeRect(w - gbW, (h - gbH) / 2, gbW, gbH);
  ctx.restore();
}
