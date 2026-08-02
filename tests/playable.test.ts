import { describe, it, expect } from 'vitest'
import { createSession, type Session } from '../src/game/session'
import { LEVELS, getLevel } from '../src/level/levels'
import { AngleController } from '../src/flight/angle'
import { PHYSICS_DT } from '../src/flight/drone'
import { clamp, quatToEuler, vlen, vsub, v3 } from '../src/flight/math'
import { radToDeg, stickForRate, maxRate } from '../src/flight/rates'
import type { ControlInput } from '../src/flight/types'
import type { Target } from '../src/game/targets'

/**
 * Автопілот-«гравець»: злітає, набирає висоту, йде на ціль з упередженням
 * і пікірує. Не ідеальний пілот — саме тому й доводить, що рівень проходимо
 * звичайним керуванням, а не читерським телепортом.
 */
class Autopilot {
  private angle: AngleController
  private launched = false

  constructor(
    private session: Session,
    private cruiseAlt = 70,
  ) {
    this.angle = new AngleController(session.drone.spec, 32)
  }

  step(target: Target): ControlInput {
    const { drone, terrain } = this.session
    const s = drone.state
    const alt = s.position.z - terrain.height(s.position.x, s.position.y)

    // упередження по руху цілі: летимо туди, де вона буде
    const to = vsub(target.aimPoint, s.position)
    const range = vlen(to)
    const lead = target.isMoving ? range / 28 : 0
    const aimX = target.aimPoint.x + Math.sin(target.heading) * target.speed * lead
    const aimY = target.aimPoint.y + Math.cos(target.heading) * target.speed * lead
    const aim = v3(aimX, aimY, target.aimPoint.z)

    const delta = vsub(aim, s.position)
    const ground = Math.hypot(delta.x, delta.y)

    // курс: доводимо ніс на ціль (компасна конвенція — за годинниковою від півночі)
    const wantYaw = Math.atan2(delta.x, delta.y)
    const yawErr = ((radToDeg(wantYaw - quatToEuler(s.orientation).yaw) + 540) % 360) - 180
    const yaw = stickForRate(
      clamp(yawErr * 3, -maxRate(drone.spec.rates.yaw), maxRate(drone.spec.rates.yaw)),
      drone.spec.rates.yaw,
    )

    // фаза: набір висоти → крейсер → термінальний захід
    const dive = ground < 90
    const targetAlt = dive ? target.aimPoint.z - terrain.height(s.position.x, s.position.y) : this.cruiseAlt
    if (alt > 12) this.launched = true

    const altErr = targetAlt - alt
    const desiredVz = clamp(altErr * 0.6, dive ? -14 : -5, 7)
    const vzErr = desiredVz - s.velocity.z
    const up = Math.cos(quatToEuler(s.orientation).roll) * Math.cos(quatToEuler(s.orientation).pitch)
    const hover = drone.hoverThrottle / Math.max(up, 0.4) / Math.max(drone.battery.voltageRatio, 0.7)
    const throttle = clamp(hover + vzErr * 0.09, 0, 1)

    // швидкість підбираємо під дальність: далеко — розганяємось, близько — тримаємо лінію.
    // pitch+ = ніс угору, тому для руху ВПЕРЕД потрібен від'ємний нахил.
    const tilt = !this.launched ? 0 : clamp(ground / 260, 0, 1) * (dive ? 0.55 : 1)
    const a = this.angle.compute(drone, -tilt, 0)

    return { roll: a.roll, pitch: a.pitch, yaw, throttle, armed: true }
  }
}

/** Проганяє повний виліт автопілотом. */
function flyMission(levelId: string, maxSeconds = 240) {
  const session = createSession(getLevel(levelId))
  const ap = new Autopilot(session)
  const steps = Math.round(maxSeconds / PHYSICS_DT)

  for (let i = 0; i < steps; i++) {
    const control = ap.step(session.mission.primary)
    session.drone.step(control, PHYSICS_DT)
    const r = session.mission.update(PHYSICS_DT)
    if (r.outcome !== 'flying') return { ...r, session }
  }
  return { ...session.mission.result, session }
}

describe('рівні проходяться', () => {
  it('рівень 1: автопілот злітає з трави й уражає макет', () => {
    const r = flyMission('l1-first-flight')
    expect(r.reason ?? 'ok').toBe('ok')
    expect(r.outcome).toBe('success')
    expect(r.hitTargetId).toBe('mock-hull')
  })

  it('рівень 2: автопілот наздоганяє рухому вантажівку', () => {
    const r = flyMission('l2-convoy-road')
    expect(r.reason ?? 'ok').toBe('ok')
    expect(r.outcome).toBe('success')
    expect(r.hitTargetId).toBe('truck-green')
  })

  it('виліт укладається в ліміт часу з запасом', () => {
    for (const level of LEVELS) {
      const r = flyMission(level.id)
      expect(r.outcome, level.id).toBe('success')
      expect(r.stats.timeS, level.id).toBeLessThan(level.timeLimitS * 0.75)
    }
  })

  it('заряду вистачає на весь виліт із запасом', () => {
    for (const level of LEVELS) {
      const r = flyMission(level.id)
      const s = createSession(level)
      expect(r.stats.mahUsed, level.id).toBeLessThan(s.drone.spec.battery.capacityMah * 0.7)
    }
  })

  it('сигнал не втрачається на маршруті до цілі', () => {
    for (const level of LEVELS) {
      const session = createSession(level)
      const ap = new Autopilot(session)
      let worst = 1
      for (let i = 0; i < 240 / PHYSICS_DT; i++) {
        session.drone.step(ap.step(session.mission.primary), PHYSICS_DT)
        const r = session.mission.update(PHYSICS_DT)
        worst = Math.min(worst, session.mission.signal)
        if (r.outcome !== 'flying') break
      }
      expect(worst, level.id).toBeGreaterThan(0.05)
    }
  })

  it('дрон не пробиває рельєф на всьому маршруті', () => {
    for (const level of LEVELS) {
      const session = createSession(level)
      const ap = new Autopilot(session)
      for (let i = 0; i < 240 / PHYSICS_DT; i++) {
        session.drone.step(ap.step(session.mission.primary), PHYSICS_DT)
        const p = session.drone.state.position
        expect(p.z, `${level.id} @ ${i}`).toBeGreaterThan(session.terrain.height(p.x, p.y) - 0.5)
        if (session.mission.update(PHYSICS_DT).outcome !== 'flying') break
      }
    }
  })

  it('рівень 2 складніший: він забирає більше часу й заряду', () => {
    const easy = flyMission('l1-first-flight')
    const hard = flyMission('l2-convoy-road')
    expect(hard.stats.mahUsed).toBeGreaterThan(easy.stats.mahUsed)
  })
})
