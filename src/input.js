/**
 * 输入：键盘（方向键 / WASD）、鼠标跟随、触屏拖动。
 * 只负责收集意图，移动逻辑在 game.js 里。
 */
export class Input {
  constructor(canvas, { onPrimary, onPause, onMute }) {
    this.canvas = canvas;
    this.onPrimary = onPrimary;
    this.onPause = onPause;
    this.onMute = onMute;

    this.left = false;
    this.right = false;
    this.pointerX = null;
    this.pointerActive = false;
    this.pointerType = null;

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onBlur = this._onBlur.bind(this);

    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);
    window.addEventListener("blur", this._onBlur);
    canvas.addEventListener("pointerdown", this._onPointerDown);
    canvas.addEventListener("pointermove", this._onPointerMove);
    window.addEventListener("pointerup", this._onPointerUp);
    window.addEventListener("pointercancel", this._onPointerUp);
  }

  get direction() {
    return (this.right ? 1 : 0) - (this.left ? 1 : 0);
  }

  _localX(event) {
    const rect = this.canvas.getBoundingClientRect();
    return event.clientX - rect.left;
  }

  _onKeyDown(event) {
    const key = event.key.toLowerCase();

    if (key === "arrowleft" || key === "a") {
      this.left = true;
      this.pointerActive = false;
      event.preventDefault();
    } else if (key === "arrowright" || key === "d") {
      this.right = true;
      this.pointerActive = false;
      event.preventDefault();
    } else if (key === " " || key === "enter") {
      event.preventDefault();
      this.onPrimary?.();
    } else if (key === "p" || key === "escape") {
      event.preventDefault();
      this.onPause?.();
    } else if (key === "m") {
      this.onMute?.();
    }
  }

  _onKeyUp(event) {
    const key = event.key.toLowerCase();
    if (key === "arrowleft" || key === "a") this.left = false;
    if (key === "arrowright" || key === "d") this.right = false;
  }

  _onPointerDown(event) {
    this.pointerActive = true;
    this.pointerType = event.pointerType;
    this.pointerX = this._localX(event);
    this.canvas.setPointerCapture?.(event.pointerId);
    this.onPrimary?.();
  }

  _onPointerMove(event) {
    // 鼠标悬停即跟随；触屏只有按住时才算
    if (event.pointerType === "mouse") {
      this.pointerType = "mouse";
      this.pointerActive = true;
    }
    if (!this.pointerActive) return;
    this.pointerX = this._localX(event);
  }

  _onPointerUp() {
    // 鼠标保留最后位置（跟手），触屏抬手后停止跟随
    if (this.pointerType !== "mouse") {
      this.pointerActive = false;
      this.pointerX = null;
    }
  }

  _onBlur() {
    this.left = false;
    this.right = false;
    this.pointerActive = false;
  }

  destroy() {
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup", this._onKeyUp);
    window.removeEventListener("blur", this._onBlur);
    this.canvas.removeEventListener("pointerdown", this._onPointerDown);
    this.canvas.removeEventListener("pointermove", this._onPointerMove);
    window.removeEventListener("pointerup", this._onPointerUp);
    window.removeEventListener("pointercancel", this._onPointerUp);
  }
}
