/**
 * 本地排行榜：纯排序 / 截断逻辑，持久化在 storage.js。
 */

export const MAX_SCORES = 8;

/**
 * 插入一条成绩并返回新榜与名次。
 * 同分时更早创造的成绩排前面（先到先得）。
 */
export function insertScore(entries, entry, limit = MAX_SCORES) {
  const next = [...entries, entry]
    .sort((a, b) => b.score - a.score || a.at - b.at)
    .slice(0, limit);

  const index = next.indexOf(entry);
  return { list: next, rank: index === -1 ? null : index + 1 };
}

/** 只保留合法记录，防止 localStorage 被手动改坏后渲染崩溃。 */
export function sanitizeScores(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item) =>
        item &&
        Number.isFinite(item.score) &&
        item.score >= 0 &&
        Number.isFinite(item.at),
    )
    .map((item) => ({ score: Math.floor(item.score), at: item.at }))
    .slice(0, MAX_SCORES);
}
