/**
 * 道具系统：护盾、减速、双倍。
 * 纯函数，不碰 DOM 也不碰 canvas，便于单元测试与调参。
 */

export const POWERUP_META = {
  shield: { label: "护盾", color: "#7ee787", duration: 0 },
  slow: { label: "减速", color: "#38bdf8", duration: 5 },
  double: { label: "双倍", color: "#f472b6", duration: 6 },
};

export const POWERUP_KINDS = ["shield", "slow", "double"];

export const SLOW_FACTOR = 0.55;

/** 效果状态。shield 是布尔，其余是剩余秒数。 */
export function createEffects() {
  return { shield: false, slow: 0, double: 0, invincible: 0 };
}

/**
 * 拾取道具。同类道具刷新到完整时长而不是叠加，
 * 否则连续吃三个减速可以让游戏永久慢放。
 */
export function applyPowerup(effects, kind) {
  const meta = POWERUP_META[kind];
  if (!meta) return effects;

  if (kind === "shield") {
    effects.shield = true;
  } else {
    effects[kind] = meta.duration;
  }
  return effects;
}

/** 推进计时器，返回这一帧过期的效果名。 */
export function stepEffects(effects, dt) {
  const expired = [];
  for (const key of ["slow", "double", "invincible"]) {
    if (effects[key] <= 0) continue;
    effects[key] = Math.max(0, effects[key] - dt);
    if (effects[key] === 0) expired.push(key);
  }
  return expired;
}

export function scoreMultiplier(effects) {
  return effects.double > 0 ? 2 : 1;
}

export function timeScale(effects) {
  return effects.slow > 0 ? SLOW_FACTOR : 1;
}

/** 下一个道具出现的间隔（秒）。7~12 秒，配合磁吸把单局拾取拉到 1.5 以上。 */
export function nextPickupDelay(rng) {
  return 7 + rng() * 5;
}

export function pickPowerupKind(rng) {
  const roll = rng();
  if (roll < 0.45) return "shield";
  if (roll < 0.75) return "slow";
  return "double";
}
