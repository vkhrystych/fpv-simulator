import { clamp, smoothing } from './math'
import type { PidGains } from './types'

/**
 * Контролер кутової швидкості на одну вісь.
 * D береться від виміряної швидкості (не від помилки) — інакше стрибок на різкому стіку.
 */
export class AxisPid {
  private integral = 0
  private lastMeasured = 0
  private dFiltered = 0
  private initialized = false

  constructor(
    private gains: PidGains,
    /** 0..1: нижче — гірший тюн, менше демпфування, більше «дзвону» */
    private tuneQuality = 1,
    private dTermTau = 0.012,
    private iLimit = 0.35,
  ) {}

  reset(): void {
    this.integral = 0
    this.lastMeasured = 0
    this.dFiltered = 0
    this.initialized = false
  }

  /**
   * @param setpoint цільова кутова швидкість, rad/s
   * @param measured виміряна кутова швидкість, rad/s
   * @returns нормований вихід [-1, 1]
   */
  update(setpoint: number, measured: number, dt: number): number {
    const err = setpoint - measured

    // недотюнений дрон: підвищений P і просаджений D → осциляції після стіка
    const q = clamp(this.tuneQuality, 0.2, 1)
    const kp = this.gains.p * (2 - q)
    const kd = this.gains.d * q

    if (!this.initialized) {
      this.lastMeasured = measured
      this.initialized = true
    }

    // iterm relax: не накопичувати інтеграл під час швидких рухів стіка
    const relax = clamp(1 - Math.abs(setpoint) / 12, 0.05, 1)
    this.integral += err * this.gains.i * dt * relax
    this.integral = clamp(this.integral, -this.iLimit, this.iLimit)

    const dRaw = -(measured - this.lastMeasured) / Math.max(dt, 1e-6)
    this.lastMeasured = measured
    this.dFiltered += (dRaw - this.dFiltered) * smoothing(dt, this.dTermTau)

    const out = kp * err + this.integral + kd * this.dFiltered

    // anti-windup: якщо вихід у насиченні і інтеграл штовхає туди ж — відкотити
    if (Math.abs(out) > 1) {
      const excess = out - clamp(out, -1, 1)
      if (Math.sign(excess) === Math.sign(this.integral)) {
        this.integral -= excess * 0.5
      }
    }

    return clamp(out, -1, 1)
  }
}

export class RateController {
  readonly roll: AxisPid
  readonly pitch: AxisPid
  readonly yaw: AxisPid

  constructor(gains: { roll: PidGains; pitch: PidGains; yaw: PidGains }, tuneQuality = 1) {
    this.roll = new AxisPid(gains.roll, tuneQuality)
    this.pitch = new AxisPid(gains.pitch, tuneQuality)
    this.yaw = new AxisPid(gains.yaw, tuneQuality)
  }

  reset(): void {
    this.roll.reset()
    this.pitch.reset()
    this.yaw.reset()
  }
}
