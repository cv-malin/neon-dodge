import test from "node:test";
import assert from "node:assert/strict";

import {
  clamp,
  circleRectCollide,
  horizontalGap,
  nearMissGap,
  difficultyAt,
  buildPattern,
  chooseSafeX,
} from "../src/logic.js";
import { mulberry32 } from "../src/rng.js";

const rect = (x, y, w, h) => ({ x, y, w, h });

test("clamp 边界", () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-5, 0, 10), 0);
  assert.equal(clamp(50, 0, 10), 10);
});

test("圆与矩形碰撞", () => {
  const r = rect(100, 100, 50, 50);
  assert.equal(circleRectCollide(125, 125, 10, r), true, "圆心在矩形内");
  assert.equal(circleRectCollide(95, 125, 6, r), true, "边缘相切");
  assert.equal(circleRectCollide(80, 125, 10, r), false, "水平方向离开");
  assert.equal(circleRectCollide(125, 60, 10, r), false, "垂直方向离开");
});

test("水平净距", () => {
  const r = rect(100, 0, 50, 50);
  assert.equal(horizontalGap(90, r), 10);
  assert.equal(horizontalGap(170, r), 20);
  assert.equal(horizontalGap(120, r), 0, "在矩形内部为 0");
});

test("擦身判定只看垂直交叠", () => {
  const r = rect(100, 100, 40, 20);
  assert.equal(nearMissGap(90, 60, 8, r), null, "垂直无交叠返回 null");
  const gap = nearMissGap(90, 110, 8, r);
  assert.equal(gap, 10);
});

test("难度随距离单调变化", () => {
  const a = difficultyAt(0);
  const b = difficultyAt(75);
  const c = difficultyAt(150);
  const d = difficultyAt(400);

  assert.ok(a.speed < b.speed && b.speed < c.speed);
  assert.ok(a.interval > b.interval && b.interval > c.interval);
  assert.equal(c.t, 1);
  assert.equal(d.t, 1, "超过上限后封顶");
  assert.equal(d.speed, c.speed, "封顶后不再加速");
});

test("gate 形态永远留出可通行缺口", () => {
  const width = 960;
  const height = 540;
  const playerR = 12;
  const minGap = playerR * 4.2;

  for (let seed = 1; seed <= 300; seed += 1) {
    const rng = mulberry32(seed);
    const bars = buildPattern("gate", rng, { width, height, playerR });
    assert.ok(bars.length >= 1, `seed ${seed} 至少一根柱子`);

    const sorted = [...bars].sort((m, n) => m.x - n.x);
    let cursor = 0;
    let widest = 0;
    for (const bar of sorted) {
      widest = Math.max(widest, bar.x - cursor);
      cursor = Math.max(cursor, bar.x + bar.w);
    }
    widest = Math.max(widest, width - cursor);

    assert.ok(widest >= minGap - 1e-6, `seed ${seed} 缺口 ${widest} 小于 ${minGap}`);
    for (const bar of bars) {
      assert.ok(bar.w >= 0, "不允许负宽度");
      assert.ok(bar.x >= -1e-6 && bar.x + bar.w <= width + 1e-6, "柱子不能越界");
    }
  }
});

test("zig 形态在场地内往复", () => {
  const width = 800;
  const height = 500;
  const rng = mulberry32(42);
  const [bar] = buildPattern("zig", rng, { width, height, playerR: 10 });

  for (let t = 0; t < 12; t += 0.05) {
    const x = bar.baseX + Math.sin(t * bar.freq + bar.phase) * bar.amp;
    const clamped = clamp(x, 0, width - bar.w);
    assert.ok(clamped >= 0 && clamped <= width - bar.w);
  }
});

test("自动驾驶选择的落点在场地内且远离障碍", () => {
  const width = 900;
  const playerR = 12;
  const obstacles = [rect(0, 300, 300, 20), rect(600, 300, 300, 20)];
  const x = chooseSafeX({
    obstacles,
    playerX: 450,
    playerY: 640,
    playerR,
    width,
  });

  assert.ok(x >= playerR && x <= width - playerR);
  // 中间通道在 300~600 之间，安全点必须落在这个区间里
  assert.ok(x > 300 && x < 600, `期望落在通道内，实际 ${x}`);
});

test("自动驾驶没有威胁时保持居中偏置", () => {
  const width = 800;
  const x = chooseSafeX({
    obstacles: [],
    playerX: 100,
    playerY: 600,
    playerR: 10,
    width,
  });
  assert.ok(Math.abs(x - width / 2) < 60, `应靠近中心，实际 ${x}`);
});
