import test from "node:test";
import assert from "node:assert/strict";

import {
  magnetRadius,
  edgeGap,
  magnetStep,
} from "../src/magnet.js";

test("磁吸半径随时间从 0.18W 衰减到 0.08W", () => {
  assert.equal(magnetRadius(0, 1000, "standard"), 180);
  assert.equal(magnetRadius(75, 1000, "standard"), 130);
  assert.equal(magnetRadius(150, 1000, "standard"), 80);
  assert.equal(magnetRadius(300, 1000, "standard"), 80);
});

test("硬核档磁吸恒为 0", () => {
  assert.equal(magnetRadius(0, 1000, "hardcore"), 0);
  assert.equal(magnetRadius(75, 1000, "hardcore"), 0);
  assert.equal(magnetRadius(150, 1000, "hardcore"), 0);
});

test("净距是边缘到边缘的距离", () => {
  const pickup = { x: 100, y: 100, r: 10 };
  const player = { x: 100, y: 150, r: 12 };
  assert.equal(edgeGap(pickup, player), 28);
  assert.equal(edgeGap({ x: 100, y: 100, r: 10 }, { x: 100, y: 101, r: 12 }), 0);
});

test("净距进入半径后以 3 倍下落速度靠拢", () => {
  const pickup = { x: 100, y: 100, r: 10 };
  const player = { x: 100, y: 150, r: 12 };
  const next = magnetStep(pickup, player, 0, 1000, "standard", 0.1, 100);
  assert.ok(next, "半径内应该被吸");
  assert.equal(next.x, 100);
  assert.equal(next.y, 130, "100px/s 的 3 倍 * 0.1s = 30px");
});

test("超出磁吸半径不改变位置", () => {
  const pickup = { x: 100, y: 0, r: 10 };
  const player = { x: 100, y: 400, r: 12 };
  const next = magnetStep(pickup, player, 150, 1000, "standard", 0.016, 100);
  assert.equal(next, null);
});

test("硬核档不吸附道具", () => {
  const pickup = { x: 100, y: 100, r: 10 };
  const player = { x: 100, y: 150, r: 12 };
  assert.equal(magnetStep(pickup, player, 0, 1000, "hardcore", 0.1, 100), null);
});

test("靠拢不会越过玩家中心", () => {
  const pickup = { x: 100, y: 148, r: 10 };
  const player = { x: 100, y: 150, r: 12 };
  const next = magnetStep(pickup, player, 0, 1000, "standard", 0.5, 1000);
  assert.ok(next);
  assert.equal(next.x, 100);
  assert.equal(next.y, 150, "最多移动到玩家中心，不能穿过去");
});
