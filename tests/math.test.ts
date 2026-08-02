import { describe, it, expect } from 'vitest'
import {
  qIntegrate,
  qFromAxisAngle,
  qrotate,
  qrotateInv,
  quatIdentity,
  quatToEuler,
  v3,
  vcross,
  vlen,
  makeRng,
} from '../src/flight/math'

describe('math', () => {
  it('обертає вектор навколо Z на 90°', () => {
    const q = qFromAxisAngle(v3(0, 0, 1), Math.PI / 2)
    const r = qrotate(q, v3(1, 0, 0))
    expect(r.x).toBeCloseTo(0, 6)
    expect(r.y).toBeCloseTo(1, 6)
    expect(r.z).toBeCloseTo(0, 6)
  })

  it('qrotateInv — точна обернена до qrotate', () => {
    const q = qFromAxisAngle(v3(0.3, -0.5, 0.8), 1.1)
    const v = v3(2, -3, 5)
    const back = qrotateInv(q, qrotate(q, v))
    expect(back.x).toBeCloseTo(v.x, 6)
    expect(back.y).toBeCloseTo(v.y, 6)
    expect(back.z).toBeCloseTo(v.z, 6)
  })

  it('інтегрування кутової швидкості зберігає норму на 10к кроків', () => {
    let q = quatIdentity()
    const w = v3(3, -2, 5)
    for (let i = 0; i < 10000; i++) q = qIntegrate(q, w, 1 / 500)
    const n = Math.sqrt(q.x ** 2 + q.y ** 2 + q.z ** 2 + q.w ** 2)
    expect(n).toBeCloseTo(1, 9)
  })

  it('повний оберт за 2π повертає в початкове положення', () => {
    let q = quatIdentity()
    const w = v3(0, 0, 2 * Math.PI) // 1 об/с
    for (let i = 0; i < 500; i++) q = qIntegrate(q, w, 1 / 500)
    const r = qrotate(q, v3(1, 0, 0))
    expect(r.x).toBeCloseTo(1, 5)
    expect(r.y).toBeCloseTo(0, 5)
  })

  it('euler: тангаж вгору дає додатний pitch, крен вправо — додатний roll', () => {
    const up = qFromAxisAngle(v3(1, 0, 0), 0.3) // + навколо X = ніс вгору
    expect(quatToEuler(up).pitch).toBeCloseTo(0.3, 4)
    const right = qFromAxisAngle(v3(0, 1, 0), 0.4) // + навколо Y = правий борт униз
    expect(quatToEuler(right).roll).toBeCloseTo(0.4, 4)
  })

  it('yaw — компасний курс: північ 0°, схід +90°, доворот управо збільшує', () => {
    expect(quatToEuler(quatIdentity()).yaw).toBeCloseTo(0, 6)
    // рискання вправо = від’ємний оберт навколо +Z (правило правої руки)
    const east = qFromAxisAngle(v3(0, 0, 1), -Math.PI / 2)
    expect(quatToEuler(east).yaw).toBeCloseTo(Math.PI / 2, 6)
    const west = qFromAxisAngle(v3(0, 0, 1), Math.PI / 2)
    expect(quatToEuler(west).yaw).toBeCloseTo(-Math.PI / 2, 6)
  })

  it('курс узгоджений із наведенням: atan2(dx, dy) дає той самий кут', () => {
    // ціль на північному сході → курс на неї +45°
    const bearing = Math.atan2(100, 100)
    const facing = qFromAxisAngle(v3(0, 0, 1), -bearing)
    expect(quatToEuler(facing).yaw).toBeCloseTo(bearing, 6)
  })

  it('векторний добуток правобічний', () => {
    const c = vcross(v3(1, 0, 0), v3(0, 1, 0))
    expect(c.z).toBeCloseTo(1, 9)
    expect(vlen(c)).toBeCloseTo(1, 9)
  })

  it('rng детермінований і в [0,1)', () => {
    const a = makeRng(42)
    const b = makeRng(42)
    for (let i = 0; i < 100; i++) {
      const x = a()
      expect(x).toBe(b())
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
  })
})
