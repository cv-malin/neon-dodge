/**
 * 纯逻辑层：不碰 DOM、不碰 canvas，方便单元测试。
 * 难度曲线、碰撞、擦身判定、障碍生成都在这里。
 */

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** 圆与轴对齐矩形是否相交。 */
export function circleRectCollide(cx, cy, r, rect) {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const ny = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy <= r * r;
}

/** 圆心到矩形在水平方向的距离，矩形内部返回 0。 */
export function horizontalGap(cx, rect) {
  if (cx < rect.x) return rect.x - cx;
  if (cx > rect.x + rect.w) return cx - (rect.x + rect.w);
  return 0;
}

/**
 * 擦身判定：只在障碍与玩家在垂直方向有交叠时有效。
 * 返回水平净距（像素），无交叠返回 null。
 */
export function nearMissGap(cx, cy, r, rect) {
  const overlapsY = rect.y < cy + r && rect.y + rect.h > cy - r;
  if (!overlapsY) return null;
  return horizontalGap(cx, rect);
}

/**
 * 难度曲线：distance 以"屏"为单位（累计下落距离 / 屏幕高度）。
 * 所有数值都随 t∈[0,1] 单调变化，便于测试与调参。
 */
export function difficultyAt(distance) {
  const t = clamp(distance / 150, 0, 1);
  return {
    t,
    speed: 0.55 + 0.85 * t, // 屏/秒
    interval: 0.95 - 0.55 * t, // 秒
    zigChance: 0.12 + 0.33 * t,
    gateChance: 0.22 + 0.28 * t,
  };
}

/** 按权重挑一种障碍形态。 */
export function pickPattern(rng, diff) {
  const roll = rng();
  if (roll < diff.zigChance) return 'zig';
  if (roll < diff.zigChance + diff.gateChance) return 'gate';
  return 'single';
}

/**
 * 生成一组障碍。返回的数组不含 y 之外的随机性，调用方负责设置速度。
 * 保证 gate 形态永远留出 >= 4.2r 的可通行缺口。
 */
export function buildPattern(pattern, rng, { width, height, playerR }) {
  const minGap = playerR * 4.2;
  const thickness = () => height * (0.016 + rng() * 0.016);

  if (pattern === 'gate') {
    const gap = clamp(minGap + rng() * width * 0.2, minGap, width * 0.46);
    const minBar = Math.max(8, width * 0.06);
    const usable = width - gap - 2 * minBar;
    // 屏幕太窄时退化成单柱，避免出现零宽障碍
    if (usable <= 0) return buildPattern('single', rng, { width, height, playerR });

    const center = gap / 2 + minBar + rng() * usable;
    const left = { x: 0, w: center - gap / 2 };
    const right = { x: center + gap / 2, w: width - (center + gap / 2) };
    return [left, right].map((bar) => {
      const h = thickness();
      return { x: bar.x, y: -h, w: bar.w, h, kind: 'gate' };
    });
  }

  const h = thickness();
  const w = pattern === 'zig' ? width * (0.1 + rng() * 0.06) : width * (0.13 + rng() * 0.15);
  const baseX = rng() * Math.max(0, width - w);

  if (pattern === 'zig') {
    return [
      {
        x: baseX,
        baseX,
        y: -h,
        w,
        h,
        kind: 'zig',
        amp: Math.min((width - w) / 2, width * 0.2),
        freq: 0.8 + rng() * 0.7,
        phase: rng() * Math.PI * 2,
      },
    ];
  }

  return [{ x: baseX, y: -h, w, h, kind: 'single' }];
}

/**
 * 自动驾驶：在所有候选位置里找"离障碍最远"的落点。
 * 用于演示模式（?auto=1）和截图，不参与正式玩法。
 */
export function chooseSafeX({ obstacles, playerX, playerY, playerR, width, lookAhead = Number.POSITIVE_INFINITY }) {
  const threats = obstacles.filter(
    (rect) => rect.y < playerY + playerR * 3 && rect.y + rect.h > playerY - lookAhead,
  );

  // 没有威胁时回到中线，避免贴着边缘跑
  if (threats.length === 0) return width / 2;

  const candidates = [];
  const steps = 48;
  const edge = width * 0.06;
  for (let i = 0; i <= steps; i += 1) {
    const x = playerR + ((width - 2 * playerR) * i) / steps;
    let clearance = Infinity;
    for (const rect of threats) {
      clearance = Math.min(clearance, horizontalGap(x, rect));
    }
    // 同样安全时优先待在场内，避免贴边飞行
    if (x < edge || x > width - edge) clearance -= 8;
    candidates.push({ x, clearance });
  }

  // 先取最大净距，再在"同样安全"的候选里选离当前位置最近的，
  // 避免在两条通道之间来回横跳，也避免为了少走两步而停在障碍里。
  const safest = Math.max(...candidates.map((c) => c.clearance));
  const tolerance = Math.max(4, width * 0.02);

  let best = candidates[0];
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    if (candidate.clearance < safest - tolerance) continue;
    const distance = Math.abs(candidate.x - playerX);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best.x;
}
