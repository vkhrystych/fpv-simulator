import { describe, it, expect } from 'vitest'
import { makeDrone, simulate, ratesDeg, altitudeHold, hoverInput, tiltFlight, angleCtrl } from './helpers'
import { neutralInput } from '../src/flight/types'
import { CRASH_SPEED, PHYSICS_DT } from '../src/flight/drone'
import { applyRates, radToDeg } from '../src/flight/rates'
import { quatToEuler, v3 } from '../src/flight/math'

describe('базовий політ', () => {
  it('незаармлений дрон не злітає при повному газі', () => {
    const d = makeDrone()
    const before = d.state.position.z
    simulate(d, 1, { ...neutralInput(), throttle: 1, armed: false })
    expect(d.state.position.z).toBeLessThan(before)
    expect(d.telemetry.thrustN).toBeCloseTo(0, 3)
  })

  it('повний газ дає підйом, нульовий — падіння', () => {
    const up = makeDrone()
    simulate(up, 1.5, { ...neutralInput(), throttle: 1, armed: true })
    expect(up.state.velocity.z).toBeGreaterThan(5)

    const down = makeDrone()
    simulate(down, 1, { ...neutralInput(), throttle: 0, armed: true })
    expect(down.state.velocity.z).toBeLessThan(-5)
  })

  it('дрон не зависає сам: на газі зависання без корекції він майже тримає висоту', () => {
    const d = makeDrone()
    const start = d.state.position.z
    simulate(d, 2, hoverInput(d))
    // просадка акумулятора помалу тягне вниз — це і є «газ тримає пілот»
    expect(Math.abs(d.state.position.z - start)).toBeLessThan(4)
  })

  it('утримання висоти автопілотом стабільне 10 с', () => {
    const d = makeDrone()
    let maxDev = 0
    simulate(d, 10, () => altitudeHold(d, 50), (dd) => {
      maxDev = Math.max(maxDev, Math.abs(dd.state.position.z - 50))
    })
    expect(maxDev).toBeLessThan(2)
  })

  it('вертикальна швидкість у вільному падінні виходить на термінальну', () => {
    const d = makeDrone()
    d.reset(v3(0, 0, 3000))
    simulate(d, 20, { ...neutralInput(), armed: true, throttle: 0 })
    const vz = d.state.velocity.z
    expect(vz).toBeLessThan(-10)
    expect(vz).toBeGreaterThan(-30) // опір є, це не вакуум
  })
})

