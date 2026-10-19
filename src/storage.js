const KEY = "neon-dodge:best";

export function getBest() {
  try {
    const raw = localStorage.getItem(KEY);
    const value = Number.parseInt(raw ?? "0", 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

export function setBest(value) {
  try {
    localStorage.setItem(KEY, String(Math.floor(value)));
  } catch {
    /* 隐私模式下 localStorage 可能抛错，静默失败即可 */
  }
}
