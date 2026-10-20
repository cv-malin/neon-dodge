import test from "node:test";
import assert from "node:assert/strict";

import { Store, KEYS, createMemoryStorage } from "../src/storage.js";

const T = (iso) => Date.parse(iso);
const NOW = T("2026-10-20T02:00:00Z"); // UTC+8 10:00

function newStore(backend = createMemoryStorage(), now = () => NOW) {
  return new Store({ backend, now });
}

function play(store, { mode = "free", tier = "standard", score = 10, dateKey } = {}) {
  const start = store.startGame({ mode, tier, seed: 42 });
  assert.equal(start.ok, true);
  return store.endGame({
    mode,
    tier,
    dateKey: dateKey ?? start.dateKey,
    score,
    durationMs: 12000,
    powerups: 1,
    nearMisses: 2,
    maxCombo: 2,
  });
}

test("首次启动迁移旧版最高分、榜单与静音", () => {
  const backend = createMemoryStorage({
    "neon-dodge:best": "120",
    "neon-dodge:scores": JSON.stringify([{ score: 100, at: 1 }, { score: 80, at: 2 }]),
    "neon-dodge:muted": "1",
  });
  const store = newStore(backend);

  assert.equal(store.settings.muted, true);
  assert.equal(store.stats.best, 120);
  assert.deepEqual(store.stats.boards.standard.map((e) => e.score), [120, 100, 80]);
  assert.equal(store.meta.schema, 1);
  assert.equal(store.meta.migratedFrom, "1.1");
  assert.ok(backend.getItem("neon-dodge:best"), "旧键保留，方便回滚");
});

test("迁移幂等，不重复插入旧榜", () => {
  const backend = createMemoryStorage({
    "neon-dodge:best": "120",
    "neon-dodge:scores": JSON.stringify([{ score: 100, at: 1 }]),
  });
  newStore(backend);
  const second = newStore(backend);
  assert.deepEqual(second.stats.boards.standard.map((e) => e.score), [120, 100]);
  assert.equal(second.stats.games, 0);
});

test("旧榜最高分与旧 best 相同不重复建条目", () => {
  const backend = createMemoryStorage({
    "neon-dodge:best": "100",
    "neon-dodge:scores": JSON.stringify([{ score: 100, at: 1 }]),
  });
  const store = newStore(backend);
  assert.deepEqual(store.stats.boards.standard.map((e) => e.score), [100]);
});

test("每日挑战每期只能开始一次，刷新后仍锁定", () => {
  const backend = createMemoryStorage();
  const store = newStore(backend);

  const first = store.startGame({ mode: "daily", tier: "standard", seed: 7 });
  assert.equal(first.ok, true);
  assert.equal(first.dateKey, "2026-10-20");
  assert.equal(store.getDailyState().status, "started");
  assert.equal(store.startGame({ mode: "daily", tier: "standard", seed: 7 }).ok, false);

  const result = store.endGame({
    mode: "daily",
    tier: "standard",
    dateKey: first.dateKey,
    score: 42,
    durationMs: 12000,
    powerups: 1,
    nearMisses: 2,
    maxCombo: 2,
  });
  assert.equal(result.rank, 1);
  assert.equal(store.getDailyState().status, "finished");
  assert.equal(store.getDailyState().score, 42);
  assert.equal(store.stats.daily.completed, 1);

  const reloaded = newStore(backend);
  assert.equal(reloaded.getDailyState().status, "finished");
  const blocked = reloaded.startGame({ mode: "daily", tier: "standard", seed: 7 });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, "used");
});

test("每日挑战刷新后未完成也消耗次数", () => {
  const backend = createMemoryStorage();
  newStore(backend).startGame({ mode: "daily", tier: "standard", seed: 7 });
  const reloaded = newStore(backend);
  assert.equal(reloaded.getDailyState().status, "started");
  assert.equal(reloaded.startGame({ mode: "daily", tier: "standard", seed: 7 }).ok, false);
});

test("自由模式按档位写入独立榜单并返回名次", () => {
  const store = newStore();
  const casual = play(store, { tier: "casual", score: 30 });
  assert.equal(casual.rank, 1);
  play(store, { tier: "hardcore", score: 90 });

  assert.deepEqual(store.getBoard("casual").map((e) => e.score), [30]);
  assert.deepEqual(store.getBoard("hardcore").map((e) => e.score), [90]);
  assert.deepEqual(store.getBoard("standard"), []);
  assert.equal(store.getTierBest("hardcore"), 90);
  assert.equal(store.stats.games, 2);
});

