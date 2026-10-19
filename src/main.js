import { Game } from "./game.js";
import { Input } from "./input.js";
import { Sound } from "./audio.js";
import { getBest, setBest } from "./storage.js";

const $ = (id) => document.getElementById(id);

const canvas = $("game");
const overlay = $("overlay");
const els = {
  score: $("score"),
  best: $("best"),
  combo: $("combo"),
  comboValue: $("comboValue"),
  title: $("title"),
  desc: $("desc"),
  result: $("result"),
  action: $("action"),
  hint: $("hint"),
  eyebrow: $("eyebrow"),
  live: $("live"),
  sound: $("sound"),
};

const params = new URLSearchParams(window.location.search);
const auto = params.get("auto") === "1";
const seed = Number.parseInt(params.get("seed") ?? "", 10) || ((Date.now() >>> 0) % 100000);

const sound = new Sound();
let muted = readMuted();
sound.setMuted(muted);
renderSound();

const screens = {
  menu: {
    eyebrow: "CV-MALIN · 2026",
    title: "霓虹躲避",
    desc: "在坠落的光柱之间穿行。擦身而过，分数涨得更快。",
    action: "开始游戏",
    hint: "← → / A D 移动 · 鼠标或手指拖动 · 空格开始 · P 暂停",
    result: null,
  },
  paused: {
    eyebrow: "PAUSED",
    title: "暂停",
    desc: "喘口气。回来时障碍还在原地等你。",
    action: "继续",
    hint: "按 P、Esc 或空格继续",
    result: null,
  },
  dead: {
    eyebrow: "GAME OVER",
    title: "撞上了",
    desc: "再来一次，通常比上一局走得更远。",
    action: "再来一局",
    hint: "空格 / 点击屏幕 立即重开",
    result: "",
  },
};

const game = new Game({
  canvas,
  hud: els,
  input: null,
  sound,
  seed,
  auto,
  onState: handleState,
});

const input = new Input(canvas, {
  onPrimary: () => primary(),
  onPause: () => {
    if (game.state === "playing" || game.state === "paused") game.togglePause();
  },
  onMute: () => toggleMute(),
});
game.input = input;
game._persistBest = setBest;

function handleState(state, payload) {
  overlay.dataset.state = state === "playing" ? "playing" : state;
  if (state === "playing") return;

  const screen = screens[state] ?? screens.menu;
  els.eyebrow.textContent = screen.eyebrow;
  els.title.textContent = screen.title;
  els.desc.textContent = screen.desc;
  els.hint.textContent = screen.hint;
  els.action.textContent = screen.action;

  if (state === "dead" && payload) {
    els.result.hidden = false;
    els.result.textContent = `本局 ${payload.score} · 最佳 ${payload.best}`;
    els.live.textContent = `游戏结束，本局 ${payload.score} 分，最佳 ${payload.best} 分`;
    els.action.focus({ preventScroll: true });
  } else {
    els.result.hidden = true;
  }

  if (state === "paused") els.action.focus({ preventScroll: true });
}

function primary() {
  sound.unlock();
  if (game.state === "playing") return;
  if (game.state === "paused") {
    game.resume();
    return;
  }
  sound.click();
  game.best = Math.max(game.best, getBest());
  game.start();
}

els.action.addEventListener("click", (event) => {
  event.stopPropagation();
  primary();
});

els.sound.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleMute();
});

function toggleMute() {
  muted = !muted;
  sound.setMuted(muted);
  writeMuted(muted);
  renderSound();
  if (!muted) {
    sound.unlock();
    sound.click();
  }
}

function renderSound() {
  els.sound.setAttribute("aria-pressed", String(!muted));
  els.sound.textContent = muted ? "×" : "♪";
  els.sound.title = muted ? "开启声音" : "关闭声音";
}

function readMuted() {
  try {
    return localStorage.getItem("neon-dodge:muted") === "1";
  } catch {
    return false;
  }
}

function writeMuted(value) {
  try {
    localStorage.setItem("neon-dodge:muted", value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/* ---------- 尺寸与主循环 ---------- */

function resize() {
  game.resize(window.innerWidth, window.innerHeight);
}

window.addEventListener("resize", resize);
resize();

document.addEventListener("visibilitychange", () => {
  if (document.hidden) game.pause();
});

const STEP = 1 / 120;
let last = performance.now();
let accumulator = 0;

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  accumulator += dt;

  let steps = 0;
  while (accumulator >= STEP && steps < 8) {
    game.update(STEP);
    accumulator -= STEP;
    steps += 1;
  }
  if (steps === 8) accumulator = 0;

  game.render();
  requestAnimationFrame(frame);
}

game.best = getBest();
els.best.textContent = String(game.best);
handleState("menu");

if (auto) {
  // 演示 / 截图模式：自动开始，自动躲避
  setTimeout(() => {
    game.start();
  }, 300);
}

requestAnimationFrame(frame);

window.__game = game;
