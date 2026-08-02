import { clamp, v3, vlen, vscale, type Vec3 } from './math'
import type { Environment } from './types'

/** Гладкий детермінований 1D-шум: сума несумірних синусів. Без Math.random. */
export function smoothNoise(t: number, seed: number): number {
  const a = Math.sin(t * 0.7 + seed * 1.13)
  const b = Math.sin(t * 1.9 + seed * 2.71)
  const c = Math.sin(t * 4.3 + seed * 0.37)
  return (a * 0.6 + b * 0.3 + c * 0.1)
}

/**
 * Вітер у точці: сталий + пориви + турбулентність.
 * Біля землі вітер слабший (профіль примежового шару) — тому низько летіти спокійніше.
 */
export function windAt(env: Environment, altitude: number, time: number): Vec3 {
  const shear = clamp(0.35 + 0.65 * Math.min(altitude / 40, 1), 0, 1)
  const base = vscale(env.wind, shear)
  if (env.gustStrength <= 0 && env.turbulence <= 0) return base

  const gust = env.gustStrength * shear
  const turb = env.turbulence * (1 + 0.8 * (1 - shear)) // біля перешкод трясе більше
  return {
    x: base.x + gust * smoothNoise(time * 0.35, 11) + turb * smoothNoise(time * 3.1, 23),
    y: base.y + gust * smoothNoise(time * 0.35, 37) + turb * smoothNoise(time * 3.1, 41),
    z: base.z + gust * 0.4 * smoothNoise(time * 0.5, 53) + turb * smoothNoise(time * 3.7, 59),
  }
}

/**
 * Квадратичний анізотропний опір у системі тіла.
 * @param velBody швидкість відносно повітря, у системі тіла
 * @param areaXY Cd*A у горизонтальній площині тіла (м²), з урахуванням навантаження
 * @param areaZ  Cd*A вздовж осі тяги
 */
export function dragForceBody(velBody: Vec3, areaXY: number, areaZ: number, rho: number): Vec3 {
  const q = 0.5 * rho
  const speed = vlen(velBody)
  if (speed < 1e-6) return v3()
  return {
    x: -q * areaXY * Math.abs(velBody.x) * velBody.x,
    y: -q * areaXY * Math.abs(velBody.y) * velBody.y,
    z: -q * areaZ * Math.abs(velBody.z) * velBody.z,
  }
}

/**
 * Пропвош: при швидкому зниженні дрон падає у власний збурений потік.
 * Дає рвані моменти по roll/pitch — та сама тряска, що лякає на спуску.
 */
export function propwashTorque(
  verticalSpeed: number,
  throttle: number,
  tuneQuality: number,
  time: number,
): Vec3 {
  const descent = clamp(-verticalSpeed / 8, 0, 1)
  if (descent <= 0) return v3()
  const amp = descent * clamp(throttle, 0, 1) * (1.4 - clamp(tuneQuality, 0.2, 1)) * 0.9
  return {
    x: amp * smoothNoise(time * 9.1, 71),
    y: amp * smoothNoise(time * 8.3, 83),
    z: amp * 0.3 * smoothNoise(time * 7.7, 97),
  }
}
