import { buildTitle } from "./ui/title";
import { ShunsukeMode } from "./modes/shunsuke";

const root = document.getElementById("app")!;

let active: { destroy: () => void } | null = null;

function showTitle() {
  if (active) { active.destroy(); active = null; }
  root.innerHTML = "";
  const el = buildTitle({
    onPick: (mode) => {
      if (mode === "shunsuke") startShunsuke();
      // hidetoshi card is disabled in MVP.
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

showTitle();
