import {
  circleRectCollide,
  nearMissGap,
  difficultyAt,
  pickPattern,
  buildPattern,
  chooseSafeX,
  clamp,
} from "./logic.js";
import { Obstacle, burst } from "./entities.js";

const COLORS = {
  single: "#38bdf8",
  gate: "#a78bfa",
  zig: "#f472b6",
};

const NEAR_MISS_FACTOR = 2.4; // 净距 <= 2.4r 判定为擦身
const FIXED_TRAIL = 16;

export class Game {
  constructor({ canvas, hud, input, sound, onState, seed = 1, auto = false }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.hud = hud;
    this.input = input;
    this.sound = sound;
    this.onState = onState;
    this.auto = auto;

    this.seed = seed >>> 0;
    this.state = "menu";

    this.dpr = 1;
    this.w = 1;
    this.h = 1;
    this.time = 0;
    this.scroll = 0;
    this.shake = 0;

    this.obstacles = [];
    this.particles = [];
    this.trail = [];
    this.dust = [];

    this.player = { x: 0, y: 0, r: 12, targetX: 0 };

    this.score = 0;
    this.best = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.distance = 0;
    this.spawnTimer = 0;
    this.speed = 0;

    this._bg = null;
    this._vignette = null;
  }

  /* ---------- 生命周期 ---------- */

  resize(width, height) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.w = width;
    this.h = height;

    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    this._buildGradients();

