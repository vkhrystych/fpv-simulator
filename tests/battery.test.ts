import { describe, it, expect } from 'vitest'
import { Battery, restingCellVoltage, CELL_FULL, CELL_EMPTY } from '../src/flight/battery'
import { makeDrone, simulate, altitudeHold, hoverInput, tiltFlight, angleCtrl } from './helpers'
import { getDrone } from '../src/drones'
import { neutralInput } from '../src/flight/types'
import { windAt, dragForceBody, smoothNoise, propwashTorque } from '../src/flight/aero'
import { defaultEnvironment } from '../src/flight/types'
import { quatToEuler, v3, vlen } from '../src/flight/math'

describe('акумулятор', () => {
  const spec = getDrone('mid-8')

  it('стартує повним і розряджається', () => {
    const b = new Battery(spec.battery, spec.propRadius)
    expect(b.stateOfCharge).toBe(1)
    expect(b.voltage).toBeCloseTo(spec.battery.cells * CELL_FULL, 6)
    for (let i = 0; i < 5000; i++) b.step([4, 4, 4, 4], 0.002)
    expect(b.mahUsed).toBeGreaterThan(0)
    expect(b.stateOfCharge).toBeLessThan(1)
  })

  it('крива напруги спадна і в межах банки', () => {
    let prev = Infinity
    for (let soc = 1; soc >= 0; soc -= 0.02) {
      const v = restingCellVoltage(soc)
      expect(v).toBeLessThanOrEqual(CELL_FULL + 1e-9)
      expect(v).toBeGreaterThanOrEqual(CELL_EMPTY - 1e-9)
      expect(v).toBeLessThanOrEqual(prev + 1e-9)
      prev = v
    }
  })

  it('потужність росте як T^1.5: подвійна тяга — більш ніж подвійний струм', () => {
    const a = new Battery(spec.battery, spec.propRadius)
    const b = new Battery(spec.battery, spec.propRadius)
    a.step([5, 5, 5, 5], 0.002)
    b.step([10, 10, 10, 10], 0.002)
    expect(b.current).toBeGreaterThan(a.current * 2)
  })

  it('просадка під навантаженням, відновлення без нього', () => {
    const b = new Battery(spec.battery, spec.propRadius)
    b.step([15, 15, 15, 15], 0.002)
    const underLoad = b.voltage
    b.step([0, 0, 0, 0], 0.002)
    expect(b.voltage).toBeGreaterThan(underLoad)
  })

  it('великий гвинт ефективніший: та сама тяга — менший струм', () => {
    const small = new Battery(spec.battery, 0.089)
    const big = new Battery(spec.battery, 0.127)
    small.step([12, 12, 12, 12], 0.002)
    big.step([12, 12, 12, 12], 0.002)
    expect(big.current).toBeLessThan(small.current)
  })

  it('порожній акумулятор глушить мотори', () => {
    const d = makeDrone('trainer-7')
    d.battery.mahUsed = d.spec.battery.capacityMah
    expect(d.battery.empty).toBe(true)
    simulate(d, 0.2, hoverInput(d, { throttle: 1 }))
    expect(d.telemetry.thrustN).toBeCloseTo(0, 3)
  })

  it('час висіння важкого дрона з БК — одиниці хвилин, а не години', () => {
    const d = makeDrone('heavy-10', 'heavy')
    simulate(d, 20, () => altitudeHold(d, 60))
    const mahPerSec = d.battery.mahUsed / 20
    const minutes = d.spec.battery.capacityMah / mahPerSec / 60
    expect(minutes).toBeGreaterThan(3)
    expect(minutes).toBeLessThan(15)
  })

  it('тренувальний дрон літає довше за навантажений важкий', () => {
    const light = makeDrone('trainer-7', 'none')
    simulate(light, 10, () => altitudeHold(light, 60))
    const heavy = makeDrone('heavy-10', 'heavy')
    simulate(heavy, 10, () => altitudeHold(heavy, 60))
    const lightMinutes = light.spec.battery.capacityMah / (light.battery.mahUsed / 10) / 60
    const heavyMinutes = heavy.spec.battery.capacityMah / (heavy.battery.mahUsed / 10) / 60
    expect(lightMinutes).toBeGreaterThan(heavyMinutes * 1.5)
  })

  it('просадка наприкінці польоту: той самий газ дає менше тяги', () => {
    const d = makeDrone('mid-8', 'medium')
    const input = { ...neutralInput(), armed: true, throttle: 0.8 }
    simulate(d, 1, input)
    const early = d.telemetry.thrustN
    d.battery.mahUsed = d.spec.battery.capacityMah * 0.85
    simulate(d, 1, input)
    expect(d.telemetry.thrustN).toBeLessThan(early * 0.92)
  })
})

