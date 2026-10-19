/** 可复现的伪随机数（mulberry32），给定 seed 结果完全一致。 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 从 [min, max) 取浮点数。 */
export function between(rng, min, max) {
  return min + rng() * (max - min);
}

/** 从数组里取一个元素。 */
export function pick(rng, list) {
  return list[Math.floor(rng() * list.length) % list.length];
}
