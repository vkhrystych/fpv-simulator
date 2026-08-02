import { describe, it, expect } from 'vitest'
import { stepKeyboardThrottle } from '../src/core/input'
import { createSession } from '../src/game/session'
import { getLevel } from '../src/level/levels'
import { AngleController } from '../src/flight/angle'
import { PHYSICS_DT } from '../src/flight/drone'
import { qrotate, v3 } from '../src/flight/math'
import { neutralInput } from '../src/flight/types'

describe('клавіатурний газ', () => {
  it('W піднімає газ, S опускає', () => {
    expect(stepKeyboardThrottle(0.4, 1, 0, 0.5, 0.1, 1)).toBeGreaterThan(0.4)
    expect(stepKeyboardThrottle(0.4, 0, 1, 0.5, 0.1, 1)).toBeLessThan(0.4)
  })

  it('без клавіш газ повертається до зависання, а не залипає', () => {
    let t = 1
    for (let i = 0; i < 120; i++) t = stepKeyboardThrottle(t, 0, 0, 0.52, 1 / 60, 0.85)
    expect(t).toBeGreaterThan(0.5)
    expect(t).toBeLessThan(0.56)
  })

  it('повернення працює й знизу вгору', () => {
    let t = 0
    for (let i = 0; i < 120; i++) t = stepKeyboardThrottle(t, 0, 0, 0.52, 1 / 60, 0.85)
    expect(t).toBeCloseTo(0.52, 2)
  })

  it('на землі (bias 0) газ не наростає сам — зліт робить пілот', () => {
    let t = 0
    for (let i = 0; i < 120; i++) t = stepKeyboardThrottle(t, 0, 0, 0, 1 / 60, 0.85)
    expect(t).toBe(0)
  })

  it('газ завжди в межах [0,1]', () => {
    expect(stepKeyboardThrottle(0.98, 1, 0, 0.5, 1, 5)).toBeLessThanOrEqual(1)
    expect(stepKeyboardThrottle(0.02, 0, 1, 0.5, 1, 5)).toBeGreaterThanOrEqual(0)
  })
})

describe('газ зависання з поправкою на напругу', () => {
  it('на свіжому акумуляторі потрібен менший газ, ніж номінальний', () => {
    const s = createSession(getLevel('l1-first-flight'))
    expect(s.drone.hoverThrottleNow).toBeLessThan(s.drone.hoverThrottle)
  })

  it('на просадженому — більший', () => {
    const s = createSession(getLevel('l1-first-flight'))
    s.drone.battery.mahUsed = s.drone.spec.battery.capacityMah * 0.9
    s.drone.battery.step([2, 2, 2, 2], 0.002)
    expect(s.drone.hoverThrottleNow).toBeGreaterThan(s.drone.hoverThrottle)
  })

  it('утримує висоту без корекції краще за номінальний газ', () => {
    const drift = (useNow: boolean) => {
      const s = createSession(getLevel('l1-first-flight'))
      const d = s.drone
      d.state.position = v3(d.state.position.x, d.state.position.y, d.state.position.z + 60)
      const start = d.state.position.z
      for (let i = 0; i < 3 / PHYSICS_DT; i++) {
        d.step({ ...neutralInput(), armed: true, throttle: useNow ? d.hoverThrottleNow : d.hoverThrottle }, PHYSICS_DT)
      }
      return Math.abs(d.state.position.z - start)
    }
    expect(drift(true)).toBeLessThan(drift(false))
  })
})

/**
 * Головна претензія до керування: «дрон улітає вгору, а вперед майже не рухається».
 * Відтворюємо повний ланцюжок гри — клавіатурний газ з асистом + ANGLE-нахил —
 * і перевіряємо, що ніс униз дає саме політ уперед, а не набір висоти.
 */
function flyForward(seconds: number, tiltStick: number, maxTilt = 45) {
  const s = createSession(getLevel('l1-first-flight'))
  const { drone } = s
  const angle = new AngleController(drone.spec, maxTilt)
  drone.state.position = v3(drone.state.position.x, drone.state.position.y, drone.state.position.z + 80)
  const startZ = drone.state.position.z
  const startY = drone.state.position.y
  let throttle = drone.hoverThrottleNow

  for (let i = 0; i < seconds / PHYSICS_DT; i++) {
    const up = qrotate(drone.state.orientation, v3(0, 0, 1)).z
    const bias = drone.hoverThrottleNow / Math.max(up, 0.5)
    throttle = stepKeyboardThrottle(throttle, 0, 0, bias, PHYSICS_DT, 0.85)
    const a = angle.compute(drone, tiltStick, 0)
    drone.step({ roll: a.roll, pitch: a.pitch, yaw: 0, throttle, armed: true }, PHYSICS_DT)
  }

  return {
    forward: drone.state.position.y - startY,
    climb: drone.state.position.z - startZ,
    speed: Math.hypot(drone.state.velocity.x, drone.state.velocity.y),
    verticalSpeed: drone.state.velocity.z,
  }
}

describe('політ уперед', () => {
  it('ніс униз дає рух уперед, а не вгору', () => {
    const r = flyForward(6, -1)
    expect(r.forward).toBeGreaterThan(60)
    expect(Math.abs(r.climb)).toBeLessThan(r.forward * 0.35)
  })

  it('за 6 с розганяється щонайменше до 60 км/год', () => {
    expect(flyForward(6, -1).speed * 3.6).toBeGreaterThan(60)
  })

  it('на повному нахилі висота не тікає', () => {
    const r = flyForward(10, -1)
    expect(Math.abs(r.verticalSpeed)).toBeLessThan(4)
  })

  it('ніс угору дає рух назад — знак стіка не переплутано', () => {
    expect(flyForward(4, 1).forward).toBeLessThan(-15)
  })

  it('нейтральний стік — ні вперед, ні вгору', () => {
    const r = flyForward(5, 0)
    expect(Math.abs(r.forward)).toBeLessThan(12)
    expect(Math.abs(r.climb)).toBeLessThan(6)
  })

  it('більший дозволений нахил дає більшу швидкість', () => {
    expect(flyForward(8, -1, 45).speed).toBeGreaterThan(flyForward(8, -1, 25).speed)
  })
})
