import test from "node:test";
import assert from "node:assert/strict";

import { difficultyAt } from "../src/logic.js";
import {
  applyTier,
  getTier,
  isTier,
  TIER_ORDER,
  TIERS,
  DEFAULT_TIER,
} from "../src/difficulty.js";

test("档位系数缩放障碍初速", () => {
  const start = difficultyAt(0);
  assert.ok(Math.abs(applyTier(start, "casual").speed - 0.44) < 1e-9);
  assert.equal(applyTier(start, "standard").speed, 0.55);
  assert.ok(Math.abs(applyTier(start, "hardcore").speed - 0.6875) < 1e-9);
});

test("档位系数同时缩放加速度上限", () => {
  const capped = difficultyAt(150);
  assert.ok(Math.abs(applyTier(capped, "casual").speed - 1.12) < 1e-9);
  assert.equal(applyTier(capped, "standard").speed, 1.4);
  assert.equal(applyTier(capped, "hardcore").speed, 1.75);
});

test("未知档位回退到标准档", () => {
  const diff = difficultyAt(0);
  assert.equal(applyTier(diff, "nightmare").speed, diff.speed);
  assert.equal(getTier("nightmare").id, DEFAULT_TIER);
  assert.equal(isTier("nightmare"), false);
  assert.equal(isTier("casual"), true);
});

test("档位顺序与磁吸配置稳定", () => {
  assert.deepEqual(TIER_ORDER, ["casual", "standard", "hardcore"]);
  assert.equal(TIERS.casual.factor, 0.8);
  assert.equal(TIERS.standard.factor, 1);
  assert.equal(TIERS.hardcore.factor, 1.25);
  assert.equal(TIERS.casual.magnet, true);
  assert.equal(TIERS.standard.magnet, true);
  assert.equal(TIERS.hardcore.magnet, false);
});

test("档位不改变障碍生成概率", () => {
  const base = difficultyAt(75);
  const scaled = applyTier(base, "hardcore");
  assert.equal(scaled.zigChance, base.zigChance);
  assert.equal(scaled.gateChance, base.gateChance);
  assert.equal(scaled.t, base.t);
});