describe('керування', () => {
  it('крен вправо піднімає лівий борт: додатний темп крену', () => {
    const d = makeDrone()
    simulate(d, 0.5, () => altitudeHold(d, 50, { roll: 0.6 }))
    expect(ratesDeg(d).roll).toBeGreaterThan(50)
    expect(quatToEuler(d.state.orientation).roll).toBeGreaterThan(0)
  })

  it('тангаж уперед опускає ніс', () => {
    const d = makeDrone()
    simulate(d, 0.4, () => altitudeHold(d, 50, { pitch: -0.6 }))
    expect(ratesDeg(d).pitch).toBeLessThan(-50)
  })

  it('рискання вправо повертає ніс вправо', () => {
    const d = makeDrone()
    simulate(d, 0.6, () => altitudeHold(d, 50, { yaw: 0.6 }))
    expect(ratesDeg(d).yaw).toBeGreaterThan(40)
  })

  it('осі не перемішуються: чистий крен майже не дає тангажу і рискання', () => {
    const d = makeDrone()
    simulate(d, 0.5, () => altitudeHold(d, 50, { roll: 0.7 }))
    const r = ratesDeg(d)
    expect(Math.abs(r.pitch)).toBeLessThan(Math.abs(r.roll) * 0.12)
    expect(Math.abs(r.yaw)).toBeLessThan(Math.abs(r.roll) * 0.12)
  })

  it('вихід PID виходить на задану кривою швидкість (похибка < 10%)', () => {
    const d = makeDrone()
    const target = applyRates(0.5, d.spec.rates.roll)
    simulate(d, 1.2, () => altitudeHold(d, 50, { roll: 0.5 }))
    expect(ratesDeg(d).roll).toBeGreaterThan(target * 0.9)
    expect(ratesDeg(d).roll).toBeLessThan(target * 1.1)
  })

  it('перерегулювання є, але контрольоване (< 25%)', () => {
    const d = makeDrone()
    const target = applyRates(0.5, d.spec.rates.roll)
    let peak = 0
    simulate(d, 1, () => altitudeHold(d, 50, { roll: 0.5 }), (dd) => {
      peak = Math.max(peak, ratesDeg(dd).roll)
    })
    expect(peak).toBeGreaterThan(target)
    expect(peak / target - 1).toBeLessThan(0.25)
  })

  it('ACRO не самовирівнюється: після імпульсу крен лишається', () => {
    const d = makeDrone()
    simulate(d, 0.25, () => altitudeHold(d, 50, { roll: 0.8 }))
    const tilted = quatToEuler(d.state.orientation).roll
    simulate(d, 1.5, () => ({ ...neutralInput(), armed: true, throttle: d.hoverThrottle }))
    const after = quatToEuler(d.state.orientation).roll
    // аеродинаміка трохи вирівнює (маятник), але це не auto-level:
    // дрон мусить лишитися суттєво накрененим
    expect(Math.abs(after)).toBeGreaterThan(Math.abs(tilted) * 0.75)
    expect(Math.abs(after)).toBeGreaterThan(0.3)
  })

  it('PID не розганяється: 30 с агресивних стіків без вибуху швидкостей', () => {
    const d = makeDrone()
    simulate(d, 30, (t) =>
      altitudeHold(d, 100, {
        roll: Math.sin(t * 7),
        pitch: Math.cos(t * 5),
        yaw: Math.sin(t * 3),
      }),
    )
    const w = ratesDeg(d)
    expect(Number.isFinite(w.roll)).toBe(true)
    expect(Math.abs(w.roll)).toBeLessThan(1500)
    expect(Math.abs(w.pitch)).toBeLessThan(1500)
    expect(Math.abs(w.yaw)).toBeLessThan(1000)
    expect(Number.isFinite(d.state.position.z)).toBe(true)
  })

  it('ANGLE-режим приводить дрон до заданого кута і тримає', () => {
    const d = makeDrone()
    d.reset(v3(0, 0, 100))
    const c = angleCtrl(d, 30)
    simulate(d, 4, () => tiltFlight(d, c, 100, 0, 1))
    const roll = radToDeg(quatToEuler(d.state.orientation).roll)
    expect(roll).toBeGreaterThan(26)
    expect(roll).toBeLessThan(34)
  })
})

describe('детермінізм', () => {
  it('однакові входи → побітово однаковий стан', () => {
    const run = () => {
      const d = makeDrone('mid-8', 'medium')
      simulate(d, 5, (t) => altitudeHold(d, 60, { roll: Math.sin(t * 4), yaw: Math.cos(t * 2) }))
      return d.state
    }
    const a = run()
    const b = run()
    expect(a.position).toEqual(b.position)
    expect(a.velocity).toEqual(b.velocity)
    expect(a.orientation).toEqual(b.orientation)
    expect(a.batteryMahUsed).toBe(b.batteryMahUsed)
  })

  it('update() з рваними кадрами дає той самий результат, що й фіксовані кроки', () => {
    const fixed = makeDrone()
    simulate(fixed, 2, hoverInput(fixed, { roll: 0.3 }))

    const framed = makeDrone()
    const input = hoverInput(framed, { roll: 0.3 })
    let t = 0
    // імітуємо нерівний фреймрейт 30–120 FPS
    const frames = [0.008, 0.033, 0.016, 0.012, 0.025]
    let i = 0
    while (t < 2 - 1e-9) {
      const dt = Math.min(frames[i++ % frames.length], 2 - t)
      framed.update(input, dt)
      t += dt
    }
    expect(framed.state.time).toBeCloseTo(fixed.state.time, 6)
    expect(framed.state.position.z).toBeCloseTo(fixed.state.position.z, 6)
  })

  it('крок фізики фіксований', () => {
    const d = makeDrone()
    d.step(hoverInput(d))
    expect(d.state.time).toBeCloseTo(PHYSICS_DT, 12)
  })
})