describe('аеродинаміка та вітер', () => {
  it('шум детермінований і обмежений', () => {
    for (let t = 0; t < 50; t += 0.37) {
      const a = smoothNoise(t, 7)
      expect(a).toBe(smoothNoise(t, 7))
      expect(Math.abs(a)).toBeLessThanOrEqual(1.0001)
    }
  })

  it('вітер слабший біля землі, ніж на висоті', () => {
    const env = { ...defaultEnvironment(), wind: v3(8, 0, 0) }
    expect(vlen(windAt(env, 2, 0))).toBeLessThan(vlen(windAt(env, 80, 0)))
  })

  it('без поривів вітер сталий у часі', () => {
    const env = { ...defaultEnvironment(), wind: v3(5, 0, 0) }
    expect(windAt(env, 50, 0)).toEqual(windAt(env, 50, 99))
  })

  it('пориви змінюють вітер у часі', () => {
    const env = { ...defaultEnvironment(), wind: v3(5, 0, 0), gustStrength: 3 }
    const samples = [0, 1, 2, 3, 4].map((t) => windAt(env, 50, t).x)
    expect(new Set(samples).size).toBeGreaterThan(3)
  })

  it('опір завжди протилежний швидкості', () => {
    for (const v of [v3(10, 0, 0), v3(-4, 7, -3), v3(0, 0, 12)]) {
      const f = dragForceBody(v, 0.04, 0.06, 1.225)
      expect(f.x * v.x).toBeLessThanOrEqual(0)
      expect(f.y * v.y).toBeLessThanOrEqual(0)
      expect(f.z * v.z).toBeLessThanOrEqual(0)
    }
  })

  it('опір квадратичний за швидкістю', () => {
    const slow = dragForceBody(v3(0, 5, 0), 0.04, 0.06, 1.225)
    const fast = dragForceBody(v3(0, 10, 0), 0.04, 0.06, 1.225)
    expect(Math.abs(fast.y) / Math.abs(slow.y)).toBeCloseTo(4, 6)
  })

  it('пропвош лише на зниженні і сильніший при поганому тюні', () => {
    expect(vlen(propwashTorque(5, 0.5, 1, 1))).toBe(0)
    const good = vlen(propwashTorque(-8, 0.5, 1, 1.234))
    const bad = vlen(propwashTorque(-8, 0.5, 0.6, 1.234))
    expect(bad).toBeGreaterThan(good)
  })

  it('боковий вітер зносить дрон із точки зависання', () => {
    const calm = makeDrone('light-7', 'bulky')
    simulate(calm, 6, () => altitudeHold(calm, 60))
    const windy = makeDrone('light-7', 'bulky', { wind: v3(9, 0, 0) })
    simulate(windy, 6, () => altitudeHold(windy, 60))
    expect(windy.state.position.x).toBeGreaterThan(calm.state.position.x + 10)
  })

  it('об’ємний БК зносить сильніше, коли пілот тримає горизонт', () => {
    // без утримання горизонту об’ємний БК «флюгерує» проти вітру (опір нижче ЦМ
    // нахиляє дрон назустріч потоку) і знос частково гаситься сам.
    // Пілот же тримає рівно — і тоді велика площа з’їдає позицію напряму.
    const drift = (payloadId: string) => {
      const d = makeDrone('light-7', payloadId, { wind: v3(9, 0, 0) })
      const c = angleCtrl(d, 35)
      simulate(d, 6, () => tiltFlight(d, c, 60, 0, 0))
      return d.state.position.x
    }
    expect(drift('bulky')).toBeGreaterThan(drift('medium') * 1.3)
  })

  it('маятник флюгерує дрон проти вітру — нахил спрямований назустріч потоку', () => {
    const d = makeDrone('light-7', 'bulky', { wind: v3(9, 0, 0) })
    simulate(d, 4, () => altitudeHold(d, 60))
    // вітер жене в +x, дрон має нахилитися в −x (лівий борт униз = від’ємний крен)
    expect(quatToEuler(d.state.orientation).roll).toBeLessThan(0)
  })
})
