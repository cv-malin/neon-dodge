/**
 * 本地事件：只写 localStorage，不上传。
 * 用环形缓冲限制体积，避免玩久了把 storage 撑爆。
 */

export const MAX_EVENTS = 500;

export function makeEvent(type, payload = {}, ts = Date.now()) {
  return { ...payload, type, ts };
}

export function appendEvent(events, type, payload = {}, ts = Date.now(), limit = MAX_EVENTS) {
  const next = [...events, makeEvent(type, payload, ts)];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

export function sanitizeEvents(raw, limit = MAX_EVENTS) {
  if (!Array.isArray(raw)) return [];
  const clean = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    if (typeof item.type !== "string" || item.type.length === 0) continue;
    if (!Number.isFinite(item.ts)) continue;
    clean.push({ ...item });
  }
  return clean.length > limit ? clean.slice(clean.length - limit) : clean;
}