describe('земля', () => {
  it('м’яка посадка не ламає дрон', () => {
    const d = makeDrone()
    d.reset(v3(0, 0, 1.5))
    // 0.7 від газу зависання: навіть з ground effect (макс. +34%) тяги не вистачить
    // відірватися назад, тому дрон лишається на землі
    simulate(d, 3, () => ({ ...neutralInput(), armed: true, throttle: d.hoverThrottle * 0.7 }))
    expect(d.state.crashed).toBe(false)
    expect(d.state.landed).toBe(true)
  })

  it('свіжий акумулятор дає більше тяги, ніж передбачає hoverThrottle', () => {
    // 4.2 В/банку проти номінальних 3.7 — тому на старті дрон «пунчить»,
    // а наприкінці польоту той самий газ уже не тримає
    const d = makeDrone()
    simulate(d, 0.6, hoverInput(d))
    expect(d.state.velocity.z).toBeGreaterThan(0)
  })

  it('удар об землю на швидкості = краш', () => {
    const d = makeDrone()
    d.reset(v3(0, 0, 60))
    simulate(d, 6, { ...neutralInput(), armed: true, throttle: 0 })
    expect(d.state.crashed).toBe(true)
  })

  it('після крашу фізика зупиняється', () => {
    const d = makeDrone()
    d.reset(v3(0, 0, 60))
    simulate(d, 6, { ...neutralInput(), armed: true, throttle: 0 })
    const snapshot = { ...d.state.position }
    simulate(d, 2, { ...neutralInput(), armed: true, throttle: 1 })
    expect(d.state.position).toEqual(snapshot)
  })

  it('поріг крашу відповідає CRASH_SPEED', () => {
    // стартуємо нижче за стійки, щоб контакт стався на першому ж кроці
    const soft = makeDrone()
    soft.reset(v3(0, 0, 0.05))
    soft.state.velocity = v3(0, 0, -(CRASH_SPEED - 1.5))
    soft.step({ ...neutralInput(), armed: true, throttle: 0 })
    expect(soft.state.crashed).toBe(false)

    const hard = makeDrone()
    hard.reset(v3(0, 0, 0.05))
    hard.state.velocity = v3(0, 0, -(CRASH_SPEED + 1.5))
    hard.step({ ...neutralInput(), armed: true, throttle: 0 })
    expect(hard.state.crashed).toBe(true)
  })

  it('ground effect: біля землі той самий газ дає більше тяги', () => {
    const low = makeDrone()
    low.reset(v3(0, 0, 0.1))
    const high = makeDrone()
    high.reset(v3(0, 0, 50))
    const inp = (d: typeof low) => ({ ...neutralInput(), armed: true, throttle: d.hoverThrottle })
    simulate(low, 0.2, inp(low))
    simulate(high, 0.2, inp(high))
    expect(low.telemetry.thrustN).toBeGreaterThan(high.telemetry.thrustN * 1.02)
  })

  it('рельєф не плоский: дрон сідає на схил, а не крізь нього', () => {
    const d = makeDrone('trainer-7', 'none', { groundHeight: (x) => 20 + x * 0.1 })
    d.reset(v3(100, 0, 60)) // земля тут = 30
    simulate(d, 5, () => ({ ...neutralInput(), armed: true, throttle: d.hoverThrottle * 0.8 }))
    expect(d.state.position.z).toBeGreaterThan(29.9)
  })
})
