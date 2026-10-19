/**
 * 移动端触感反馈。
 * Vibration API 只有部分浏览器支持（Android Chrome 有，iOS Safari 没有），
 * 所以这里永远静默降级，绝不让调用方处理异常。
 */
export function vibrate(pattern) {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* 某些浏览器在无用户手势时会抛错，忽略 */
  }
}

export const HAPTICS = {
  hit: [45, 30, 90],
  nearMiss: 12,
  pickup: 18,
  shieldBreak: [20, 20, 20],
  start: 10,
};
