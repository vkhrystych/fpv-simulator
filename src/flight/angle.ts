import { clamp, quatToEuler } from './math'
import { maxRate, radToDeg, stickForRate } from './rates'
import type { DroneSpec, ControlInput } from './types'
import type { Drone } from './drone'

/**
 * ANGLE-режим: зовнішній контур по куту, що видає ті самі стіки, що й пілот.
 * Використовується лише в тренуванні (рівень 1) і в автопілоті тестів —
 * бойові рівні йдуть в ACRO.
 */
export class AngleController {
  constructor(
    private spec: DroneSpec,
    /** максимальний кут нахилу, град */
    public maxTiltDeg = 35,
    private kp = 6,
  ) {}

  /**
   * @param tiltX бажаний тангаж (+ ніс угору), нормовано [-1, 1]
   * @param tiltY бажаний крен (+ вправо), нормовано [-1, 1]
   */
  compute(drone: Drone, tiltPitch: number, tiltRoll: number): { pitch: number; roll: number } {
    const e = quatToEuler(drone.state.orientation)
    const targetPitch = clamp(tiltPitch, -1, 1) * this.maxTiltDeg
    const targetRoll = clamp(tiltRoll, -1, 1) * this.maxTiltDeg

    const pitchRate = clamp(
      (targetPitch - radToDeg(e.pitch)) * this.kp,
      -maxRate(this.spec.rates.pitch),
      maxRate(this.spec.rates.pitch),
    )
    const rollRate = clamp(
      (targetRoll - radToDeg(e.roll)) * this.kp,
      -maxRate(this.spec.rates.roll),
      maxRate(this.spec.rates.roll),
    )

    return {
      pitch: stickForRate(pitchRate, this.spec.rates.pitch),
      roll: stickForRate(rollRate, this.spec.rates.roll),
    }
  }

  apply(drone: Drone, input: ControlInput, tiltPitch: number, tiltRoll: number): ControlInput {
    const { pitch, roll } = this.compute(drone, tiltPitch, tiltRoll)
    return { ...input, pitch, roll }
  }
}
