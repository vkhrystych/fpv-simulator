import { describe, it } from 'vitest'
import { makeDrone, simulate, ratesDeg, altitudeHold, tiltFlight, angleCtrl } from './helpers'
import { neutralInput } from '../src/flight/types'
import { applyRates } from '../src/flight/rates'
import { v3 } from '../src/flight/math'

// діагностичний прогін: PROBE=1 npx vitest run tests/probe.test.ts
const PROBE = (globalThis as { process?: { env?: Record<string, string> } }).process?.env?.PROBE === '1'
const maybe = PROBE ? it : it.skip

describe('probe', () => {
  maybe('відгук на ступінчастий крен', () => {
    for (const id of ['trainer-7', 'light-7', 'mid-8', 'heavy-10']) {
      const d = makeDrone(id)
      const target = applyRates(0.5, d.spec.rates.roll)
      const samples: number[] = []
      simulate(d, 0.8, () => altitudeHold(d, 50, { roll: 0.5 }), (dd) => samples.push(ratesDeg(dd).roll))
      const at = (t: number) => samples[Math.round(t * 500)] ?? NaN
      const peak = Math.max(...samples)
      console.log(
        `${id.padEnd(10)} target=${target.toFixed(0).padStart(4)} ` +
          `t50=${at(0.05).toFixed(0).padStart(4)} t100=${at(0.1).toFixed(0).padStart(4)} ` +
          `t200=${at(0.2).toFixed(0).padStart(4)} t790=${at(0.79).toFixed(0).padStart(4)} ` +
          `peak=${peak.toFixed(0)} over=${((peak / target - 1) * 100).toFixed(0)}%`,
      )
    }
  })

  maybe('зависання і TWR', () => {
    for (const [id, pl] of [
      ['trainer-7', 'none'],
      ['light-7', 'light'],
      ['mid-8', 'medium'],
      ['heavy-10', 'heavy'],
    ] as const) {
      const d = makeDrone(id, pl)
      simulate(d, 4, () => altitudeHold(d, 50))
      console.log(
        `${id.padEnd(10)} ${pl.padEnd(7)} TWR=${d.thrustToWeight.toFixed(2)} ` +
          `hoverThr=${d.hoverThrottle.toFixed(2)} alt=${d.state.position.z.toFixed(1)} ` +
          `mAh=${d.battery.mahUsed.toFixed(0)} V=${d.battery.voltage.toFixed(1)} ` +
          `comShift=${d.comShift.toFixed(3)}`,
      )
    }
  })

  maybe('максимальна швидкість', () => {
    for (const [id, pl] of [
      ['trainer-7', 'none'],
      ['light-7', 'light'],
      ['light-7', 'bulky'],
      ['heavy-10', 'heavy'],
      ['heavy-10', 'bulky'],
    ] as const) {
      const d = makeDrone(id, pl)
      d.reset(v3(0, 0, 200))
      const c = angleCtrl(d, 40)
      simulate(d, 20, () => tiltFlight(d, c, 200, 1))
      console.log(
        `${id.padEnd(10)} ${pl.padEnd(7)} speed=${d.telemetry.speed.toFixed(1)} m/s ` +
          `(${(d.telemetry.speed * 3.6).toFixed(0)} км/год) alt=${d.state.position.z.toFixed(0)}`,
      )
    }
  })

  maybe('вільне падіння без газу', () => {
    const d = makeDrone('trainer-7')
    d.reset(v3(0, 0, 3000))
    simulate(d, 20, { ...neutralInput(), armed: true, throttle: 0 })
    console.log(`terminal vz=${d.state.velocity.z.toFixed(1)} m/s alt=${d.state.position.z.toFixed(0)}`)
  })

  maybe('маятник: коливання після скидання стіка', () => {
    for (const [id, pl] of [
      ['light-7', 'none'],
      ['light-7', 'heavy'],
    ] as const) {
      const d = makeDrone(id, pl)
      d.reset(v3(0, 0, 200))
      const c = angleCtrl(d, 35)
      simulate(d, 8, () => tiltFlight(d, c, 200, 1))
      const rolls: number[] = []
      simulate(d, 3, () => altitudeHold(d, 200), (dd) => rolls.push(ratesDeg(dd).pitch))
      let zeroCrossings = 0
      for (let i = 1; i < rolls.length; i++) if (rolls[i - 1] * rolls[i] < 0) zeroCrossings++
      console.log(
        `${id} ${pl.padEnd(5)} після відпускання: піковий тангаж-темп=${Math.max(...rolls.map(Math.abs)).toFixed(0)}°/с, ` +
          `перетинів нуля=${zeroCrossings}`,
      )
    }
  })
})
