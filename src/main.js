import { Game } from "./game.js";
import { Input } from "./input.js";
import { Sound } from "./audio.js";
import { Store } from "./storage.js";
import { getTier, isTier, TIER_ORDER } from "./difficulty.js";
import { dateKey } from "./daily.js";
import { summarize } from "./stats.js";
import { vibrate, HAPTICS } from "./haptics.js";

const $ = (id) => document.getElementById(id);

const canvas = $("game");
const overlay = $("overlay");
const els = {
  score: $("score"),
  best: $("best"),
  combo: $("combo"),
  comboValue: $("comboValue"),
  effects: $("effects"),
  mode: $("mode"),
  title: $("title"),
  desc: $("desc"),
  result: $("result"),
  board: $("board"),
  boardTabs: $("boardTabs"),
  action: $("action"),
  secondary: $("secondary"),
  share: $("share"),
  statsButton: $("statsButton"),
  menuButton: $("menuButton"),
  hint: $("hint"),
  eyebrow: $("eyebrow"),
  live: $("live"),
  sound: $("sound"),
  tierWrap: $("tierWrap"),
  tierPicker: $("tierPicker"),
  daily: $("daily"),
  dailyTitle: $("dailyTitle"),
  dailyMeta: $("dailyMeta"),
  dailyStatus: $("dailyStatus"),
  statsPanel: $("statsPanel"),
  statGames: $("statGames"),
  statBest: $("statBest"),
  statAvg: $("statAvg"),
  statPickup: $("statPickup"),
  statDaily: $("statDaily"),
  statStreak: $("statStreak"),
  statTiers: $("statTiers"),
  statBaseline: $("statBaseline"),
  statFirst: $("statFirst"),
  export: $("export"),
  tutorial: $("tutorial"),
  notice: $("notice"),
};

const params = new URLSearchParams(window.location.search);
const auto = params.get("auto") === "1";
const screenParam = params.get("screen");
const forcedSeed = Number.parseInt(params.get("seed") ?? "", 10);
const hasForcedSeed = Number.isFinite(forcedSeed) && forcedSeed >= 0;

const store = new Store();
store.recordVisit();

const sound = new Sound();
let muted = store.settings.muted;
sound.setMuted(muted);
renderSound();

let boardTab = store.settings.tier;
let lastRunMode = "free";
let lastDailyKey = dateKey();
let lastEntry = null;
let lastResult = null;
let lastRank = null;
let noticeTimer = null;

let tutorialVisible = false;
let tutorialStartX = 0;
let tutorialTimer = null;

const screens = {
  menu: {
    eyebrow: "CV-MALIN · NEON DODGE",
    title: "霓虹躲避",
    desc: "在坠落的光柱之间穿行。擦身而过，分数涨得更快。每天还有一局同样的挑战。",
    action: "开始游戏",
    hint: "← → / A D 移动 · 鼠标或手指拖动 · 空格开始 · P 暂停",
  },
  scores: {
    eyebrow: "LOCAL LEADERBOARD",
    title: "排行榜",
    desc: "每个档位独立 8 条，成绩只保存在这台设备上。",
    action: "开始游戏",
    hint: "Esc 返回主菜单",
  },
  stats: {
    eyebrow: "LOCAL STATS",
    title: "进步面板",
    desc: "零网络请求。数据只写本地，导出由你主动触发。",
    action: "开始游戏",
    hint: "Esc 返回主菜单",
  },
  paused: {
    eyebrow: "PAUSED",
    title: "暂停",
    desc: "喘口气。回来时障碍还在原地等你。",
    action: "继续",
    hint: "按 P、Esc 或空格继续",
  },
  dead: {
    eyebrow: "GAME OVER",
    title: "撞上了",
    desc: "再来一次，通常比上一局走得更远。",
    action: "再来一局",
    hint: "空格 / 点击按钮 立即重开 · Esc 回主菜单",
  },
};

const game = new Game({
  canvas,
  hud: els,
  input: null,
  sound,
  seed: hasForcedSeed ? forcedSeed : (Date.now() >>> 0) % 100000,
  auto,
  tier: store.settings.tier,
  onState: handleState,
  onPickup: (kind, tSec) => {
    if (!auto) store.recordPickup(kind, tSec);
  },
});

