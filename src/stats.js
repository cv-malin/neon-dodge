/**
 * 聚合统计：纯函数，输入旧统计与一局结果，输出新统计。
 * 所有写入都由 storage.js 统一落盘。
 */

import { MAX_SCORES, insertScore, sanitizeScores } from "./leaderboard.js";
import { dateKey, daysBetween, nextStreak } from "./daily.js";
import { getTier, TIER_ORDER } from "./difficulty.js";

export function createStats() {
  return {
    schema: 1,
    games: 0,
    totalScore: 0,
    best: 0,
    durationMs: 0,
    powerups: 0,
    nearMisses: 0,
    maxCombo: 0,
    freeGames: 0,
    firstGame: null,
    firstGameStart: null,
    tierPlays: { casual: 0, standard: 0, hardcore: 0 },
    daily: {
      joined: 0,
      completed: 0,
      streak: 0,
      lastDate: null,
      attempts: {},
    },
    boards: {
      casual: [],
      standard: [],
      hardcore: [],
      daily: {},
    },
    days: {},
    updatedAt: 0,
  };
}

function cloneStats(stats) {
  return JSON.parse(JSON.stringify(stats));
}

function count(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.floor(number);
}

function ratio(value) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function sanitizeAttempts(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !value || typeof value !== "object") continue;
    out[key] = {
      started: Boolean(value.started),
      finished: Boolean(value.finished),
      at: Number.isFinite(value.at) ? value.at : 0,
      score: count(value.score),
      seed: Number.isFinite(value.seed) ? value.seed >>> 0 : 0,
    };
  }
  return out;
}

function sanitizeDays(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !value || typeof value !== "object") continue;
    out[key] = {
      games: count(value.games),
      durationMs: count(value.durationMs),
    };
  }
  return out;
}

export function sanitizeStats(raw) {
  const base = createStats();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;

  base.games = count(raw.games);
  base.totalScore = count(raw.totalScore);
  base.best = count(raw.best);
  base.durationMs = count(raw.durationMs);
  base.powerups = count(raw.powerups);
  base.nearMisses = count(raw.nearMisses);
  base.maxCombo = count(raw.maxCombo);
  base.freeGames = count(raw.freeGames);
  base.firstGameStart = Number.isFinite(raw.firstGameStart) ? raw.firstGameStart : null;
  base.updatedAt = Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0;

  if (raw.firstGame && typeof raw.firstGame === "object") {
    base.firstGame = {
      score: count(raw.firstGame.score),
      durationMs: count(raw.firstGame.durationMs),
      powerups: count(raw.firstGame.powerups),
      nearMisses: count(raw.firstGame.nearMisses),
      maxCombo: count(raw.firstGame.maxCombo),
      at: Number.isFinite(raw.firstGame.at) ? raw.firstGame.at : 0,
    };
  }

  for (const tier of TIER_ORDER) {
    base.tierPlays[tier] = count(raw.tierPlays?.[tier]);
    base.boards[tier] = sanitizeScores(raw.boards?.[tier]);
  }

  const daily = raw.daily && typeof raw.daily === "object" ? raw.daily : {};
  base.daily.joined = count(daily.joined);
  base.daily.completed = Math.min(count(daily.completed), base.daily.joined);
  base.daily.streak = Math.min(count(daily.streak), base.daily.joined);
  base.daily.lastDate = typeof daily.lastDate === "string" ? daily.lastDate : null;
  base.daily.attempts = sanitizeAttempts(daily.attempts);

  if (raw.boards?.daily && typeof raw.boards.daily === "object" && !Array.isArray(raw.boards.daily)) {
    for (const [key, value] of Object.entries(raw.boards.daily)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
      base.boards.daily[key] = sanitizeScores(value);
    }
  }

  base.days = sanitizeDays(raw.days);

  for (const tier of TIER_ORDER) {
    base.best = Math.max(base.best, base.boards[tier][0]?.score ?? 0);
  }
  for (const board of Object.values(base.boards.daily)) {
    base.best = Math.max(base.best, board[0]?.score ?? 0);
  }
  return base;
}

function pruneDays(days, today, keep = 31) {
  for (const key of Object.keys(days)) {
    const distance = daysBetween(key, today);
    if (!Number.isFinite(distance) || distance > keep) delete days[key];
  }
}

function pruneDailyBoards(boards, today, keep = 14) {
  for (const key of Object.keys(boards)) {
    const distance = daysBetween(key, today);
    if (!Number.isFinite(distance) || distance > keep) delete boards[key];
  }
}

function pruneAttempts(attempts, today, keep = 31) {
  for (const key of Object.keys(attempts)) {
    const distance = daysBetween(key, today);
    if (!Number.isFinite(distance) || distance > keep) delete attempts[key];
  }
}

