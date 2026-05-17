import { StadiumKind } from "../engine/stadium";

export interface TitleOptions {
  /** True iff a PLATEAU URL is configured via env. When false, the
   *  PLATEAU toggle is rendered but disabled. */
  plateauAvailable: boolean;
  /** Persisted choice (or default "mock"). */
  initialStadium: StadiumKind;
  onPick: (mode: "shunsuke" | "hidetoshi", stadium: StadiumKind) => void;
  onStadiumChange?: (stadium: StadiumKind) => void;
}

export function buildTitle(opts: TitleOptions): HTMLElement {
  const el = document.createElement("div");
  el.className = "title-screen";
  const plateauAttr = opts.plateauAvailable ? "" : "disabled";
  const stadium: StadiumKind = opts.plateauAvailable ? opts.initialStadium : "mock";
  el.innerHTML = `
    <div>
      <div class="brand">VISIONARY · CORE</div>
      <h1 class="app-title">Visionary Core</h1>
      <div class="app-sub">ビジョナリー・コア</div>
      <p class="app-tagline">
        「フィジカル」を動かす前に、まず「ビジョン」が正解を導き出していなければならない。<br/>
        日本サッカー界の二大天才の視覚能力を数値化・体系化し、<br/>
        ピッチ上の情報を瞬時にマップ化する脳を構築する。
      </p>
    </div>
    <div class="stadium-toggle" role="radiogroup" aria-label="Stadium source">
      <div class="stadium-label">STADIUM</div>
      <button class="seg ${stadium === "mock" ? "on" : ""}" data-stadium="mock" role="radio">MOCK</button>
      <button class="seg ${stadium === "plateau" ? "on" : ""}" data-stadium="plateau" role="radio" ${plateauAttr}>PLATEAU</button>
      <div class="stadium-sub">${
        opts.plateauAvailable
          ? "PLATEAU の glTF を読み込みます (VITE_PLATEAU_GLTF_URL)"
          : "VITE_PLATEAU_GLTF_URL 未設定 — MOCK のみ利用可"
      }</div>
    </div>
    <div class="modes">
      <button class="mode-card" data-mode="shunsuke">
        <div class="mode-tag">MODE · 01</div>
        <h3>SHUNSUKE</h3>
        <p>標高 20m の座標把握。1 秒のスキャンでピッチ上の 23 個のオブジェクトを脳内マップに焼きつけよ。</p>
      </button>
      <button class="mode-card" data-mode="hidetoshi">
        <div class="mode-tag">MODE · 02</div>
        <h3>HIDETOSHI</h3>
        <p>4 次元の未来予測。各選手のベクトルから 3 秒後のスペースを算出する能力を鍛える。</p>
      </button>
    </div>
    <div class="title-foot">v0.1 · PHASE 3 PROTOTYPE</div>
  `;

  let current: StadiumKind = stadium;
  const segs = el.querySelectorAll<HTMLButtonElement>(".seg");
  segs.forEach((seg) => {
    seg.addEventListener("click", () => {
      if (seg.disabled) return;
      const k = seg.dataset.stadium as StadiumKind;
      current = k;
      segs.forEach((s) => s.classList.toggle("on", s === seg));
      opts.onStadiumChange?.(k);
    });
  });

  el.querySelectorAll<HTMLButtonElement>(".mode-card").forEach((card) => {
    card.addEventListener("click", () => {
      if (card.disabled) return;
      const m = card.dataset.mode as "shunsuke" | "hidetoshi";
      opts.onPick(m, current);
    });
  });
  return el;
}
