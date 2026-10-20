import test from "node:test";
import assert from "node:assert/strict";

import {
  createEffects,
  applyPowerup,
  stepEffects,
  scoreMultiplier,
  timeScale,
  pickPowerupKind,
  nextPickupDelay,
  SLOW_FACTOR,
  POWERUP_KINDS,
} from "../src/powerups.js";

test("初始状态没有任何效果", () => {
  const effects = createEffects();
  assert.equal(effects.shield, false);
  assert.equal(effects.slow, 0);
  assert.equal(effects.double, 0);
  assert.equal(scoreMultiplier(effects), 1);
  assert.equal(timeScale(effects), 1);
});

test("拾取护盾", () => {
  const effects = applyPowerup(createEffects(), "shield");
  assert.equal(effects.shield, true);
  assert.equal(scoreMultiplier(effects), 1, "护盾不影响分数");
});

test("减速生效并改变时间尺度", () => {
  const effects = applyPowerup(createEffects(), "slow");
  assert.equal(effects.slow, 5);
  assert.equal(timeScale(effects), SLOW_FACTOR);
  assert.ok(SLOW_FACTOR < 1);
});

test("双倍分数生效", () => {
  const effects = applyPowerup(createEffects(), "double");
  assert.equal(scoreMultiplier(effects), 2);
});

test("同类道具刷新而不是叠加", () => {
  const effects = createEffects();
  applyPowerup(effects, "double");
  effects.double = 1.2;
  applyPowerup(effects, "double");
  assert.equal(effects.double, 6, "应该刷新回完整时长，不能无限叠加");
});

test("计时器递减并在归零时报告过期", () => {
  const effects = applyPowerup(createEffects(), "slow");
  const expired = stepEffects(effects, 2);
  assert.equal(effects.slow, 3);
  assert.deepEqual(expired, []);

  const expired2 = stepEffects(effects, 3.5);
  assert.equal(effects.slow, 0);
  assert.deepEqual(expired2, ["slow"]);
});

test("无敌帧独立计时", () => {
  const effects = createEffects();
  effects.invincible = 0.5;
  const expired = stepEffects(effects, 0.6);
  assert.equal(effects.invincible, 0);
  assert.deepEqual(expired, ["invincible"]);
});

test("道具种类按权重抽取", () => {
  assert.equal(pickPowerupKind(() => 0), "shield");
  assert.equal(pickPowerupKind(() => 0.5), "slow");
  assert.equal(pickPowerupKind(() => 0.9), "double");
  assert.equal(pickPowerupKind(() => 0.999), "double");
});

test("道具间隔在合理区间", () => {
  assert.equal(nextPickupDelay(() => 0), 7);
  assert.equal(nextPickupDelay(() => 1), 12);
  for (let i = 0; i < 50; i += 1) {
    const delay = nextPickupDelay(() => i / 50);
    assert.ok(delay >= 7 && delay <= 12);
  }
});

test("所有道具都有元数据", () => {
  for (const kind of POWERUP_KINDS) {
    const effects = applyPowerup(createEffects(), kind);
    assert.ok(effects.shield || effects.slow > 0 || effects.double > 0, kind);
  }
});
