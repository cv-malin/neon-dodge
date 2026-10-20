import test from "node:test";
import assert from "node:assert/strict";

import {
  dateKey,
  previousDateKey,
  seedFromDateKey,
  nextStreak,
  daysBetween,
  isYesterday,
} from "../src/daily.js";

test("日期按 UTC+8 切分", () => {
  assert.equal(dateKey(Date.parse("2026-10-20T15:59:59Z")), "2026-10-20");
  assert.equal(dateKey(Date.parse("2026-10-20T16:00:00Z")), "2026-10-21");
  assert.equal(dateKey(Date.parse("2026-10-19T16:00:00Z")), "2026-10-20");
});

test("日期 seed 稳定且跨日期不同", () => {
  const a = seedFromDateKey("2026-10-20");
  const b = seedFromDateKey("2026-10-20");
  const c = seedFromDateKey("2026-10-21");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.ok(Number.isInteger(a) && a > 0, "seed 必须是正 32 位整数");
  assert.ok(a <= 0xffffffff);
});

test("日期 seed 不受本地时区影响", () => {
  const original = process.env.TZ;
  try {
    process.env.TZ = "America/Los_Angeles";
    assert.equal(dateKey(Date.parse("2026-10-20T16:00:00Z")), "2026-10-21");
    assert.equal(seedFromDateKey("2026-10-20"), seedFromDateKey("2026-10-20"));
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

test("前一天的日期键可以跨月与跨年", () => {
  assert.equal(previousDateKey("2026-03-01"), "2026-02-28");
  assert.equal(previousDateKey("2024-03-01"), "2024-02-29");
  assert.equal(previousDateKey("2026-01-01"), "2025-12-31");
  assert.equal(previousDateKey("2026-10-20"), "2026-10-19");
});

test("日期差按自然日计算", () => {
  assert.equal(daysBetween("2026-10-20", "2026-10-20"), 0);
  assert.equal(daysBetween("2026-10-19", "2026-10-20"), 1);
  assert.equal(daysBetween("2026-09-30", "2026-10-20"), 20);
  assert.equal(isYesterday("2026-10-19", "2026-10-20"), true);
  assert.equal(isYesterday("2026-10-18", "2026-10-20"), false);
});

test("连胜在连续日期递增，断档重置", () => {
  assert.equal(nextStreak(0, null, "2026-10-20"), 1);
  assert.equal(nextStreak(3, "2026-10-19", "2026-10-20"), 4);
  assert.equal(nextStreak(3, "2026-10-20", "2026-10-20"), 3, "同一天不重复加");
  assert.equal(nextStreak(3, "2026-10-18", "2026-10-20"), 1, "断一天就重置");
});
