import { buildTitle } from "./ui/title";
import { ShunsukeMode } from "./modes/shunsuke";
import { HidetoshiMode } from "./modes/hidetoshi";

const root = document.getElementById("app")!;

let active: { destroy: () => void } | null = null;

function showTitle() {
  if (active) { active.destroy(); active = null; }
  root.innerHTML = "";
  const el = buildTitle({
    onPick: (mode) => {
      if (mode === "shunsuke") startShunsuke();
      if (mode === "hidetoshi") startHidetoshi();
    },
  });
  root.appendChild(el);
  active = { destroy: () => el.remove() };
}

function startShunsuke() {
  if (active) { active.destroy(); active = null; }
  root.innerHTML = "";
  active = new ShunsukeMode(root, { onExit: showTitle });
}

function startHidetoshi() {
  if (active) { active.destroy(); active = null; }
  root.innerHTML = "";
  active = new HidetoshiMode(root, { onExit: showTitle });
}

showTitle();
