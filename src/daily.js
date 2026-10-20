/**
 * 每日挑战的日期工具。
 *
 * 一律按 UTC+8 的“自然日”切分：无论玩家在哪个时区，
 * 同一天看到的挑战种子都一样。没有服务端，接受改时间作弊。
 */

const DAY_MS = 86400000;
const UTC8_OFFSET_MS = 8 * 3600000;

/** 把时间戳格式化成 UTC+8 的 YYYY-MM-DD。 */
export function dateKey(now = Date.now()) {
  const shifted = new Date(now + UTC8_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseKey(key) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key ?? ""));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/** YYYY-MM-DD → UTC 零点的毫秒数（只用于自然日算术）。 */
export function keyToMs(key) {
  const parts = parseKey(key);
  if (!parts) return NaN;
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

function formatMs(ms) {
  const date = new Date(ms);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** 前一天；跨月、跨年、闰年都交给 Date.UTC。 */
export function previousDateKey(key) {
  const ms = keyToMs(key);
  if (!Number.isFinite(ms)) return "";
  return formatMs(ms - DAY_MS);
}

/** b - a，单位为自然日。 */
export function daysBetween(a, b) {
  const start = keyToMs(a);
  const end = keyToMs(b);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return NaN;
  return Math.round((end - start) / DAY_MS);
}

export function isYesterday(previous, today) {
  return daysBetween(previous, today) === 1;
}

/**
 * 日期 seed：FNV-1a 32 位哈希。
 * 同一天、任何时区、任何设备都得到同一个种子。
 */
export function seedFromDateKey(key) {
  let hash = 0x811c9dc5;
  const text = String(key);
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  hash >>>= 0;
  return hash === 0 ? 1 : hash;
}

/**
 * 连胜：只有“昨天也完成了挑战”才 +1。
 * 同一天重复调用不加；断档从 1 重新开始。
 */
export function nextStreak(current, lastDate, today) {
  if (lastDate === today) return current;
  if (lastDate && isYesterday(lastDate, today)) return Math.max(0, current) + 1;
  return 1;
}
