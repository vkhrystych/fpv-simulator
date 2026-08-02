import { clamp } from './math'
import type { RateCurve } from './types'

/**
 * RC-крива Betaflight (rcRate / superRate / expo).
 * Вхід — стік [-1, 1], вихід — цільова кутова швидкість у град/с.
 */
export function applyRates(stick: number, curve: RateCurve): number {
  const x = clamp(stick, -1, 1)
  const { rcRate, superRate, expo } = curve

  // expo: пом'якшує центр, не чіпаючи краї
  const shaped = x * Math.abs(x) ** 3 * expo + x * (1 - expo)
  const abs = Math.min(Math.abs(shaped), 0.999)

  let rate = 200 * rcRate * shaped
  if (superRate > 0) {
    // superRate «загинає» краї вгору
    const factor = 1 / clamp(1 - abs * superRate, 0.01, 1)
    rate *= factor
  }
  return rate
}

/** Максимальна кутова швидкість кривої (град/с) — для HUD і тестів. */
export const maxRate = (curve: RateCurve): number => applyRates(1, curve)

/**
 * Обернена крива: який стік дасть задану кутову швидкість.
 * Крива монотонна, тому достатньо бісекції. Потрібна для ANGLE-режиму,
 * який керує кутом, а не швидкістю, але мусить говорити з тим самим входом.
 */
export function stickForRate(targetRate: number, curve: RateCurve): number {
  const limit = maxRate(curve)
  if (targetRate >= limit) return 1
  if (targetRate <= -limit) return -1
  let lo = -1
  let hi = 1
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (applyRates(mid, curve) < targetRate) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

export const degToRad = (d: number): number => (d * Math.PI) / 180
export const radToDeg = (r: number): number => (r * 180) / Math.PI
