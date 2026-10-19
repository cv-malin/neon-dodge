/**
 * 极简 WebAudio 音效：不加载任何音频文件，全部用振荡器合成。
 * 浏览器要求用户交互后才能出声，所以第一次按键/点击时才 unlock。
 */
export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  unlock() {
    if (this.muted) return;
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  setMuted(muted) {
    this.muted = muted;
    if (muted && this.ctx) this.ctx.suspend();
  }

  tone({ freq = 440, to = freq, duration = 0.12, type = "sine", gain = 0.06, delay = 0 }) {
    if (this.muted || !this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + duration);

    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    osc.connect(env).connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  start() {
    this.tone({ freq: 320, to: 640, duration: 0.18, type: "triangle", gain: 0.05 });
    this.tone({ freq: 480, to: 960, duration: 0.22, type: "sine", gain: 0.03, delay: 0.05 });
  }

  nearMiss(combo = 0) {
    const base = 620 + Math.min(combo, 8) * 70;
    this.tone({ freq: base, to: base * 1.5, duration: 0.09, type: "sine", gain: 0.045 });
  }

  pickup(kind = "shield") {
    const map = {
      shield: { freq: 520, to: 880, type: "triangle" },
      slow: { freq: 720, to: 420, type: "sine" },
      double: { freq: 620, to: 1040, type: "square" },
    };
    const preset = map[kind] ?? map.shield;
    this.tone({ ...preset, duration: 0.16, gain: 0.05 });
    this.tone({ ...preset, freq: preset.to, to: preset.to * 1.25, duration: 0.12, gain: 0.03, delay: 0.08 });
  }

  shieldBreak() {
    this.tone({ freq: 300, to: 90, duration: 0.3, type: "sawtooth", gain: 0.06 });
    this.tone({ freq: 180, to: 60, duration: 0.35, type: "triangle", gain: 0.04, delay: 0.03 });
  }

  death() {
    this.tone({ freq: 220, to: 55, duration: 0.55, type: "sawtooth", gain: 0.07 });
    this.tone({ freq: 110, to: 40, duration: 0.7, type: "triangle", gain: 0.05, delay: 0.04 });
  }

  click() {
    this.tone({ freq: 520, to: 660, duration: 0.06, type: "square", gain: 0.025 });
  }
}
