/**
 * v2 本地存储。
 *
 * 四个键：
 *   nd:v2:meta      schema 与迁移信息
 *   nd:v2:settings  档位、静音、引导
 *   nd:v2:stats     聚合指标、分档榜单、每日状态
 *   nd:v2:events    环形缓冲（≤ 500）
 *
 * 旧版键（neon-dodge:*）只读迁移、不删除，方便回滚。
 * 所有解析都带 try/catch；storage 写满时降级为内存态。
 */

import {
  createStats,
  sanitizeStats,
  applyStart,
  applyGame,
  summarize,
  createEntry,
} from "./stats.js";
import { appendEvent, sanitizeEvents } from "./events.js";
import { dateKey, daysBetween, seedFromDateKey } from "./daily.js";
import { getTier, isTier, DEFAULT_TIER } from "./difficulty.js";
import { insertScore, sanitizeScores, MAX_SCORES } from "./leaderboard.js";

export const KEYS = Object.freeze({
  meta: "nd:v2:meta",
  settings: "nd:v2:settings",
  stats: "nd:v2:stats",
  events: "nd:v2:events",
});

const LEGACY = Object.freeze({
  best: "neon-dodge:best",
  scores: "neon-dodge:scores",
  muted: "neon-dodge:muted",
});

export const SCHEMA_VERSION = 1;

export function createSettings() {
  return {
    schema: 1,
    tier: DEFAULT_TIER,
    muted: false,
    volume: 0.7,
    tutorialSeen: false,
  };
}

export function sanitizeSettings(raw) {
  const base = createSettings();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  if (isTier(raw.tier)) base.tier = raw.tier;
  base.muted = Boolean(raw.muted);
  base.tutorialSeen = Boolean(raw.tutorialSeen);
  if (Number.isFinite(raw.volume)) base.volume = Math.min(1, Math.max(0, raw.volume));
  return base;
}

/** 最小 localStorage 替身，测试与隐私模式都能用。 */
export function createMemoryStorage(initial = {}) {
  const map = new Map();
  for (const [key, value] of Object.entries(initial)) map.set(key, String(value));

  return {
    get length() {
      return map.size;
    },
    key(index) {
      return [...map.keys()][index] ?? null;
    },
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
    clear() {
      map.clear();
    },
    _map: map,
  };
}

function detectBackend() {
  try {
    if (typeof localStorage === "undefined") throw new Error("no localStorage");
    const probe = "nd:v2:probe";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return { backend: localStorage, persistent: true };
  } catch {
    return { backend: createMemoryStorage(), persistent: false };
  }
}

function randomSeed() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      const buffer = new Uint32Array(1);
      crypto.getRandomValues(buffer);
      return buffer[0] >>> 0;
    }
  } catch {
    /* ignore */
  }
  return (Math.random() * 0x100000000) >>> 0;
}

