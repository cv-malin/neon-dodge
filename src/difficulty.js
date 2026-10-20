/**
 * 难度档位：只缩放障碍的初速与加速度，不改生成概率。
 * 这样三档玩的是同一套规则，分数才有可比性。
 */

export const TIERS = Object.freeze({
  casual: Object.freeze({
    id: "casual",
    label: "休闲",
    factor: 0.8,
    magnet: true,
    blurb: "0.8× · 先活下来",
  }),
  standard: Object.freeze({
    id: "standard",
    label: "标准",
    factor: 1,
    magnet: true,
    blurb: "1.0× · 原汁原味",
  }),
  hardcore: Object.freeze({
    id: "hardcore",
    label: "硬核",
    factor: 1.25,
    magnet: false,
    blurb: "1.25× · 没有磁吸",
  }),
});

export const TIER_ORDER = Object.freeze(["casual", "standard", "hardcore"]);
export const DEFAULT_TIER = "standard";

export function isTier(id) {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(TIERS, id);
}

export function getTier(id) {
  return isTier(id) ? TIERS[id] : TIERS[DEFAULT_TIER];
}

/**
 * 把基础难度曲线按档位缩放。
 * @param {{speed:number, interval:number, zigChance:number, gateChance:number, t:number}} diff
 * @param {string} tierId
 */
export function applyTier(diff, tierId) {
  const tier = getTier(tierId);
  return {
    ...diff,
    speed: diff.speed * tier.factor,
    factor: tier.factor,
    tier: tier.id,
  };
}
