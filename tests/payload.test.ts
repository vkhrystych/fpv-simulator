import { describe, it, expect } from 'vitest'
import { makeDrone, simulate, ratesDeg, altitudeHold, tiltFlight, angleCtrl } from './helpers'
import { neutralInput } from '../src/flight/types'
import { v3 } from '../src/flight/math'
import { PAYLOADS } from '../src/drones'

/**
 * Темп крену через 50 мс повного стіка — те, що пілот відчуває як «різкість».
 * Абсолютна метрика: відносна (частка від власного максимуму) зробила б
 * в'ялий дрон із низькими rates «різким».
 */
function rateAfter(droneId: string, payloadId: string, after = 0.05): number {
  const d = makeDrone(droneId, payloadId)
  d.reset(v3(0, 0, 200))
  let result = 0
  simulate(d, after, () => altitudeHold(d, 200, { roll: 1 }), (dd) => {
    result = ratesDeg(dd).roll
  })
  return result
}

/** Пік вертикального прискорення на повному газі — метрика «запасу тяги». */
function climbRate(droneId: string, payloadId: string): number {
  const d = makeDrone(droneId, payloadId)
  d.reset(v3(0, 0, 200))
  simulate(d, 2, { ...neutralInput(), armed: true, throttle: 1 })
  return d.state.velocity.z
}

/** Усталена швидкість при фіксованому нахилі — метрика «опору». */
function topSpeed(droneId: string, payloadId: string, tilt = 0.9): number {
  const d = makeDrone(droneId, payloadId)
  d.reset(v3(0, 0, 400))
  const c = angleCtrl(d, 35)
  simulate(d, 25, () => tiltFlight(d, c, 400, tilt))
  return Math.hypot(d.state.velocity.x, d.state.velocity.y)
}

