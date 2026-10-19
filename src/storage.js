import { MAX_SCORES, insertScore, sanitizeScores } from "./leaderboard.js";

const BEST_KEY = "neon-dodge:best";
const SCORES_KEY = "neon-dodge:scores";

export function getBest() {
  try {
    const value = Number.parseInt(localStorage.getItem(BEST_KEY) ?? "0", 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

export function setBest(value) {
  try {
    localStorage.setItem(BEST_KEY, String(Math.floor(value)));
  } catch {
    /* 隐私模式下 localStorage 可能抛错，静默失败即可 */
  }
}

export function getScores() {
  try {
    const raw = JSON.parse(localStorage.getItem(SCORES_KEY) ?? "[]");
    return sanitizeScores(raw);
  } catch {
    return [];
  }
}

/**
 * 记录一局成绩，返回最新榜单与名次。
 * 名次为 null 表示没进前 MAX_SCORES。
 */
export function addScore(score, now = Date.now()) {
  const entry = { score: Math.floor(score), at: now };
  const { list, rank } = insertScore(getScores(), entry, MAX_SCORES);
  try {
    localStorage.setItem(SCORES_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
  return { list, rank, entry };
}
