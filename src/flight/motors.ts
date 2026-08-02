import { clamp, smoothing } from './math'
import { MOTOR_LAYOUT, type DroneSpec } from './types'

/** Номінальні обороти, до яких нормовано kT. Значення довільне — важливі лише пропорції. */
export const NOMINAL_RPM = 30000

export interface MixerOutput {
  /** команда на кожен мотор [0, 1] */
  commands: number[]
  /** скільки авторитету з'їв airmode-скейлінг, 0..1 (для дебагу) */
  saturation: number
}

/**
 * Мікшер X-конфігурації.
 * roll+  = вправо  → більше тяги на ЛІВИХ моторах (−x)
 * pitch+ = ніс вгору → більше тяги на ПЕРЕДНІХ моторах (+y)
 * yaw+   = ніс вправо → більше тяги на моторах, що крутяться CCW (−spin)
 */
export function mix(throttle: number, roll: number, pitch: number, yaw: number): MixerOutput {
  const raw = MOTOR_LAYOUT.map((m) => -roll * m.x + pitch * m.y - yaw * m.spin)

  const max = Math.max(...raw)
  const min = Math.min(...raw)
  const range = max - min

  // airmode: якщо розмах команд не влазить у [0,1] — стискаємо, а не ріжемо,
  // щоб на нульовому газі дрон не втрачав керування
  let scale = 1
  if (range > 1) scale = 1 / range

  const scaled = raw.map((r) => r * scale)
  const scaledMax = Math.max(...scaled)
  const scaledMin = Math.min(...scaled)

  // зсуваємо газ так, щоб жоден мотор не вийшов за межі
  const t = clamp(throttle, 0, 1)
  const offset = clamp(t, -scaledMin, 1 - scaledMax)

  return {
    commands: scaled.map((s) => clamp(offset + s, 0, 1)),
    saturation: 1 - scale,
  }
}

/**
 * Обертає моторами. RPM іде до цілі через лаг motorTau — саме це відрізняє
 * «різкий» 7" від «баржі» 13" сильніше за будь-який інший параметр.
 */
export function stepMotors(
  rpm: number[],
  commands: number[],
  spec: DroneSpec,
  voltageRatio: number,
  dt: number,
): void {
  const k = smoothing(dt, spec.motorTau)
  // просадка напруги знижує досяжні оберти майже лінійно
  const ceiling = NOMINAL_RPM * clamp(voltageRatio, 0, 1.1)
  for (let i = 0; i < rpm.length; i++) {
    const target = commands[i] * ceiling
    rpm[i] += (target - rpm[i]) * k
  }
}

/** Коефіцієнт тяги: T = kT * rpm², калібрований під maxThrustN на 4 мотори. */
export const thrustCoefficient = (spec: DroneSpec): number =>
  spec.maxThrustN / 4 / (NOMINAL_RPM * NOMINAL_RPM)

export const motorThrust = (rpm: number, kT: number): number => kT * rpm * rpm

/**
 * Ground effect: біля землі тяга зростає. Класична модель T/T∞ = 1/(1 − (R/4z)²)
 * з обмеженням, щоб не вибухнути при z → 0.
 */
export function groundEffect(altitude: number, propRadius: number): number {
  const z = Math.max(altitude, propRadius * 0.5)
  const ratio = propRadius / (4 * z)
  const gain = 1 / (1 - clamp(ratio * ratio, 0, 0.25))
  return clamp(gain, 1, 1.34)
}