const input = new Input(canvas, {
  onPrimary: () => primary(),
  onPause: () => {
    if (game.state === "playing" || game.state === "paused") {
      game.togglePause();
      return;
    }
    if (overlay.dataset.state === "scores" || overlay.dataset.state === "stats" || overlay.dataset.state === "dead") {
      showMenu();
    }
  },
  onMute: () => toggleMute(),
});
game.input = input;

/* ---------- 状态机 ---------- */

function handleState(state, payload) {
  overlay.dataset.state = state === "playing" ? "playing" : state;
  if (els.effects && state !== "playing") els.effects.hidden = true;
  if (state !== "playing") hideTutorial(true);

  if (state === "playing") {
    hideTutorial(false);
    updateModeBadge();
    return;
  }

  if (state === "dead" && payload) prepareDead(payload);
  applyScreen(state);
}

function prepareDead(payload) {
  lastRunMode = payload.mode === "daily" ? "daily" : "free";
  lastDailyKey = payload.dateKey ?? dateKey();
  boardTab = lastRunMode === "daily" ? "daily" : getTier(payload.tier).id;

  let saved = null;
  if (!auto) {
    try {
      saved = store.endGame(payload);
    } catch {
      showNotice("成绩保存失败，本次数据只留在内存里。", 6000);
    }
  }

  lastEntry = saved?.entry ?? null;
  lastResult = payload;
  lastRank = saved?.rank ?? null;
  const rank = lastRank;
  const score = payload.score;
  const best = Math.max(payload.best ?? 0, score);

  els.result.textContent = "";
  const line = document.createElement("span");
  const sub = document.createElement("small");

  if (lastRunMode === "daily") {
    const place = rank ? `今日第 ${rank} 名` : "未进今日前 8";
    line.textContent = `今日挑战 ${score} 分 · ${place}`;
    sub.textContent = `今日最佳 ${Math.max(store.getDailyBest(lastDailyKey), score)} · 连胜 ${store.stats.daily.streak} 天 · 擦身 ${payload.nearMisses ?? 0} · 道具 ${payload.powerups ?? 0}`;
    screens.dead.eyebrow = "DAILY CHALLENGE";
    screens.dead.desc = "今天的挑战已经结算。明天换一个种子，再来。";
    screens.dead.action = "自由模式再来一局";
  } else {
    const place = rank ? `第 ${rank} 名` : "未进前 8";
    line.textContent = `本局 ${score} 分 · ${place}`;
    sub.textContent = `最佳 ${best} · 擦身 ${payload.nearMisses ?? 0} · 道具 ${payload.powerups ?? 0}`;
    screens.dead.eyebrow = "GAME OVER";
    screens.dead.desc = score >= best && score > 0
      ? "刷新了本档最佳。再来一局，看看能不能更高。"
      : "再来一次，通常比上一局走得更远。";
    screens.dead.action = "再来一局";
  }

  els.result.append(line, sub);
  els.result.hidden = false;
  els.live.textContent = `游戏结束，本局 ${score} 分${rank ? `，第 ${rank} 名` : ""}`;

  if (store.lastWriteFailed) showNotice("本地存储不可写，本次成绩只在内存里。", 6000);
}

function applyScreen(state) {
  const screen = screens[state] ?? screens.menu;

  els.eyebrow.textContent = screen.eyebrow;
  els.title.textContent = screen.title;
  els.desc.textContent = screen.desc;
  els.hint.textContent = screen.hint;
  els.action.textContent = screen.action;

  els.tierWrap.hidden = state !== "menu";
  els.daily.hidden = state !== "menu";
  els.statsPanel.hidden = state !== "stats";
  els.boardTabs.hidden = state !== "scores";

  const showBoard = state === "dead" || state === "scores";
  els.board.hidden = !showBoard;

  if (state === "menu") {
    renderTierPicker();
    renderDailyCard();
    els.best.textContent = String(store.getTierBest(store.settings.tier));
  }

  if (state === "scores") {
    renderBoardTabs();
    renderBoardForScreen();
    els.desc.textContent = boardTab === "daily"
      ? `今日榜 ${dateKey()} · 每天 1 次，只保存在这台设备。`
      : `${getTier(boardTab).label}档 · 只显示这一档的 8 条成绩。`;
  } else if (state === "dead") {
    renderBoardForScreen();
  } else {
    els.board.textContent = "";
  }

  if (state === "stats") renderStats();

  els.secondary.hidden = state === "paused";
  els.secondary.textContent = state === "menu" ? "排行榜" : state === "dead" ? "排行榜" : "返回主菜单";
  els.statsButton.hidden = state !== "menu";
  els.menuButton.hidden = state !== "dead";
  els.share.hidden = state !== "dead";
  els.export.hidden = state !== "stats";

  if (state === "dead") {
    els.result.hidden = false;
    els.action.focus({ preventScroll: true });
  } else {
    els.result.hidden = true;
  }

  if (state === "paused") els.action.focus({ preventScroll: true });

  if (!store.persistent && (state === "menu" || state === "stats")) {
    showNotice("浏览器未开放本地存储：成绩只在内存里，刷新后会丢失。", 0);
  }

  updateModeBadge();
}

