import { describe, it, expect } from 'vitest'
import { mix, groundEffect, stepMotors, thrustCoefficient, motorThrust, NOMINAL_RPM } from '../src/flight/motors'
import { applyRates, maxRate } from '../src/flight/rates'
import { getDrone } from '../src/drones'

// Порядок моторів: 0 FR, 1 RR, 2 RL, 3 FL
const FR = 0
const RR = 1
const RL = 2
const FL = 3

describe('мікшер', () => {
  it('нейтраль: усі мотори рівні газу', () => {
    const { commands } = mix(0.5, 0, 0, 0)
    for (const c of commands) expect(c).toBeCloseTo(0.5, 6)
  })

  it('крен вправо → більше тяги на лівих моторах', () => {
    const { commands } = mix(0.5, 0.4, 0, 0)
    expect(commands[FL]).toBeGreaterThan(commands[FR])
    expect(commands[RL]).toBeGreaterThan(commands[RR])
    expect(commands[FL]).toBeCloseTo(commands[RL], 6)
  })

  it('ніс угору → більше тяги на передніх моторах', () => {
    const { commands } = mix(0.5, 0, 0.4, 0)
    expect(commands[FR]).toBeGreaterThan(commands[RR])
    expect(commands[FL]).toBeGreaterThan(commands[RL])
  })

  it('рискання вправо → більше тяги на діагоналі CCW', () => {
    const { commands } = mix(0.5, 0, 0, 0.4)
    // yaw+ = ніс вправо → навантажуємо мотори зі spin = −1 (FR і RL)
    expect(commands[FR]).toBeGreaterThan(commands[RR])
    expect(commands[RL]).toBeGreaterThan(commands[FL])
  })

  it('airmode: на нульовому газі керування лишається', () => {
    const { commands } = mix(0, 0.5, 0, 0)
    const spread = Math.max(...commands) - Math.min(...commands)
    expect(spread).toBeGreaterThan(0.3)
    for (const c of commands) {
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThanOrEqual(1)
    }
  })

  it('насичення стискає команди, а не ріже їх', () => {
    const { commands, saturation } = mix(0.5, 1, 1, 1)
    expect(saturation).toBeGreaterThan(0)
    const spread = Math.max(...commands) - Math.min(...commands)
    expect(spread).toBeLessThanOrEqual(1.000001)
  })

  it('команди завжди в межах [0,1] на випадкових входах', () => {
    for (let i = 0; i < 500; i++) {
      const t = (i % 11) / 10
      const r = ((i * 7) % 21) / 10 - 1
      const p = ((i * 13) % 21) / 10 - 1
      const y = ((i * 17) % 21) / 10 - 1
      for (const c of mix(t, r, p, y).commands) {
        expect(c).toBeGreaterThanOrEqual(0)
        expect(c).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('мотори', () => {
  const spec = getDrone('trainer-7')

  it('RPM іде до цілі з лагом, а не миттєво', () => {
    const rpm = [0, 0, 0, 0]
    stepMotors(rpm, [1, 1, 1, 1], spec, 1, 0.002)
    expect(rpm[0]).toBeGreaterThan(0)
    expect(rpm[0]).toBeLessThan(NOMINAL_RPM * 0.2)
  })

  it('за 5 сталих часу RPM майже досягає цілі', () => {
    const rpm = [0, 0, 0, 0]
    const steps = Math.round((spec.motorTau * 5) / 0.002)
    for (let i = 0; i < steps; i++) stepMotors(rpm, [1, 1, 1, 1], spec, 1, 0.002)
    expect(rpm[0]).toBeGreaterThan(NOMINAL_RPM * 0.98)
  })

  it('в’ялий дрон розганяє мотори повільніше за різкий', () => {
    const heavy = getDrone('heavy-10')
    const a = [0, 0, 0, 0]
    const b = [0, 0, 0, 0]
    for (let i = 0; i < 15; i++) {
      stepMotors(a, [1, 1, 1, 1], spec, 1, 0.002)
      stepMotors(b, [1, 1, 1, 1], heavy, 1, 0.002)
    }
    expect(a[0]).toBeGreaterThan(b[0] * 1.5)
  })

  it('просадка напруги знижує стелю обертів', () => {
    const full = [0, 0, 0, 0]
    const sagged = [0, 0, 0, 0]
    for (let i = 0; i < 2000; i++) {
      stepMotors(full, [1, 1, 1, 1], spec, 1, 0.002)
      stepMotors(sagged, [1, 1, 1, 1], spec, 0.85, 0.002)
    }
    expect(sagged[0]).toBeLessThan(full[0] * 0.9)
  })

  it('сумарна тяга на повних обертах = maxThrustN', () => {
    const kT = thrustCoefficient(spec)
    const total = 4 * motorThrust(NOMINAL_RPM, kT)
    expect(total).toBeCloseTo(spec.maxThrustN, 6)
  })

  it('тяга квадратична за обертами', () => {
    const kT = thrustCoefficient(spec)
    const half = motorThrust(NOMINAL_RPM / 2, kT)
    const full = motorThrust(NOMINAL_RPM, kT)
    expect(full / half).toBeCloseTo(4, 6)
  })
})

describe('ground effect', () => {
  const R = 0.089
  it('біля землі дає приріст тяги', () => {
    expect(groundEffect(R * 0.6, R)).toBeGreaterThan(1.1)
  })
  it('затухає з висотою', () => {
    expect(groundEffect(3, R)).toBeLessThan(1.001)
  })
  it('монотонно спадає і обмежений', () => {
    let prev = Infinity
    for (let z = 0; z < 2; z += 0.02) {
      const g = groundEffect(z, R)
      expect(g).toBeLessThanOrEqual(1.34)
      expect(g).toBeLessThanOrEqual(prev + 1e-9)
      prev = g
    }
  })
})

describe('rates', () => {
  const curve = getDrone('trainer-7').rates.roll

  it('нульовий стік — нульова швидкість', () => {
    expect(applyRates(0, curve)).toBe(0)
  })

  it('монотонна і непарна', () => {
    let prev = -Infinity
    for (let x = -1; x <= 1.0001; x += 0.05) {
      const r = applyRates(x, curve)
      expect(r).toBeGreaterThan(prev)
      expect(applyRates(-x, curve)).toBeCloseTo(-r, 6)
      prev = r
    }
  })

  it('максимальна швидкість тренувального дрона у робочому діапазоні', () => {
    const m = maxRate(curve)
    expect(m).toBeGreaterThan(400)
    expect(m).toBeLessThan(1200)
  })

  it('expo пом’якшує центр стіка', () => {
    const soft = applyRates(0.25, { rcRate: 1, superRate: 0, expo: 0.6 })
    const linear = applyRates(0.25, { rcRate: 1, superRate: 0, expo: 0 })
    expect(soft).toBeLessThan(linear)
  })

  it('важкий дрон повільніший за тренувальний на повному стіку', () => {
    expect(maxRate(getDrone('heavy-10').rates.roll)).toBeLessThan(maxRate(curve))
  })

  it('стік за межами діапазону не дає більше за максимум', () => {
    expect(applyRates(5, curve)).toBeCloseTo(maxRate(curve), 6)
  })
})
