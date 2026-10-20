import test from "node:test";
import assert from "node:assert/strict";

import {
  createStats,
  sanitizeStats,
  applyStart,
  applyGame,
  summarize,
  createEntry,
} from "../src/stats.js";

const T = (iso) => Date.parse(iso);
const DAY = "2026-10-20";
const AT = T("2026-10-20T02:00:00Z"); // UTC+8 10:00

function played({ tier = "standard", score = 100, mode = "free", dateKey = DAY } = {}) {
  let stats = applyStart(createStats(), { mode, tier, dateKey, seed: 1, at: AT });
  const result = applyGame(stats, {
    mode,
    tier,
    score,
    durationMs: 30000,
    powerups: 2,
    nearMisses: 3,
    maxCombo: 4,
    dateKey,
    at: AT + 1000,
  });
  return result.stats;
}

test("新统计从零开始", () => {
  const stats = createStats();
  assert.equal(stats.games, 0);
  assert.equal(stats.best, 0);
  assert.equal(stats.daily.joined, 0);
  assert.deepEqual(stats.boards.casual, []);
});

test("一局自由模式聚合总局数、分数、存活与拾取", () => {
  const stats = played();
  assert.equal(stats.games, 1);
  assert.equal(stats.freeGames, 1);
  assert.equal(stats.best, 100);
  assert.equal(stats.durationMs, 30000);
  assert.equal(stats.powerups, 2);
  assert.equal(stats.nearMisses, 3);
  assert.equal(stats.maxCombo, 4);
  assert.equal(stats.tierPlays.standard, 1);
  assert.equal(stats.days[DAY].games, 1);
});

test("分档榜单互相隔离", () => {
  let stats = createStats();
  for (const [tier, score] of [["casual", 10], ["casual", 30], ["hardcore", 90]]) {
    stats = applyStart(stats, { mode: "free", tier, dateKey: DAY, at: AT });
    stats = applyGame(stats, {
      mode: "free",
      tier,
      score,
      durationMs: 1000,
      powerups: 0,
      nearMisses: 0,
      maxCombo: 0,
      at: AT,
    }).stats;
  }
  assert.deepEqual(stats.boards.casual.map((e) => e.score), [30, 10]);
  assert.deepEqual(stats.boards.hardcore.map((e) => e.score), [90]);
  assert.deepEqual(stats.boards.standard.map((e) => e.score), []);
});

test("每日挑战单独计数并记录连胜", () => {
  let stats = applyStart(createStats(), { mode: "daily", tier: "standard", dateKey: DAY, seed: 7, at: AT });
  assert.equal(stats.daily.joined, 1);
  assert.equal(stats.daily.attempts[DAY].finished, false);

  stats = applyGame(stats, {
    mode: "daily",
    tier: "standard",
    score: 77,
    durationMs: 21000,
    powerups: 1,
    nearMisses: 2,
    maxCombo: 2,
    dateKey: DAY,
    at: AT + 21000,
  }).stats;

  assert.equal(stats.daily.completed, 1);
  assert.equal(stats.daily.streak, 1);
  assert.equal(stats.daily.lastDate, DAY);
  assert.equal(stats.daily.attempts[DAY].finished, true);
  assert.equal(stats.daily.attempts[DAY].score, 77);
  assert.deepEqual(stats.boards.daily[DAY].map((e) => e.score), [77]);
  assert.equal(stats.tierPlays.standard, 0, "挑战不计入档位占比");
});

test("每日挑战重复结算不会重复计数", () => {
  let stats = played({ mode: "daily", score: 50 });
  const before = stats.daily.completed;
  const again = applyGame(stats, {
    mode: "daily",
    tier: "standard",
    score: 99,
    durationMs: 1000,
    powerups: 0,
    nearMisses: 0,
    maxCombo: 0,
    dateKey: DAY,
    at: AT + 5000,
  }).stats;
  assert.equal(again.daily.completed, before, "同一天只结算一次");
  assert.equal(again.daily.streak, 1);
});

