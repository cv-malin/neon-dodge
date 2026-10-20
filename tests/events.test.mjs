import test from "node:test";
import assert from "node:assert/strict";

import {
  appendEvent,
  makeEvent,
  sanitizeEvents,
  MAX_EVENTS,
} from "../src/events.js";

test("事件包含类型、时间戳与自定义字段", () => {
  const event = makeEvent("visit", { returning: true, days_since_last: 2 }, 123);
  assert.deepEqual(event, {
    type: "visit",
    ts: 123,
    returning: true,
    days_since_last: 2,
  });
});

test("事件环形缓冲不会超过上限", () => {
  let events = [];
  for (let i = 0; i < MAX_EVENTS + 7; i += 1) {
    events = appendEvent(events, "game_start", { i }, i);
  }
  assert.equal(events.length, MAX_EVENTS);
  assert.equal(events[0].i, 7, "最旧的事件被丢弃");
  assert.equal(events.at(-1).i, MAX_EVENTS + 6);
});

test("事件上限可以按调用方覆盖", () => {
  let events = [];
  for (let i = 0; i < 5; i += 1) events = appendEvent(events, "retry", { i }, i, 3);
  assert.equal(events.length, 3);
  assert.equal(events[0].i, 2);
});

test("脏事件被过滤", () => {
  const clean = sanitizeEvents([
    { type: "visit", ts: 1 },
    null,
    { type: "", ts: 2 },
    { type: "game_end", ts: "bad" },
    { type: "retry", ts: 3, gap_ms: 1200 },
  ]);
  assert.deepEqual(clean, [
    { type: "visit", ts: 1 },
    { type: "retry", ts: 3, gap_ms: 1200 },
  ]);
});

test("非数组事件返回空数组", () => {
  assert.deepEqual(sanitizeEvents(null), []);
  assert.deepEqual(sanitizeEvents({ type: "visit" }), []);
});
