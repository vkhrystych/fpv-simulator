import { describe, expect, it } from 'vitest'
import { ReplayRecorder } from '../src/game/replay'
import { Target } from '../src/game/targets'
import { DEFAULT_TERRAIN, Terrain } from '../src/level/terrain'
import { quatIdentity, v3 } from '../src/flight/math'

/**
 * Рекордер повтору: кільцевий буфер знімків польоту.
 * Рендерна половина (камера спостерігача, дим) — не тут: вона очевидна
 * оком і перевіряється скріншотами через probe.
 */

const terrain = new Terrain(DEFAULT_TERRAIN)
const makeTarget = () =>
  new Target({ id: 'tank', kind: 'target', vehicle: 'tank', position: [10, 20] }, terrain)

describe('запис повтору', () => {
  it('пише ~30 Гц незалежно від кадрової частоти', () => {
    const rec = new ReplayRecorder(8, 30)
    const target = makeTarget()
    for (let t = 0; t < 2; t += 1 / 240) rec.capture(t, v3(0, 0, 10), quatIdentity(), [target])
    const clip = rec.clip(10)
    expect(clip.length).toBeGreaterThan(50)
    expect(clip.length).toBeLessThan(70)
  })

  it('тримає лише хвіст запису', () => {
    const rec = new ReplayRecorder(3, 30)
    const target = makeTarget()
    for (let t = 0; t < 60; t += 1 / 30) rec.capture(t, v3(t, 0, 10), quatIdentity(), [target])
    const clip = rec.clip(100)
    // буфер обмежено трьома секундами, а не годиною польоту
    expect(clip[clip.length - 1].t - clip[0].t).toBeLessThanOrEqual(3.01)
  })

  it('clip перебазовує час на нуль і ріже задану довжину', () => {
    const rec = new ReplayRecorder(8, 30)
    const target = makeTarget()
    for (let t = 100; t < 106; t += 1 / 30) rec.capture(t, v3(t, 0, 10), quatIdentity(), [target])
    const clip = rec.clip(2)
    expect(clip[0].t).toBe(0)
    const dur = clip[clip.length - 1].t
    expect(dur).toBeGreaterThan(1.8)
    expect(dur).toBeLessThanOrEqual(2.01)
    for (let i = 1; i < clip.length; i++) expect(clip[i].t).toBeGreaterThan(clip[i - 1].t)
  })

  it('кадр — знімок, а не посилання: подальший рух цілі його не змінює', () => {
    const rec = new ReplayRecorder(8, 30)
    const target = makeTarget()
    rec.capture(0, v3(1, 2, 3), quatIdentity(), [target])
    target.position.x = 999
    target.destroyed = true
    const clip = rec.clip(10)
    // менш як 2 кадри повтору не буває — з одного нема що інтерполювати
    expect(clip).toHaveLength(0)
    rec.capture(1, v3(2, 2, 3), quatIdentity(), [target])
    const two = rec.clip(10)
    expect(two).toHaveLength(2)
    expect(two[0].targets[0].x).toBe(10)
    expect(two[0].targets[0].destroyed).toBe(false)
    expect(two[1].targets[0].x).toBe(999)
  })
})