test("第一局快照只记录一次", () => {
  let stats = played({ score: 42 });
  const first = stats.firstGame;
  assert.equal(first.score, 42);
  assert.equal(first.nearMisses, 3);

  stats = applyStart(stats, { mode: "free", tier: "standard", dateKey: DAY, at: AT });
  stats = applyGame(stats, {
    mode: "free",
    tier: "standard",
    score: 900,
    durationMs: 1000,
    powerups: 9,
    nearMisses: 9,
    maxCombo: 9,
    at: AT,
  }).stats;
  assert.deepEqual(stats.firstGame, first, "首局快照不能被后续成绩覆盖");
  assert.equal(stats.best, 900);
});

test("汇总指标包含存活、拾取、档位占比与挑战完成率", () => {
  let stats = played({ tier: "casual", score: 10 });
  stats = applyStart(stats, { mode: "daily", tier: "standard", dateKey: DAY, at: AT });
  stats = applyGame(stats, {
    mode: "daily",
    tier: "standard",
    score: 20,
    durationMs: 15000,
    powerups: 1,
    nearMisses: 1,
    maxCombo: 1,
    dateKey: DAY,
    at: AT,
  }).stats;

  const summary = summarize(stats, AT);
  assert.equal(summary.games, 2);
  assert.equal(summary.best, 20);
  assert.equal(summary.avgSurvivalSec, 22.5);
  assert.equal(summary.pickupRate, 1.5);
  assert.equal(summary.tierShare.casual, 1);
  assert.equal(summary.tierShare.standard, 0);
  assert.equal(summary.challengeCompletion, 1);
  assert.equal(summary.dailyStreak, 1);
  assert.equal(summary.days7, 1);
});

test("挑战完成率按参与次数计算", () => {
  let stats = applyStart(createStats(), { mode: "daily", tier: "standard", dateKey: DAY, at: AT });
  stats = applyStart(stats, { mode: "daily", tier: "standard", dateKey: "2026-10-19", at: AT - 86400000 });
  stats = applyGame(stats, {
    mode: "daily",
    tier: "standard",
    score: 10,
    durationMs: 1000,
    powerups: 0,
    nearMisses: 0,
    maxCombo: 0,
    dateKey: DAY,
    at: AT,
  }).stats;
  assert.equal(stats.daily.joined, 2);
  assert.equal(stats.daily.completed, 1);
  assert.equal(summarize(stats, AT).challengeCompletion, 0.5);
});

test("榜单只保留 8 条且同分先到先得", () => {
  let stats = createStats();
  for (let i = 0; i < 10; i += 1) {
    stats = applyStart(stats, { mode: "free", tier: "standard", at: AT + i });
    stats = applyGame(stats, {
      mode: "free",
      tier: "standard",
      score: 100 + i,
      durationMs: 1000,
      powerups: 0,
      nearMisses: 0,
      maxCombo: 0,
      at: AT + i,
    }).stats;
  }
  assert.equal(stats.boards.standard.length, 8);
  assert.equal(stats.boards.standard[0].score, 109);
  assert.equal(stats.boards.standard.at(-1).score, 102);
});

test("成绩条目取整并保留时间", () => {
  const entry = createEntry(12.9, AT);
  assert.deepEqual(entry, { score: 12, at: AT });
});

test("脏统计数据被清洗而不是崩溃", () => {
  const stats = sanitizeStats({
    games: "x",
    best: -1,
    boards: { casual: [{ score: 10, at: 1 }, { score: "bad" }] },
    daily: { joined: -3, streak: 999 },
  });
  assert.equal(stats.games, 0);
  assert.equal(stats.best, 10, "最高分从有效榜单回填");
  assert.equal(stats.boards.casual.length, 1);
  assert.equal(stats.daily.joined, 0);
  assert.equal(stats.daily.streak, 0);
});

test("非对象统计返回默认值", () => {
  assert.equal(sanitizeStats(null).games, 0);
  assert.equal(sanitizeStats("nope").best, 0);
});