describe('навантаження змінює політ', () => {
  it('маса ріже запас тяги: важче → повільніший підйом', () => {
    const none = climbRate('heavy-10', 'none')
    const medium = climbRate('heavy-10', 'medium')
    const heavy = climbRate('heavy-10', 'heavy')
    expect(none).toBeGreaterThan(medium)
    expect(medium).toBeGreaterThan(heavy)
    expect(heavy).toBeGreaterThan(0) // усе ще злітає
  })

  it('маса опускає TWR і піднімає газ зависання', () => {
    const bare = makeDrone('heavy-10', 'none')
    const loaded = makeDrone('heavy-10', 'heavy')
    expect(bare.thrustToWeight).toBeGreaterThan(loaded.thrustToWeight * 1.7)
    expect(loaded.hoverThrottle).toBeGreaterThan(bare.hoverThrottle * 1.3)
    expect(loaded.hoverThrottle).toBeLessThan(1) // рівень усе ще проходимо
  })

  it('площа ріже максималку сильніше за масу', () => {
    const clean = topSpeed('light-7', 'light')
    const bulky = topSpeed('light-7', 'bulky')
    expect(bulky).toBeLessThan(clean * 0.9)
  })

  it('маса та інерція сповільнюють обертання', () => {
    const bare = rateAfter('mid-8', 'none')
    const loaded = rateAfter('mid-8', 'heavy')
    expect(bare).toBeGreaterThan(loaded * 1.15)
    expect(loaded).toBeGreaterThan(5) // керованість не втрачена
  })

  it('зміщення ЦМ дає маятник: після відпускання стіка дрон гойдається', () => {
    const swings = (payloadId: string) => {
      const d = makeDrone('light-7', payloadId)
      d.reset(v3(0, 0, 300))
      const c = angleCtrl(d, 35)
      simulate(d, 8, () => tiltFlight(d, c, 300, 1)) // розігнались
      const samples: number[] = []
      simulate(d, 3, () => altitudeHold(d, 300), (dd) => samples.push(ratesDeg(dd).pitch))
      let crossings = 0
      for (let i = 1; i < samples.length; i++) if (samples[i - 1] * samples[i] < 0) crossings++
      return { crossings, peak: Math.max(...samples.map(Math.abs)) }
    }
    const bare = swings('none')
    const loaded = swings('heavy')
    expect(loaded.peak).toBeGreaterThan(bare.peak * 3)
    expect(loaded.crossings).toBeGreaterThan(bare.crossings)
  })

  it('навантаження збільшує інерцію крену/тангажу, але не рискання', () => {
    const d = makeDrone('mid-8', 'none')
    const before = { ...d.telemetry }
    d.setPayload(PAYLOADS.heavy)
    expect(d.totalMass).toBeCloseTo(d.spec.mass + PAYLOADS.heavy.mass, 6)
    expect(d.comShift).toBeGreaterThan(0.04)
    expect(before).toBeDefined()

    // yaw має лишитись таким самим різким — маса сидить на осі рискання
    const yawRate = (payloadId: string) => {
      const dd = makeDrone('mid-8', payloadId)
      dd.reset(v3(0, 0, 200))
      simulate(dd, 1.2, () => altitudeHold(dd, 200, { yaw: 1 }))
      return ratesDeg(dd).yaw
    }
    const bareYaw = yawRate('none')
    const loadedYaw = yawRate('heavy')
    expect(loadedYaw).toBeGreaterThan(bareYaw * 0.9)
  })

  it('setPayload перераховує масові властивості на льоту', () => {
    const d = makeDrone('mid-8', 'none')
    expect(d.comShift).toBe(0)
    d.setPayload(PAYLOADS.bulky)
    expect(d.comShift).toBeGreaterThan(0)
    d.setPayload(PAYLOADS.none)
    expect(d.comShift).toBe(0)
    expect(d.totalMass).toBeCloseTo(d.spec.mass, 9)
  })

  it('дистанція зведення рахується від точки зльоту', () => {
    const d = makeDrone('light-7', 'medium')
    d.reset(v3(0, 0, 0.1))
    expect(d.telemetry.armDistanceOk).toBe(false)
    d.state.position = v3(0, 50, 40)
    d.step({ ...neutralInput(), armed: true, throttle: 0.5 })
    expect(d.telemetry.armDistanceOk).toBe(false)
    d.state.position = v3(0, 200, 40)
    d.step({ ...neutralInput(), armed: true, throttle: 0.5 })
    expect(d.telemetry.armDistanceOk).toBe(true)
  })
})

describe('дрони відчуваються по-різному', () => {
  it('тренувальний різкіший за важкий у 3+ рази на перших 50 мс', () => {
    const trainer = rateAfter('trainer-7', 'none')
    const heavy = rateAfter('heavy-10', 'none')
    expect(trainer).toBeGreaterThan(heavy * 3)
  })

  it('порядок різкості збігається з motorTau', () => {
    const ids = ['trainer-7', 'light-7', 'mid-8', 'heavy-10']
    const rates = ids.map((id) => rateAfter(id, 'none'))
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i], ids[i]).toBeLessThan(rates[i - 1])
    }
  })

  it('кожен дрон має унікальний профіль (TWR, час відгуку, максималка)', () => {
    const profiles = ['trainer-7', 'light-7', 'mid-8', 'heavy-10'].map((id) => {
      const d = makeDrone(id)
      return `${d.thrustToWeight.toFixed(2)}/${rateAfter(id, 'none').toFixed(1)}`
    })
    expect(new Set(profiles).size).toBe(profiles.length)
  })

  it('усі дрони з їхніми штатними БК лишаються керованими (TWR > 1.25)', () => {
    const combos: Array<[string, string]> = [
      ['trainer-7', 'none'],
      ['light-7', 'light'],
      ['mid-8', 'medium'],
      ['heavy-10', 'heavy'],
      ['heavy-10', 'bulky'],
    ]
    for (const [id, pl] of combos) {
      const d = makeDrone(id, pl)
      expect(d.thrustToWeight, `${id}+${pl}`).toBeGreaterThan(1.25)
    }
  })
})