    if (this.dust.length === 0) {
      this.dust = Array.from({ length: 44 }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        z: 0.2 + Math.random() * 0.8,
        size: 0.6 + Math.random() * 1.5,
      }));
    }

    const r = clamp(Math.min(width, height) * 0.022, 9, 17);
    this.player.r = r;
    this.player.y = height * 0.8;
    this.player.x = clamp(this.player.x || width / 2, r, width - r);
    this.player.targetX = this.player.x;
  }

  _buildGradients() {
    const { ctx, w, h } = this;
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#05070d");
    bg.addColorStop(0.55, "#080d18");
    bg.addColorStop(1, "#0b1424");
    this._bg = bg;

    const vg = ctx.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.2, w / 2, h * 0.55, Math.max(w, h) * 0.78);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.62)");
    this._vignette = vg;
  }

  start() {
    this.seed = (this.seed + 7919) >>> 0;
    this._reset();
    this.state = "playing";
    this.sound?.start();
    this.onState?.(this.state);
  }

  _reset() {
    this.obstacles = [];
    this.particles = [];
    this.trail = [];
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.distance = 0;
    this.spawnTimer = 0.55;
    this.speed = this.h * 0.55;
    this.shake = 0;
    this.player.x = this.w / 2;
    this.player.targetX = this.w / 2;
    this._syncHud();
    this.hud.combo.hidden = true;
  }

  pause() {
    if (this.state !== "playing") return;
    this.state = "paused";
    this.onState?.(this.state);
  }

  resume() {
    if (this.state !== "paused") return;
    this.state = "playing";
    this.onState?.(this.state);
  }

  togglePause() {
    if (this.state === "playing") this.pause();
    else if (this.state === "paused") this.resume();
  }

  die(cause = "hit") {
    if (this.state !== "playing") return;
    this.state = "dead";
    this.shake = 24;
    burst(this.particles, {
      x: this.player.x,
      y: this.player.y,
      count: 40,
      speed: 420,
      color: "#38bdf8",
      life: 1.1,
      size: 3.2,
      gravity: 240,
    });
    burst(this.particles, {
      x: this.player.x,
      y: this.player.y,
      count: 16,
      speed: 200,
      color: "#f472b6",
      life: 0.9,
      size: 2.2,
      gravity: 120,
    });
    this.sound?.death();

    if (this.score > this.best) {
      this.best = Math.floor(this.score);
      this._persistBest?.(this.best);
    }
    this._syncHud();
    this.onState?.(this.state, { score: Math.floor(this.score), best: this.best, cause });
  }

  /* ---------- 更新 ---------- */

  update(dt) {
    this.time += dt;
    this.shake *= Math.pow(0.0025, dt);
    if (this.shake < 0.2) this.shake = 0;

    this._updateDust(dt);
    this._updateParticles(dt);

    if (this.state !== "playing") return;

    const diff = difficultyAt(this.distance);
    this.speed = diff.speed * this.h;
    this.distance += (this.speed * dt) / this.h;
    this.scroll += this.speed * dt;
    this.score += dt * 8 * (1 + this.combo * 0.3);

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this._spawn(diff);
      this.spawnTimer = diff.interval * (0.85 + this._rng() * 0.3);
    }

    this._movePlayer(dt);
    this._updateObstacles(dt);
    this._detect(dt);

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 0;
        this.hud.combo.hidden = true;
      }
    }

    this.trail.push({ x: this.player.x, y: this.player.y });
    if (this.trail.length > FIXED_TRAIL) this.trail.shift();

    this._syncHud();
  }

  _rng() {
    // 轻量随机：种子只影响初始序列，运行期用简单 LCG 保证流畅
    this._seedState = ((this._seedState ?? this.seed) * 1664525 + 1013904223) >>> 0;
    return this._seedState / 4294967296;
  }

  _spawn(diff) {
    const pattern = pickPattern(() => this._rng(), diff);
    const specs = buildPattern(pattern, () => this._rng(), {
      width: this.w,
      height: this.h,
      playerR: this.player.r,
    });

    for (const spec of specs) {
      const obstacle = new Obstacle(spec, this.w);
      obstacle.speed = this.speed * (0.92 + this._rng() * 0.16);
      this.obstacles.push(obstacle);
    }
  }

  _movePlayer(dt) {
    const { player } = this;
    const dir = this.input.direction;

    if (this.auto) {
      player.targetX = chooseSafeX({
        obstacles: this.obstacles.map((o) => o.rect),
        playerX: player.x,
        playerY: player.y,
        playerR: player.r,
        width: this.w,
        lookAhead: this.h * 0.45,
      });
      const k = 1 - Math.exp(-dt * 14);
      player.x += (player.targetX - player.x) * k;
    } else if (dir !== 0) {
      player.x += dir * this.h * 0.9 * dt;
      player.targetX = player.x;
    } else if (this.input.pointerActive && this.input.pointerX != null) {
      player.targetX = this.input.pointerX;
      const k = 1 - Math.exp(-dt * 16);
      player.x += (player.targetX - player.x) * k;
    }

    player.x = clamp(player.x, player.r, this.w - player.r);
  }

  _updateObstacles(dt) {
    for (const obstacle of this.obstacles) obstacle.update(dt, this.time);
    this.obstacles = this.obstacles.filter((o) => !o.isOffscreen(this.h));
  }

  _detect() {
    const { x, y, r } = this.player;

    for (const obstacle of this.obstacles) {
      const rect = obstacle.rect;

      if (circleRectCollide(x, y, r, rect)) {
        this.die("hit");
        return;
      }

      if (!obstacle.nearMissed) {
        const gap = nearMissGap(x, y, r, rect);
        if (gap !== null && gap <= r * NEAR_MISS_FACTOR) {
          obstacle.nearMissed = true;
          this._rewardNearMiss();
        }
      }
    }
  }

  _rewardNearMiss() {
    this.combo = Math.min(this.combo + 1, 9);
    this.comboTimer = 2.6;
    const bonus = 18 * (1 + this.combo * 0.6);
    this.score += bonus;
    this.shake = Math.max(this.shake, 4);
    this.sound?.nearMiss(this.combo);

    this.hud.combo.hidden = false;
    this.hud.comboValue.textContent = String(this.combo + 1);

    burst(this.particles, {
      x: this.player.x,
      y: this.player.y,
      count: 6,
      speed: 120,
      color: "#7ee787",
      life: 0.45,
      size: 1.8,
      gravity: 0,
    });
  }

  _updateDust(dt) {
    const drift = this.state === "playing" ? 1 : 0.35;
    for (const mote of this.dust) {
      mote.y += (16 + mote.z * 46) * dt * drift;
      if (mote.y > this.h + 4) {
        mote.y = -4;
        mote.x = Math.random() * this.w;
      }
    }
  }

  _updateParticles(dt) {    for (const p of this.particles) p.update(dt);
    this.particles = this.particles.filter((p) => p.life > 0);
    if (this.particles.length > 240) this.particles.splice(0, this.particles.length - 240);
  }

  _syncHud() {
    const score = Math.floor(this.score).toString();
    if (this.hud.score.textContent !== score) this.hud.score.textContent = score;
    const best = Math.max(this.best, Math.floor(this.score)).toString();
    if (this.hud.best.textContent !== best) this.hud.best.textContent = best;
  }

  /* ---------- 渲染 ---------- */

  render() {
    const { ctx, w, h } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = this._bg ?? "#05070d";
    ctx.fillRect(0, 0, w, h);

    this._drawGrid();
    this._drawDust();

    const shakeX = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    const shakeY = this.shake ? (Math.random() - 0.5) * this.shake : 0;

    ctx.save();
    ctx.translate(shakeX, shakeY);
    for (const obstacle of this.obstacles) this._drawObstacle(obstacle);
    if (this.state !== "dead") this._drawPlayer();
    this._drawParticles();
    ctx.restore();

    ctx.fillStyle = this._vignette ?? "rgba(0,0,0,0)";
    ctx.fillRect(0, 0, w, h);
  }

  _drawGrid() {
    const { ctx, w, h } = this;
    const gap = Math.max(48, h * 0.11);
    const offset = this.scroll % gap;

    ctx.save();
    ctx.lineWidth = 1;

    ctx.strokeStyle = "rgba(56, 189, 248, 0.07)";
    ctx.beginPath();
    for (let y = -offset; y < h + gap; y += gap) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    ctx.strokeStyle = "rgba(167, 139, 250, 0.05)";
    ctx.beginPath();
    for (let x = 0; x < w; x += gap * 1.6) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    ctx.stroke();
    ctx.restore();
  }

  _drawDust() {
    const { ctx } = this;
    ctx.save();
    ctx.fillStyle = "#7dd3fc";
    for (const mote of this.dust) {
      ctx.globalAlpha = 0.04 + mote.z * 0.1;
      ctx.beginPath();
      ctx.arc(mote.x, mote.y, mote.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  _drawObstacle(obstacle) {
    const { ctx } = this;
    const { x, y, w, h } = obstacle;
    const color = COLORS[obstacle.kind] ?? COLORS.single;
    const radius = Math.min(8, w / 2, h / 2);

    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;

    ctx.fillStyle = hexToRgba(color, 0.2);
    roundedRect(ctx, x, y, w, h, radius);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = hexToRgba(color, 0.9);
    ctx.lineWidth = 1.6;
    roundedRect(ctx, x, y, w, h, radius);
    ctx.stroke();

    ctx.fillStyle = hexToRgba(color, 0.5);
    ctx.fillRect(x + radius, y + 1.5, Math.max(0, w - radius * 2), 1.5);
    ctx.restore();
  }

  _drawPlayer() {
    const { ctx } = this;
    const { x, y, r } = this.player;

    for (let i = 0; i < this.trail.length; i += 1) {
      const point = this.trail[i];
      const t = i / this.trail.length;
      ctx.beginPath();
      ctx.fillStyle = `rgba(56, 189, 248, ${0.02 + t * 0.16})`;
      ctx.arc(point.x, point.y, r * (0.25 + t * 0.7), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.shadowColor = "#38bdf8";
    ctx.shadowBlur = 26;

    const gradient = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.45, "#bae6fd");
    gradient.addColorStop(1, "#0ea5e9");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(232, 238, 247, 0.85)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  _drawParticles() {
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha));
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.4 + p.alpha * 0.8), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

/* ---------- 工具 ---------- */

function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, radius);
    return;
  }
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function hexToRgba(hex, alpha) {
  const value = hex.replace("#", "");
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
