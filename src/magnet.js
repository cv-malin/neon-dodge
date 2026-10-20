/**
 * 道具磁吸：只在道具进入半径后生效，半径随局内时间衰减。
 * 硬核档恒为 0，避免把高风险档位变简单。
 */

import { getTier } from "./difficulty.js";

export const MAGNET_BASE = 0.08;
export const MAGNET_BONUS = 0.1;
export const MAGNET_DECAY_SEC = 150;
export const PULL_FACTOR = 3;

/**
 * r(t) = 0.08W + 0.10W · max(0, 1 − t/150)
 * @param {number} tSec 局内秒数
 * @param {number} width 画面宽度
 * @param {string} tierId
 */
export function magnetRadius(tSec, width, tierId) {
  if (!getTier(tierId).magnet) return 0;
  const t = Math.max(0, Number(tSec) || 0);
  const decay = Math.max(0, 1 - t / MAGNET_DECAY_SEC);
  return width * (MAGNET_BASE + MAGNET_BONUS * decay);
}

/** 道具与玩家边缘到边缘的净距。 */
export function edgeGap(pickup, player) {
  const dx = pickup.x - player.x;
  const dy = pickup.y - player.y;
  return Math.max(0, Math.hypot(dx, dy) - pickup.r - player.r);
}

/**
 * 计算这一帧的磁吸位置；不在半径内返回 null。
 * 靠拢速度是道具下落速度的 3 倍，且不会越过玩家中心。
 */
export function magnetStep(pickup, player, tSec, width, tierId, dt, fallSpeed) {
  const radius = magnetRadius(tSec, width, tierId);
  if (radius <= 0) return null;
  if (edgeGap(pickup, player) > radius) return null;

  const dx = player.x - pickup.x;
  const dy = player.y - pickup.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return { x: player.x, y: player.y };

  const speed = Math.max(0, fallSpeed) * PULL_FACTOR;
  const move = Math.min(distance, speed * Math.max(0, dt));
  return {
    x: pickup.x + (dx / distance) * move,
    y: pickup.y + (dy / distance) * move,
  };
}
