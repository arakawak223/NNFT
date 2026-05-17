import { buildTitle } from "./ui/title";
import { ShunsukeMode } from "./modes/shunsuke";
import { HidetoshiMode } from "./modes/hidetoshi";
import { StadiumKind, makeStadium } from "./engine/stadium";

const root = document.getElementById("app")!;

const PLATEAU_URL = import.meta.env.VITE_PLATEAU_GLTF_URL;
const PLATEAU_AVAILABLE = !!PLATEAU_URL;
const STADIUM_KEY = "vc.stadium";

let active: { destroy: () => void } | null = null;

function loadStadiumChoice(): StadiumKind {
  try {
    const v = localStorage.getItem(STADIUM_KEY);
    if (v === "plateau" && PLATEAU_AVAILABLE) return "plateau";
  } catch {/* private mode */}
  return "mock";
}

function saveStadiumChoice(k: StadiumKind) {
  try { localStorage.setItem(STADIUM_KEY, k); } catch {/* private mode */}
}

function makeStadiumWithToast(kind: StadiumKind) {
  return makeStadium(kind, PLATEAU_URL, (result, err) => {
    if (result === "loaded") {
      showToast("PLATEAU stadium loaded");
    } else if (kind === "plateau") {
      // Only surface a fallback toast if PLATEAU was actually requested.
      showToast(`PLATEAU load failed — using mock (${describeErr(err)})`);
    }
  });
}

function showTitle() {
  if (active) { active.destroy(); active = null; }
  root.innerHTML = "";
  const el = buildTitle({
    plateauAvailable: PLATEAU_AVAILABLE,
    initialStadium: loadStadiumChoice(),
    onStadiumChange: saveStadiumChoice,
    onPick: (mode, stadium) => {
      saveStadiumChoice(stadium);
      if (mode === "shunsuke") startShunsuke(stadium);
      if (mode === "hidetoshi") startHidetoshi(stadium);
    },
  });
  root.appendChild(el);
  active = { destroy: () => el.remove() };
}

function startShunsuke(stadium: StadiumKind) {
  if (active) { active.destroy(); active = null; }
  root.innerHTML = "";
  active = new ShunsukeMode(root, {
    onExit: showTitle,
    stadium: makeStadiumWithToast(stadium),
  });
}

function startHidetoshi(stadium: StadiumKind) {
  if (active) { active.destroy(); active = null; }
  root.innerHTML = "";
  active = new HidetoshiMode(root, {
    onExit: showTitle,
    stadium: makeStadiumWithToast(stadium),
  });
}

function showToast(msg: string) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

function describeErr(err: unknown): string {
  if (err instanceof Error) return err.message.slice(0, 80);
  return String(err).slice(0, 80);
}

showTitle();