export function createEntry(score, at) {
  return { score: Math.max(0, Math.floor(Number(score) || 0)), at };
}

/** 开局：每日挑战在这里消耗当天唯一一次机会。 */
export function applyStart(stats, { mode = "free", tier = "standard", dateKey: day, seed = 0, at = Date.now() } = {}) {
  const next = cloneStats(stats);
  const key = day ?? dateKey(at);
  if (mode === "daily" && !next.daily.attempts[key]) {
    next.daily.joined += 1;
    next.daily.attempts[key] = {
      started: true,
      finished: false,
      at,
      score: 0,
      seed: Number(seed) >>> 0,
    };
  }
  next.updatedAt = at;
  return next;
}

/**
 * 结算一局。返回新统计、榜单项与名次。
 * 每日挑战同一天只结算一次，重复调用不会重复计数。
 */
export function applyGame(
  stats,
  {
    mode = "free",
    tier = "standard",
    score = 0,
    durationMs = 0,
    powerups = 0,
    nearMisses = 0,
    maxCombo = 0,
    dateKey: day,
    at = Date.now(),
  } = {},
) {
  const next = cloneStats(stats);
  const key = day ?? dateKey(at);
  const entry = createEntry(score, at);
  const tierId = getTier(tier).id;
  const beforeGames = next.games;

  if (mode === "daily" && next.daily.attempts[key]?.finished) {
    return { stats: next, entry, rank: null, duplicate: true };
  }

  next.games += 1;
  next.totalScore += entry.score;
  next.best = Math.max(next.best, entry.score);
  next.durationMs += Math.max(0, Math.floor(Number(durationMs) || 0));
  next.powerups += count(powerups);
  next.nearMisses += count(nearMisses);
  next.maxCombo = Math.max(next.maxCombo, count(maxCombo));

  if (beforeGames === 0) {
    next.firstGame = {
      score: entry.score,
      durationMs: Math.max(0, Math.floor(Number(durationMs) || 0)),
      powerups: count(powerups),
      nearMisses: count(nearMisses),
      maxCombo: count(maxCombo),
      at,
    };
  }

  const dayStats = next.days[key] ?? { games: 0, durationMs: 0 };
  dayStats.games += 1;
  dayStats.durationMs += Math.max(0, Math.floor(Number(durationMs) || 0));
  next.days[key] = dayStats;

  let rank = null;
  if (mode === "daily") {
    const previous = next.daily.attempts[key];
    if (!previous) next.daily.joined += 1;
    next.daily.completed += 1;
    next.daily.streak = nextStreak(next.daily.streak, next.daily.lastDate, key);
    next.daily.lastDate = key;
    next.daily.attempts[key] = {
      started: true,
      finished: true,
      at,
      score: entry.score,
      seed: previous?.seed ?? 0,
    };

    const board = insertScore(next.boards.daily[key] ?? [], entry, MAX_SCORES);
    next.boards.daily[key] = board.list;
    rank = board.rank;
  } else {
    next.freeGames += 1;
    next.tierPlays[tierId] += 1;
    const board = insertScore(next.boards[tierId] ?? [], entry, MAX_SCORES);
    next.boards[tierId] = board.list;
    rank = board.rank;
  }

  next.updatedAt = at;
  pruneDays(next.days, key);
  pruneDailyBoards(next.boards.daily, key);
  pruneAttempts(next.daily.attempts, key);
  return { stats: next, entry, rank, duplicate: false };
}

/** 面板展示用的派生指标，全部由 stats 计算，不额外落盘。 */
export function summarize(stats, now = Date.now()) {
  const today = typeof now === "string" ? now : dateKey(now);
  const games = stats.games;
  const freeGames = stats.freeGames;
  const daily = stats.daily;

  const tierShare = {};
  for (const tier of TIER_ORDER) {
    tierShare[tier] = freeGames > 0 ? stats.tierPlays[tier] / freeGames : 0;
  }

  let days7 = 0;
  for (const [key, value] of Object.entries(stats.days)) {
    const distance = daysBetween(key, today);
    if (distance >= 0 && distance <= 6 && value.games > 0) days7 += 1;
  }

  return {
    games,
    best: stats.best,
    avgSurvivalSec: games > 0 ? stats.durationMs / games / 1000 : 0,
    pickupRate: games > 0 ? stats.powerups / games : 0,
    tierShare,
    challengeCompletion: daily.joined > 0 ? ratio(daily.completed / daily.joined) : 0,
    dailyStreak: daily.streak,
    dailyJoined: daily.joined,
    dailyCompleted: daily.completed,
    days7,
    days7Required: 7,
    firstGame: stats.firstGame,
    totalPowerups: stats.powerups,
    totalNearMisses: stats.nearMisses,
    maxCombo: stats.maxCombo,
  };
}