/* ---------- 菜单辅助 ---------- */

function renderTierPicker() {
  for (const button of els.tierPicker.querySelectorAll("[data-tier]")) {
    button.setAttribute("aria-checked", String(button.dataset.tier === store.settings.tier));
  }
}

function renderDailyCard() {
  const state = store.getDailyState();
  els.daily.disabled = state.status !== "available";
  els.daily.classList.toggle("is-done", state.status === "finished");

  if (state.status === "available") {
    els.dailyTitle.textContent = "每日挑战";
    els.dailyMeta.textContent = `UTC+8 · 固定标准档 · 种子 ${state.seed.toString(16).slice(0, 6)}`;
    els.dailyStatus.textContent = "挑战";
    els.daily.setAttribute("aria-label", "开始今日挑战，每天仅一次，固定标准档");
  } else if (state.status === "started") {
    els.dailyTitle.textContent = "今日挑战已开始";
    els.dailyMeta.textContent = "刷新会消耗次数 · 明天再来";
    els.dailyStatus.textContent = "已锁定";
    els.daily.setAttribute("aria-label", "今日挑战已开始，不可重试");
  } else {
    els.dailyTitle.textContent = "今日挑战已完成";
    els.dailyMeta.textContent = `${state.score} 分 · 今日最佳 ${state.best} · ${state.rank ? `第 ${state.rank} 名` : "未进前 8"}`;
    els.dailyStatus.textContent = "已完成";
    els.daily.setAttribute("aria-label", `今日挑战已完成，${state.score} 分`);
  }
}

function formatFactor(factor) {
  return Number.isInteger(factor) ? factor.toFixed(1) : String(factor);
}

function updateModeBadge() {
  const tier = getTier(game.state === "playing" || game.state === "paused" ? game.tier : store.settings.tier);
  const daily = (game.state === "playing" || game.state === "paused") ? game.mode === "daily" : false;
  els.mode.textContent = daily
    ? `每日 · ${tier.label}`
    : `${tier.label} · ${formatFactor(tier.factor)}×`;
  els.mode.classList.toggle("is-daily", daily);
}

function renderBoardTabs() {
  for (const button of els.boardTabs.querySelectorAll("[data-board]")) {
    button.classList.toggle("is-active", button.dataset.board === boardTab);
    button.setAttribute("aria-pressed", String(button.dataset.board === boardTab));
  }
}

function renderBoardForScreen() {
  if (!els.board) return;
  if (boardTab === "daily") {
    const key = overlay.dataset.state === "dead" ? lastDailyKey : dateKey();
    const list = store.getBoard("daily", key);
    renderBoard(list, lastEntry, key === dateKey() ? "今日榜还空着。完成今天的挑战，就能留名。" : "这一天还没有记录。");
    return;
  }

  const tier = getTier(boardTab);
  const list = store.getBoard(tier.id);
  renderBoard(list, lastEntry, `${tier.label}档还没有成绩，先跑一局。`);
}

