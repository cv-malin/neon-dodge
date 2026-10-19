import { clamp } from "./logic.js";

export class Obstacle {
  /**
   * @param {object} spec buildPattern 产出的形状
   * @param {number} fieldWidth 世界宽度，用于 zig 形态的边界夹取
   */
  constructor(spec, fieldWidth) {
    Object.assign(this, spec);
    this.fieldWidth = fieldWidth;
    this.speed = 0;
    this.nearMissed = false;
    this.scored = false;
    this.age = 0;
  }

  get rect() {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  update(dt, time) {
    this.age += dt;
    this.y += this.speed * dt;

    if (this.kind === "zig") {
      const span = this.fieldWidth - this.w;
      const target = this.baseX + Math.sin(time * this.freq + this.phase) * this.amp;
      this.x = clamp(target, 0, Math.max(0, span));
    }
  }

  isOffscreen(height) {
    return this.y > height + this.h + 40;
  }
}

export class Particle {
  constructor({ x, y, vx, vy, life, size, color, gravity = 0, drag = 0.98 }) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.life = life;
    this.maxLife = life;
    this.size = size;
    this.color = color;
    this.gravity = gravity;
    this.drag = drag;
  }

  update(dt) {
    this.life -= dt;
    this.vy += this.gravity * dt;
    this.vx *= this.drag;
    this.vy *= this.drag;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  get alpha() {
    return Math.max(0, this.life / this.maxLife);
  }
}

/** 在一点炸开一簇粒子。 */
export function burst(out, { x, y, count = 18, speed = 260, color = "#38bdf8", life = 0.7, size = 2.6, gravity = 320 }) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const power = speed * (0.25 + Math.random() * 0.9);
    out.push(
      new Particle({
        x,
        y,
        vx: Math.cos(angle) * power,
        vy: Math.sin(angle) * power,
        life: life * (0.6 + Math.random() * 0.7),
        size: size * (0.5 + Math.random()),
        color,
        gravity,
      }),
    );
  }
}