function sessionId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export class Store {
  constructor({ backend, now = Date.now, persistent } = {}) {
    const detected = backend ? { backend, persistent: persistent ?? true } : detectBackend();
    this.backend = detected.backend;
    this.persistent = detected.persistent;
    this.now = now;
    this.sessionId = sessionId();
    this._pendingRun = null;
    this._lastEndAt = null;
    this.lastWriteFailed = false;

    this.meta = null;
    this.settings = createSettings();
    this.stats = createStats();
    this.events = [];

    this._load();
  }

  /* ---------- 读取与迁移 ---------- */

  _read(key, fallback = null) {
    try {
      const raw = this.backend.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  _write(key, value) {
    try {
      this.backend.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      this.persistent = false;
      this.lastWriteFailed = true;
      return false;
    }
  }

  _saveAll() {
    this._write(KEYS.meta, this.meta);
    this._write(KEYS.settings, this.settings);
    this._write(KEYS.stats, this.stats);
    this._write(KEYS.events, this.events);
  }

  _load() {
    this.meta = this._read(KEYS.meta, null);
    this.settings = sanitizeSettings(this._read(KEYS.settings, null));
    this.stats = sanitizeStats(this._read(KEYS.stats, null));
    this.events = sanitizeEvents(this._read(KEYS.events, null));

    if (!this.meta || typeof this.meta !== "object" || Array.isArray(this.meta)) {
      this._migrateLegacy();
      return;
    }

    this.meta.schema = SCHEMA_VERSION;
    if (!Number.isFinite(this.meta.lastVisit)) this.meta.lastVisit = null;
    this.meta.visits = Number.isFinite(this.meta.visits) ? this.meta.visits : 0;
    this._saveAll();
  }

  _migrateLegacy() {
    const now = this.now();
    let oldBest = 0;
    let oldMuted = false;
    try {
      const rawBest = this.backend.getItem(LEGACY.best);
      if (rawBest != null) oldBest = Number.parseInt(rawBest, 10);
      oldMuted = this.backend.getItem(LEGACY.muted) === "1";
    } catch {
      /* localStorage 读取失败时按空档处理 */
    }
    const oldScores = sanitizeScores(this._read(LEGACY.scores, []));
    const hasLegacy = (Number.isFinite(oldBest) && oldBest > 0) || oldScores.length > 0 || oldMuted;

    this.stats = createStats();
    this.settings = createSettings();
    this.events = [];

    if (oldScores.length > 0) {
      this.stats.boards.standard = oldScores;
    }

    const best = Math.max(Number.isFinite(oldBest) ? oldBest : 0, oldScores[0]?.score ?? 0);
    this.stats.best = best;
    if (best > (oldScores[0]?.score ?? 0)) {
      const { list } = insertScore(this.stats.boards.standard, createEntry(best, now), MAX_SCORES);
      this.stats.boards.standard = list;
    }

    this.settings.muted = oldMuted;
    this.meta = {
      schema: SCHEMA_VERSION,
      migratedFrom: hasLegacy ? "1.1" : null,
      at: now,
      lastVisit: null,
      visits: 0,
    };
    this._saveAll();
  }

  /* ---------- 访客与设置 ---------- */

  recordVisit() {
    const now = this.now();
    const today = dateKey(now);
    const last = this.meta.lastVisit;
    let returning = false;
    let daysSince = null;

    if (last) {
      returning = true;
      daysSince = daysBetween(dateKey(last), today);
      this._appendEvent("visit", { returning, days_since_last: daysSince }, now);
      if (Number.isFinite(daysSince) && daysSince >= 1) {
        this._appendEvent("next_day_return", { date_key: today, days_since_last: daysSince }, now);
      }
    } else {
      this._appendEvent("visit", { returning: false, days_since_last: null }, now);
    }

    this.meta.lastVisit = now;
    this.meta.visits += 1;
    this._write(KEYS.meta, this.meta);
    this._write(KEYS.events, this.events);
    return { returning, daysSince, dateKey: today };
  }

  selectTier(tier) {
    if (!isTier(tier) || tier === this.settings.tier) return this.settings.tier;
    const from = this.settings.tier;
    this.settings.tier = tier;
    this._appendEvent("difficulty_select", { from, to: tier }, this.now());
    this._write(KEYS.settings, this.settings);
    this._write(KEYS.events, this.events);
    return tier;
  }

  setMuted(muted) {
    this.settings.muted = Boolean(muted);
    this._write(KEYS.settings, this.settings);
    return this.settings.muted;
  }

  markTutorialSeen() {
    if (this.settings.tutorialSeen) return;
    this.settings.tutorialSeen = true;
    this._write(KEYS.settings, this.settings);
  }

  /* ---------- 每日挑战 ---------- */

  getDailyState(now = this.now()) {
    const key = dateKey(now);
    const attempt = this.stats.daily.attempts[key];
    const board = this.stats.boards.daily[key] ?? [];
    const best = board[0]?.score ?? 0;
    const seed = seedFromDateKey(key);

    if (!attempt) {
      return {
        status: "available",
        dateKey: key,
        seed,
        best,
        streak: this.stats.daily.streak,
      };
    }

    if (!attempt.finished) {
      return {
        status: "started",
        dateKey: key,
        seed: attempt.seed || seed,
        best,
        streak: this.stats.daily.streak,
      };
    }

    const rankIndex = board.findIndex((entry) => entry.score === attempt.score && entry.at === attempt.at);
    return {
      status: "finished",
      dateKey: key,
      seed: attempt.seed || seed,
      best,
      score: attempt.score,
      at: attempt.at,
      rank: rankIndex === -1 ? null : rankIndex + 1,
      streak: this.stats.daily.streak,
    };
  }

  /* ---------- 一局的生命周期 ---------- */

  startGame({ mode = "free", tier = DEFAULT_TIER, seed, now = this.now(), tracked = true } = {}) {
    const key = dateKey(now);
    if (!tracked) {
      return {
        ok: true,
        tracked: false,
        mode,
        tier: getTier(tier).id,
        dateKey: key,
        seed: Number.isFinite(seed) ? seed >>> 0 : randomSeed(),
      };
    }

    const runMode = mode === "daily" ? "daily" : "free";
    const tierId = getTier(tier).id;
    if (runMode === "daily") {
      const state = this.getDailyState(now);
      if (state.status !== "available") {
        return { ok: false, reason: "used", state };
      }
    }

    const runSeed = runMode === "daily" ? seedFromDateKey(key) : Number.isFinite(seed) ? seed >>> 0 : randomSeed();

    if (runMode === "free" && this._lastEndAt && now - this._lastEndAt <= 30000) {
      this._appendEvent("retry", { gap_ms: now - this._lastEndAt }, now);
    }

    this.stats = applyStart(this.stats, {
      mode: runMode,
      tier: tierId,
      dateKey: key,
      seed: runSeed,
      at: now,
    });

    if (this.stats.games === 0 && !this.stats.firstGameStart) {
      this.stats.firstGameStart = now;
      this._appendEvent("first_game_start", { session_id: this.sessionId }, now);
    }

    this._appendEvent(
      "game_start",
      { mode: runMode, difficulty: tierId, seed: runSeed },
      now,
    );
    if (runMode === "daily") {
      this._appendEvent("daily_join", { date_key: key, seed: runSeed }, now);
    }

    this._pendingRun = {
      mode: runMode,
      tier: tierId,
      dateKey: key,
      seed: runSeed,
      startedAt: now,
      tracked: true,
    };

    this._write(KEYS.stats, this.stats);
    this._write(KEYS.events, this.events);
    return {
      ok: true,
      tracked: true,
      mode: runMode,
      tier: tierId,
      dateKey: key,
      seed: runSeed,
    };
  }

  endGame(result = {}) {
    const pending = this._pendingRun;
    if (pending?.tracked === false || result.tracked === false) {
      return { tracked: false, rank: null, stats: this.stats };
    }

    const now = result.at ?? this.now();
    const mode = result.mode ?? pending?.mode ?? "free";
    const tier = result.tier ?? pending?.tier ?? DEFAULT_TIER;
    const key = result.dateKey ?? pending?.dateKey ?? dateKey(now);

    const applied = applyGame(this.stats, {
      mode,
      tier,
      score: result.score ?? 0,
      durationMs: result.durationMs ?? result.duration_ms ?? 0,
      powerups: result.powerups ?? 0,
      nearMisses: result.nearMisses ?? result.near_misses ?? 0,
      maxCombo: result.maxCombo ?? result.max_combo ?? 0,
      dateKey: key,
      at: now,
    });

    this.stats = applied.stats;
    this._lastEndAt = now;
    this._pendingRun = null;

    if (!applied.duplicate) {
      this._appendEvent(
        "game_end",
        {
          duration_ms: Math.max(0, Math.floor(Number(result.durationMs) || 0)),
          score: applied.entry.score,
          powerups: Math.max(0, Math.floor(Number(result.powerups) || 0)),
          near_misses: Math.max(0, Math.floor(Number(result.nearMisses) || 0)),
          max_combo: Math.max(0, Math.floor(Number(result.maxCombo) || 0)),
          mode,
          difficulty: tier,
        },
        now,
      );
      if (mode === "daily") {
        this._appendEvent(
          "daily_finish",
          { date_key: key, score: applied.entry.score, completed: true },
          now,
        );
      }
    }

    this._write(KEYS.stats, this.stats);
    this._write(KEYS.events, this.events);

    return {
      tracked: true,
      ...applied,
      mode,
      tier,
      dateKey: key,
      stats: this.stats,
    };
  }

  recordPickup(kind, tSec) {
    this._appendEvent(
      "powerup_pick",
      { kind, t_sec: Math.max(0, Number(tSec) || 0) },
      this.now(),
    );
    this._write(KEYS.events, this.events);
  }

  /* ---------- 查询与导出 ---------- */

  getBoard(kind, key) {
    if (kind === "daily") return [...(this.stats.boards.daily[key] ?? [])];
    if (!isTier(kind)) return [];
    return [...this.stats.boards[kind]];
  }

  getTierBest(tier) {
    const board = this.stats.boards[getTier(tier).id] ?? [];
    return board[0]?.score ?? 0;
  }

  getDailyBest(key = dateKey(this.now())) {
    return this.stats.boards.daily[key]?.[0]?.score ?? 0;
  }

  exportData() {
    const now = this.now();
    return {
      schema: SCHEMA_VERSION,
      generated_at: now,
      meta: { ...this.meta },
      settings: { ...this.settings },
      stats: JSON.parse(JSON.stringify(this.stats)),
      summary: summarize(this.stats, now),
      events: [...this.events],
    };
  }

  _appendEvent(type, payload, ts) {
    this.events = appendEvent(this.events, type, payload, ts);
  }
}