function renderBoard(list, highlight, emptyText) {
  els.board.textContent = "";
  if (!list.length) {
    const empty = document.createElement("li");
    empty.className = "is-empty";
    empty.textContent = emptyText;
    els.board.append(empty);
    return;
  }

  list.forEach((entry, index) => {
    const item = document.createElement("li");
    const isNew = highlight && entry.at === highlight.at && entry.score === highlight.score;
    if (isNew) item.className = "is-new";

    const rank = document.createElement("span");
    rank.className = "rank";
    rank.textContent = String(index + 1);

    const score = document.createElement("span");
    score.className = "score";
    score.textContent = String(entry.score);

    const when = document.createElement("span");
    when.className = "date";
    when.textContent = formatDate(entry.at);

    item.append(rank, score, when);
    els.board.append(item);
  });
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}/${day}`;
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, width, height, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function renderStats() {
  const summary = summarize(store.stats);
  els.statGames.textContent = String(summary.games);
  els.statBest.textContent = String(summary.best);
  els.statAvg.textContent = summary.games ? `${summary.avgSurvivalSec.toFixed(1)}s` : "0s";
  els.statPickup.textContent = summary.games ? `${summary.pickupRate.toFixed(2)}/局` : "0/局";
  els.statDaily.textContent = summary.dailyJoined ? `${Math.round(summary.challengeCompletion * 100)}%` : "—";
  els.statStreak.textContent = `${summary.dailyStreak} 天`;

  els.statTiers.textContent = summary.games
    ? `档位占比：${TIER_ORDER.map((id) => `${getTier(id).label} ${Math.round(summary.tierShare[id] * 100)}%`).join(" · ")}`
    : "档位占比：还没有自由模式记录。";

  els.statBaseline.textContent = `7 日基线：${summary.days7}/7 天有记录 · 挑战 ${summary.dailyCompleted}/${summary.dailyJoined} 局完成`;

  if (summary.firstGame) {
    els.statFirst.hidden = false;
    els.statFirst.textContent = `首局：${summary.firstGame.score} 分 · 擦身 ${summary.firstGame.nearMisses} · 道具 ${summary.firstGame.powerups} · ${Math.round(summary.firstGame.durationMs / 1000)}s`;
  } else {
    els.statFirst.hidden = true;
  }
}

/* ---------- 开局与页面切换 ---------- */

function startRun(mode = "free") {
  sound.unlock();
  sound.click();
  vibrate(HAPTICS.start);

  let start;
  if (mode === "daily") {
    start = store.startGame({ mode: "daily", tier: "standard" });
    if (!start.ok) {
      showNotice("今日挑战已经用掉了，明天再来。", 4000);
      renderDailyCard();
      return;
    }
  } else {
    const seed = hasForcedSeed ? forcedSeed : undefined;
    start = store.startGame({ mode: "free", tier: store.settings.tier, seed });
  }

  const best = auto
    ? 0
    : start.mode === "daily"
      ? store.getDailyBest(start.dateKey)
      : store.getTierBest(start.tier);

  game.start({
    tier: start.tier,
    mode: start.mode,
    seed: start.seed,
    dailyDateKey: start.dateKey,
    best,
  });

  updateModeBadge();
  maybeShowTutorial(start.mode);
}

function primary() {
  sound.unlock();
  if (game.state === "playing") return;
  if (game.state === "paused") {
    game.resume();
    return;
  }
  startRun("free");
}

function showMenu() {
  handleState("menu");
}

function openScores(kind) {
  boardTab = kind === "daily" ? "daily" : isTier(kind) ? kind : store.settings.tier;
  handleState("scores");
}

function openStats() {
  handleState("stats");
}

/* ---------- 首局引导 ---------- */

function maybeShowTutorial(mode) {
  hideTutorial(false);
  if (auto) return;
  if (store.settings.tutorialSeen || store.stats.games > 0) return;

  tutorialVisible = true;
  tutorialStartX = game.player.x;
  els.tutorial.hidden = false;
  clearTimeout(tutorialTimer);
  tutorialTimer = setTimeout(() => hideTutorial(true), 5000);
}

function hideTutorial(markSeen = true) {
  if (tutorialVisible && markSeen) store.markTutorialSeen();
  tutorialVisible = false;
  clearTimeout(tutorialTimer);
  els.tutorial.hidden = true;
}

/* ---------- 提示 ---------- */

function showNotice(message, timeout = 0) {
  clearTimeout(noticeTimer);
  els.notice.textContent = message;
  els.notice.hidden = false;
  if (timeout > 0) {
    noticeTimer = setTimeout(() => {
      els.notice.hidden = true;
    }, timeout);
  }
}

/* ---------- 事件绑定 ---------- */

for (const button of els.tierPicker.querySelectorAll("[data-tier]")) {
  button.addEventListener("click", () => {
    if (game.state === "playing" || game.state === "paused") return;
    store.selectTier(button.dataset.tier);
    renderTierPicker();
    els.best.textContent = String(store.getTierBest(store.settings.tier));
    updateModeBadge();
  });
}

els.daily.addEventListener("click", () => startRun("daily"));

els.action.addEventListener("click", (event) => {
  event.stopPropagation();
  primary();
});

els.secondary.addEventListener("click", (event) => {
  event.stopPropagation();
  if (overlay.dataset.state === "dead") openScores(lastRunMode);
  else if (overlay.dataset.state === "menu") openScores(store.settings.tier);
  else showMenu();
});

els.statsButton.addEventListener("click", (event) => {
  event.stopPropagation();
  openStats();
});

els.menuButton.addEventListener("click", (event) => {
  event.stopPropagation();
  showMenu();
});

els.boardTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-board]");
  if (!button) return;
  boardTab = button.dataset.board;
  renderBoardTabs();
  renderBoardForScreen();
  els.desc.textContent = boardTab === "daily"
    ? `今日榜 ${dateKey()} · 每天 1 次，只保存在这台设备。`
    : `${getTier(boardTab).label}档 · 只显示这一档的 8 条成绩。`;
});

els.share.addEventListener("click", (event) => {
  event.stopPropagation();
  downloadShareCard();
});

els.sound.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleMute();
});

function downloadShareCard() {
  const result = lastResult;
  if (!result) return;

  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1440;
  const ctx = canvas.getContext("2d");
  const tier = getTier(result.tier);
  const daily = result.mode === "daily";
  const font = '"PingFang SC", "Microsoft YaHei", "Segoe UI", system-ui, sans-serif';
  const mono = 'ui-monospace, Consolas, "Liberation Mono", monospace';

  // 背景与网格
  const bg = ctx.createLinearGradient(0, 0, 0, 1440);
  bg.addColorStop(0, "#05070d");
  bg.addColorStop(0.55, "#080d18");
  bg.addColorStop(1, "#0b1424");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1080, 1440);

  ctx.strokeStyle = "rgba(56, 189, 248, 0.07)";
  ctx.lineWidth = 1;
  for (let y = 80; y < 1440; y += 90) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1080, y);
    ctx.stroke();
  }
  for (let x = 0; x < 1080; x += 135) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 1440);
    ctx.stroke();
  }

  // 背景光斑与障碍剪影
  const glow = ctx.createRadialGradient(780, 260, 10, 780, 260, 420);
  glow.addColorStop(0, "rgba(56, 189, 248, 0.2)");
  glow.addColorStop(1, "rgba(56, 189, 248, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1080, 760);

  const bars = [
    { x: 42, y: 760, w: 52, h: 330, color: "#38bdf8" },
    { x: 992, y: 560, w: 44, h: 420, color: "#a78bfa" },
    { x: 78, y: 1040, w: 34, h: 250, color: "#f472b6" },
  ];
  for (const bar of bars) {
    ctx.fillStyle = `${bar.color}22`;
    ctx.strokeStyle = `${bar.color}88`;
    ctx.lineWidth = 3;
    roundedRect(ctx, bar.x, bar.y, bar.w, bar.h, 18);
    ctx.fill();
    ctx.stroke();
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // 抬头
  ctx.fillStyle = "#8b9bb4";
  ctx.font = `600 24px ${mono}`;
  ctx.fillText("C V - M A L I N   ·   N E O N   D O D G E", 540, 100);

  const title = ctx.createLinearGradient(240, 180, 840, 300);
  title.addColorStop(0, "#e8eef7");
  title.addColorStop(0.45, "#38bdf8");
  title.addColorStop(1, "#a78bfa");
  ctx.fillStyle = title;
  ctx.font = `700 96px ${font}`;
  ctx.shadowColor = "rgba(56, 189, 248, 0.45)";
  ctx.shadowBlur = 42;
  ctx.fillText("霓虹躲避", 540, 235);
  ctx.shadowBlur = 0;

  ctx.fillStyle = "#8b9bb4";
  ctx.font = `500 26px ${mono}`;
  ctx.fillText(daily ? "DAILY CHALLENGE" : "FREE RUN", 540, 330);

  // 分数
  ctx.fillStyle = "#8b9bb4";
  ctx.font = `600 28px ${mono}`;
  ctx.fillText("S C O R E", 540, 500);

  const scoreGradient = ctx.createLinearGradient(350, 560, 730, 820);
  scoreGradient.addColorStop(0, "#ffffff");
  scoreGradient.addColorStop(0.45, "#bae6fd");
  scoreGradient.addColorStop(1, "#38bdf8");
  ctx.fillStyle = scoreGradient;
  ctx.font = `700 260px ${mono}`;
  ctx.shadowColor = "rgba(56, 189, 248, 0.65)";
  ctx.shadowBlur = 70;
  ctx.fillText(String(result.score), 540, 690);
  ctx.shadowBlur = 0;

  // 名次与模式
  ctx.fillStyle = "#7ee787";
  ctx.font = `600 32px ${mono}`;
  const place = lastRank ? `RANK #${lastRank}` : "LOCAL RUN";
  ctx.fillText(place, 540, 870);

  ctx.fillStyle = "#8b9bb4";
  ctx.font = `500 24px ${mono}`;
  ctx.fillText(daily ? `${lastDailyKey} · ${tier.label}` : `${tier.label} · ${formatFactor(tier.factor)}×`, 540, 920);

  // 三项数据
  const stats = [
    { label: "NEAR MISS", value: String(result.nearMisses ?? 0) },
    { label: "POWERUPS", value: String(result.powerups ?? 0) },
    { label: "MAX COMBO", value: `×${result.maxCombo ?? 0}` },
  ];
  stats.forEach((item, index) => {
    const x = 210 + index * 330;
    ctx.strokeStyle = "rgba(139, 155, 180, 0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 110, 1010);
    ctx.lineTo(x + 110, 1010);
    ctx.stroke();

    ctx.fillStyle = "#e8eef7";
    ctx.font = `700 58px ${mono}`;
    ctx.fillText(item.value, x, 1085);

    ctx.fillStyle = "#8b9bb4";
    ctx.font = `500 18px ${mono}`;
    ctx.fillText(item.label, x, 1130);
  });

  // 每日挑战补充信息
  if (daily) {
    ctx.fillStyle = "#d8ccff";
    ctx.font = `500 22px ${mono}`;
    ctx.fillText(`今日最佳 ${Math.max(store.getDailyBest(lastDailyKey), result.score)} · 连胜 ${store.stats.daily.streak} 天`, 540, 1210);
  }

  // 页脚
  ctx.fillStyle = "#e8eef7";
  ctx.font = `600 26px ${mono}`;
  ctx.fillText("PLAY IT → cv-malin.github.io/neon-dodge", 540, 1300);

  ctx.fillStyle = "#8b9bb4";
  ctx.font = `500 20px ${mono}`;
  ctx.fillText("github.com/cv-malin  ·  zero dependencies", 540, 1342);

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `neon-dodge-${daily ? lastDailyKey : dateKey()}-${result.score}.png`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
    showNotice("1080×1440 成绩卡已保存。", 3000);
  }, "image/png");
}

els.export.addEventListener("click", (event) => {
  event.stopPropagation();
  const data = store.exportData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `neon-dodge-${dateKey()}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showNotice("已导出本地统计 JSON。", 3000);
});

function toggleMute() {
  muted = !muted;
  sound.setMuted(muted);
  store.setMuted(muted);
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

  if (tutorialVisible && game.state === "playing" && Math.abs(game.player.x - tutorialStartX) > 2) {
    hideTutorial(true);
  }

  game.render();
  requestAnimationFrame(frame);
}

/* ---------- 启动 ---------- */

game.best = store.getTierBest(store.settings.tier);
els.best.textContent = String(game.best);
handleState("menu");

if (screenParam === "scores") openScores("standard");
if (screenParam === "stats") openStats();

if (auto) {
  setTimeout(() => {
    game.start({
      tier: "standard",
      mode: "free",
      seed: hasForcedSeed ? forcedSeed : 12345,
      best: 0,
    });
    updateModeBadge();
  }, 300);
}

requestAnimationFrame(frame);

window.__game = game;
window.__store = store;