test("`?auto` 演示局不写入统计或榜单", () => {
  const store = newStore();
  store.startGame({ mode: "free", tier: "standard", seed: 1, tracked: false });
  assert.equal(store.stats.games, 0);
  const result = store.endGame({
    mode: "free",
    tier: "standard",
    score: 999,
    durationMs: 1000,
    powerups: 9,
    nearMisses: 9,
    maxCombo: 9,
    tracked: false,
  });
  assert.equal(result.tracked, false);
  assert.equal(store.stats.games, 0);
  assert.deepEqual(store.getBoard("standard"), []);
});

test("事件只保留最近 500 条", () => {
  const store = newStore();
  for (let i = 0; i < 520; i += 1) store.recordPickup("shield", i);
  assert.equal(store.events.length, 500);
  assert.equal(store.events[0].t_sec, 20);
  assert.equal(store.events.at(-1).t_sec, 519);
});

test("访问事件与次日回访事件", () => {
  let now = NOW;
  const backend = createMemoryStorage();
  const store = new Store({ backend, now: () => now });
  store.recordVisit();
  assert.equal(store.events.at(-1).type, "visit");
  assert.equal(store.events.at(-1).returning, false);

  now += 86400000;
  const nextDay = new Store({ backend, now: () => now });
  nextDay.recordVisit();
  const visit = nextDay.events.find((e) => e.type === "visit" && e.returning === true);
  assert.ok(visit);
  assert.equal(visit.days_since_last, 1);
  assert.ok(nextDay.events.some((e) => e.type === "next_day_return"));
});

test("首局开始事件只记录一次", () => {
  const store = newStore();
  play(store, { score: 10 });
  play(store, { score: 20 });
  const count = store.events.filter((e) => e.type === "first_game_start").length;
  assert.equal(count, 1);
});

test("30 秒内重开会记录 retry 事件", () => {
  let now = NOW;
  const store = new Store({ backend: createMemoryStorage(), now: () => now });
  play(store, { score: 10 });
  now += 12000;
  store.startGame({ mode: "free", tier: "standard", seed: 2 });
  const retry = store.events.find((e) => e.type === "retry");
  assert.ok(retry);
  assert.equal(retry.gap_ms, 12000);
});

test("切换档位写入设置并记录事件", () => {
  const store = newStore();
  store.selectTier("hardcore");
  assert.equal(store.settings.tier, "hardcore");
  const event = store.events.at(-1);
  assert.equal(event.type, "difficulty_select");
  assert.equal(event.from, "standard");
  assert.equal(event.to, "hardcore");
});

test("导出数据符合 schema 且包含事件", () => {
  const store = newStore();
  play(store);
  const data = store.exportData();
  assert.equal(data.schema, 1);
  assert.equal(data.stats.games, 1);
  assert.equal(data.settings.tier, "standard");
  assert.ok(Array.isArray(data.events));
  assert.ok(data.events.length > 0);
  assert.ok(data.meta.schema);
});

test("损坏的 v2 数据回退到默认值", () => {
  const backend = createMemoryStorage({
    [KEYS.meta]: JSON.stringify({ schema: 1, migratedFrom: null }),
    [KEYS.stats]: "{bad json",
    [KEYS.settings]: JSON.stringify({ tier: "nope" }),
    [KEYS.events]: "not-array",
  });
  const store = newStore(backend);
  assert.equal(store.stats.games, 0);
  assert.equal(store.settings.tier, "standard");
  assert.deepEqual(store.events, []);
});

test("localStorage 写满时降级为内存态但游戏仍可结算", () => {
  const backend = {
    getItem: () => null,
    setItem: () => {
      throw new Error("quota");
    },
    removeItem: () => {},
  };
  const store = new Store({ backend, now: () => NOW, persistent: true });
  assert.equal(store.persistent, false);
  const result = play(store, { score: 55 });
  assert.equal(result.tracked, true);
  assert.equal(store.stats.games, 1);
});

test("每日榜单按日期隔离", () => {
  const store = newStore();
  play(store, { mode: "daily", score: 10 });
  assert.deepEqual(store.getBoard("daily", "2026-10-20").map((e) => e.score), [10]);
  assert.deepEqual(store.getBoard("daily", "2026-10-19"), []);
});
