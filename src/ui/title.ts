export interface TitleOptions {
  onPick: (mode: "shunsuke" | "hidetoshi") => void;
}

export function buildTitle(opts: TitleOptions): HTMLElement {
  const el = document.createElement("div");
  el.className = "title-screen";
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
    <div class="title-foot">v0.1 · PHASE 1 PROTOTYPE</div>
  `;
  el.querySelectorAll(".mode-card").forEach((card) => {
    card.addEventListener("click", () => {
      const m = (card as HTMLElement).dataset.mode as "shunsuke" | "hidetoshi";
      if ((card as HTMLButtonElement).disabled) return;
      opts.onPick(m);
    });
  });
  return el;
}
