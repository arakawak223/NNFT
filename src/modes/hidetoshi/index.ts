import { generateClip, Clip, MovingEntity } from "../../data/clips";
import { positionAt } from "../../engine/physics";
import { scoreHidetoshi } from "../../engine/scoring";
import { Vec2 } from "../../data/types";
import { StadiumProvider } from "../../engine/stadium";
import { WEATHER_LABEL_JA } from "../../engine/weather";
import { loadBests, updateBests } from "../../ui/radar";
import { ClipPlayer } from "./clip";
import { PredictView, PredictResult } from "./predict";
import { HidetoshiRevealView } from "./reveal";

export interface HidetoshiOptions {
  onExit: () => void;
  stadium?: StadiumProvider;
}

/** Orchestrates the HIDETOSHI flow: clip → freeze/blackout → predict → reveal. */
export class HidetoshiMode {
  el: HTMLElement;
  private current: { destroy: () => void } | null = null;

  constructor(host: HTMLElement, private opts: HidetoshiOptions) {
    this.el = document.createElement("div");
    this.el.className = "stage";
    this.el.style.flex = "1";
    host.appendChild(this.el);
    this.startClip(generateClip());
  }

  destroy() {
    this.current?.destroy();
    this.el.remove();
  }

  // ----- Phase 1: Clip -----
  private startClip(clip: Clip) {
    this.replaceContent();

    const stage = document.createElement("div");
    stage.className = "stage scan-stage";
    stage.style.height = "100%";
    this.el.appendChild(stage);

    const hud = document.createElement("div");
    hud.className = "hud-top";
    hud.innerHTML = `
      <div class="left">
        <span>MODE&nbsp;:&nbsp;HIDETOSHI</span>
        ${weatherChip(clip.weather)}
      </div>
      <div class="right"><span class="scan-timer">0.00</span></div>
    `;
    stage.appendChild(hud);

    const inst = document.createElement("div");
    inst.className = "scan-instructions";
    inst.textContent = "★ ターゲット選手の動き、味方/敵のベクトルを観測しろ — フリーズ後、3秒先を予測する";
    stage.appendChild(inst);

    const progress = document.createElement("div");
    progress.className = "scan-progress";
    progress.style.transform = "scaleX(0)";
    progress.style.transitionDuration = `${clip.freezeAtMs}ms`;
    stage.appendChild(progress);

    const timerEl = hud.querySelector(".scan-timer") as HTMLElement;

    const player = new ClipPlayer(stage, clip, {
      stadium: this.opts.stadium,
      onTick: (elapsed, total) => {
        timerEl.textContent = (elapsed / 1000).toFixed(2);
        progress.style.transform = `scaleX(${Math.min(1, elapsed / total)})`;
      },
      onFreeze: () => this.blackoutThen(() => this.startPredict(clip)),
    });
    requestAnimationFrame(() => { progress.style.transform = "scaleX(1)"; });
    player.start();
    this.current = player;
  }

  private blackoutThen(next: () => void) {
    const fade = document.createElement("div");
    fade.className = "fade-black";
    this.el.appendChild(fade);
    requestAnimationFrame(() => fade.classList.add("on"));
    setTimeout(next, 320);
  }

  // ----- Phase 2: Predict -----
  private startPredict(clip: Clip) {
    this.replaceContent();
    const view = new PredictView(this.el, {
      clip,
      onSubmit: ({ prediction, reactionMs }) => {
        this.startReveal(clip, prediction, reactionMs);
      },
    });
    this.current = view;
  }

  // ----- Phase 3: Reveal -----
  private startReveal(clip: Clip, prediction: Vec2, reactionMs: number) {
    this.replaceContent();
    const target = clip.entities.find((e) => e.id === clip.targetEntityId)! as MovingEntity;
    const truth = positionAt(target, clip.freezeAtMs + clip.predictionDeltaMs);
    const report = scoreHidetoshi(prediction, truth, reactionMs);
    persistRun(report);
    const previousBests = loadBests();
    updateBests({
      coordAccuracy: report.iq.coordAccuracy,
      predictionSpeed: report.iq.predictionSpeed,
    });
    const view = new HidetoshiRevealView(this.el, {
      clip,
      prediction,
      truth,
      report,
      previousBests,
      onRetry: () => this.startClip(generateClip()),
      onMenu: () => this.opts.onExit(),
    });
    this.current = view;
  }

  private replaceContent() {
    this.current?.destroy();
    this.current = null;
    this.el.innerHTML = "";
  }
}

function weatherChip(w: Clip["weather"]): string {
  if (w === "clear") return "";
  return `<span class="weather-chip" data-w="${w}">${w.toUpperCase()} · ${WEATHER_LABEL_JA[w]}</span>`;
}

function persistRun(report: ReturnType<typeof scoreHidetoshi>) {
  try {
    const key = "vc.runs";
    const existing = JSON.parse(localStorage.getItem(key) ?? "[]");
    existing.push({
      ts: Date.now(),
      mode: "HIDETOSHI",
      errorM: report.errorM,
      reactionMs: report.reactionMs,
      killerPass: report.killerPassSuccess,
      iq: report.iq.overall,
    });
    localStorage.setItem(key, JSON.stringify(existing.slice(-50)));
  } catch {
    /* localStorage may be unavailable in private mode — silently skip. */
  }
}

// Keep PredictResult exported type referenced for downstream consumers.
export type { PredictResult };
