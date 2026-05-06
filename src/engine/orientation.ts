/** Unified pointer/gyro yaw input for the scan view.
 *  Phase 1: drag = yaw, drag-vertical = pitch. Mobile gyro = real head turn. */

export interface OrientationInput {
  /** Yaw in radians (0 = forward / facing +x). */
  yaw: number;
  /** Pitch in radians (0 = horizon, + = up). */
  pitch: number;
}

export class OrientationController {
  state: OrientationInput = { yaw: 0, pitch: 0 };
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private gyroEnabled = false;
  private gyroBaseAlpha: number | null = null;

  constructor(private el: HTMLElement, initialYaw = 0) {
    this.state.yaw = initialYaw;
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerup", this.onUp);
    el.addEventListener("pointercancel", this.onUp);
    el.addEventListener("pointerleave", this.onUp);
  }

  destroy() {
    this.el.removeEventListener("pointerdown", this.onDown);
    this.el.removeEventListener("pointermove", this.onMove);
    this.el.removeEventListener("pointerup", this.onUp);
    this.el.removeEventListener("pointercancel", this.onUp);
    this.el.removeEventListener("pointerleave", this.onUp);
    if (this.gyroEnabled) {
      window.removeEventListener("deviceorientation", this.onGyro);
    }
  }

  /** Try to enable gyro; on iOS this needs a user-gesture call. */
  async enableGyro(): Promise<boolean> {
    const DOE = (window as any).DeviceOrientationEvent;
    if (!DOE) return false;
    if (typeof DOE.requestPermission === "function") {
      try {
        const r = await DOE.requestPermission();
        if (r !== "granted") return false;
      } catch {
        return false;
      }
    }
    window.addEventListener("deviceorientation", this.onGyro);
    this.gyroEnabled = true;
    return true;
  }

  private onGyro = (e: DeviceOrientationEvent) => {
    if (e.alpha == null) return;
    if (this.gyroBaseAlpha == null) this.gyroBaseAlpha = e.alpha;
    // alpha is degrees, 0..360, around the world Z (compass-like).
    const dAlpha = e.alpha - this.gyroBaseAlpha;
    this.state.yaw = -((dAlpha * Math.PI) / 180);
    if (e.beta != null) {
      // beta: front-back tilt (-180..180); treat 0 as horizon.
      const pitchDeg = Math.max(-60, Math.min(60, e.beta - 60));
      this.state.pitch = (pitchDeg * Math.PI) / 180;
    }
  };

  private onDown = (e: PointerEvent) => {
    this.dragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.el.setPointerCapture(e.pointerId);
  };
  private onMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    // 2 px ≈ 1°  feels right for a 360° sweep on a phone.
    this.state.yaw -= (dx / 2) * (Math.PI / 180);
    this.state.pitch += (dy / 4) * (Math.PI / 180);
    this.state.pitch = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, this.state.pitch));
  };
  private onUp = (e: PointerEvent) => {
    this.dragging = false;
    try { this.el.releasePointerCapture(e.pointerId); } catch {}
  };
}
