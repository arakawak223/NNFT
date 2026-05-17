import { generateScenario, Scenario } from "../../engine/scenario";
import { score } from "../../engine/scoring";
import { Entity } from "../../data/types";
import { StadiumProvider } from "../../engine/stadium";
import { loadBests, updateBests } from "../../ui/radar";
import { ScanResult, ScanView } from "./scan";
import { PlotView } from "./plot";
import { RevealView } from "./reveal";

const SCAN_MS = 1000;

export interface ShunsukeOptions {
  onExit: () => void;
  stadium?: StadiumProvider;
}

/** Orchestrates the SHUNSUKE flow: scan → blackout → plot → reveal. */
export class ShunsukeMode {
  el: HTMLElement;
  private current: { destroy: () => void } | null = null;

  constructor(host: HTMLElement, private opts: ShunsukeOptions) {
    this.el = document.createElement("div");
    this.el.className = "stage";
    this.el.style.flex = "1";
    host.appendChild(this.el);
    this.startScan(generateScenario());
  }

  destroy() {
    this.current?.destroy();
    this.el.remove();
  }

  // ----- Phase 1: Scan -----
  private startScan(scenario: Scenario) {
    this.replaceContent();

    const stage = document.createElement("div");
    stage.className = "stage scan-stage";
    stage.style.height = "100%";
    this.el.appendChild(stage);

    const hud = document.createElement("div");
    hud.className = "hud-top";
    hud.innerHTML = `
      <div class="left">MODE&nbsp;:&nbsp;SHUNSUKE</div>
      <div class="right"><span class="scan-timer">1.00</span></div>
    `;
    stage.appendChild(hud);

    const cross = document.createElement("div");
    cross.className = "crosshair";
    stage.appendChild(cross);

    const inst = document.createElement("div");
    inst.className = "scan-instructions";
    inst.textContent = "ドラッグまたはジャイロで首を振り、味方/敵/ボール 23 個の位置を脳に焼きつけろ";
    stage.appendChild(inst);

    const progress = document.createElement("div");
    progress.className = "scan-progress";
    progress.style.transform = "scaleX(1)";
    progress.style.transitionDuration = `${SCAN_MS}ms`;
    stage.appendChild(progress);

    const timerEl = hud.querySelector(".scan-timer") as HTMLElement;

    const view = new ScanView(stage, scenario, {
      durationMs: SCAN_MS,
      stadium: this.opts.stadium,
      onTick: (rem) => {
        timerEl.textContent = (rem / 1000).toFixed(2);
      },
      onComplete: (result) => {
        this.blackoutThen(() => this.startPlot(scenario, result));
      },
    });
    // Kick the progress bar.
    requestAnimationFrame(() => { progress.style.transform = "scaleX(0)"; });
    view.start();
    this.current = view;
  }

  private blackoutThen(next: () => void) {
    const fade = document.createElement("div");
    fade.className = "fade-black";
    this.el.appendChild(fade);
    requestAnimationFrame(() => fade.classList.add("on"));
    setTimeout(() => {
      next();
      // The next view replaces .el's content; the fade is gone with it.
    }, 280);
  }

  // ----- Phase 2: Plot -----
  private startPlot(scenario: Scenario, scanResult: ScanResult) {
    this.replaceContent();
    const view = new PlotView(this.el, {
      truth: scenario.entities,
      observer: scenario.observer,
      onSubmit: (placed) => this.startReveal(scenario, placed, scanResult),
    });
    this.current = view;
  }

  // ----- Phase 3: Reveal / Result -----
  private startReveal(scenario: Scenario, placed: Entity[], scanResult: ScanResult) {
    this.replaceContent();
    const report = score(placed, scenario.entities, {
      yawSamples: scanResult.yawSamples,
      observer: scenario.observer,
    });
    persistRun(report);
    // Capture pre-run bests so the radar shows the bar to beat,
    // then update bests with this run's measured axes (peripheral only
    // counts when the pool was large enough).
    const previousBests = loadBests();
    updateBests({
      coordAccuracy: report.iq.coordAccuracy,
      infoRetention: report.iq.infoRetention,
      peripheralReaction: report.iq.peripheralReaction,
    });
    const view = new RevealView(this.el, {
      truth: scenario.entities,
      placed,
      observer: scenario.observer,
      report,
      previousBests,
      onRetry: () => this.startScan(generateScenario()),
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

function persistRun(report: ReturnType<typeof score>) {
  try {
    const key = "vc.runs";
    const existing = JSON.parse(localStorage.getItem(key) ?? "[]");
    existing.push({
      ts: Date.now(),
      mode: "SHUNSUKE",
      avgCm: report.averageErrorCm,
      altM: report.viewpointAltitudeM,
      iq: report.iq.overall,
    });
    localStorage.setItem(key, JSON.stringify(existing.slice(-50)));
  } catch {
    /* localStorage may be unavailable in private mode — silently skip. */
  }
}
