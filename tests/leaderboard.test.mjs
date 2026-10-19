import test from "node:test";
import assert from "node:assert/strict";

import { insertScore, sanitizeScores, MAX_SCORES } from "../src/leaderboard.js";

const entry = (score, at) => ({ score, at });

test("空榜单插入后排名第一", () => {
  const { list, rank } = insertScore([], entry(120, 1));
  assert.equal(rank, 1);
  assert.equal(list.length, 1);
});

test("按分数降序排列", () => {
  const { list } = insertScore([entry(50, 1), entry(120, 2)], entry(80, 3));
  assert.deepEqual(list.map((e) => e.score), [120, 80, 50]);
});

test("同分时先创造的排前面", () => {
  const { list } = insertScore([entry(100, 20)], entry(100, 10));
  assert.deepEqual(list.map((e) => e.at), [10, 20]);
});

test("超出上限的成绩不入榜且排名为 null", () => {
  const full = Array.from({ length: MAX_SCORES }, (_, i) => entry(1000 - i * 10, i + 1));
  const { list, rank } = insertScore(full, entry(5, 999));
  assert.equal(rank, null, "没进榜应该返回 null");
  assert.equal(list.length, MAX_SCORES);
  assert.equal(list.at(-1).score, 1000 - (MAX_SCORES - 1) * 10);
});

test("刚好压线进榜", () => {
  const full = Array.from({ length: MAX_SCORES }, (_, i) => entry(1000 - i * 10, i + 1));
  const { rank } = insertScore(full, entry(1000 - (MAX_SCORES - 1) * 10 + 1, 50));
  assert.equal(rank, MAX_SCORES, "应该挤掉最后一名");
});

test("脏数据被过滤", () => {
  const clean = sanitizeScores([
    { score: 10, at: 1 },
    { score: "abc", at: 2 },
    { score: -5, at: 3 },
    null,
    { score: 20.7, at: 4 },
  ]);
  assert.deepEqual(clean, [
    { score: 10, at: 1 },
    { score: 20, at: 4 },
  ]);
});

test("非数组输入返回空榜", () => {
  assert.deepEqual(sanitizeScores(null), []);
  assert.deepEqual(sanitizeScores({ score: 1 }), []);
});
