import { describe, it, expect } from 'vitest'
import { LEVELS } from '../src/level/levels'
import { createSession } from '../src/game/session'
import { Autopilot, flySortie, flyLevel } from './autopilot'
import { PHYSICS_DT } from '../src/flight/drone'

/**
 * Головний контракт кампанії: КОЖЕН виліт КОЖНОГО рівня проходиться
 * звичайним керуванням. Автопілот літає тими самими стіками, що й гравець,
 * без телепортів і без доступу до внутрішньої кухні місії.
 *
 * Якщо тут щось падає — це або баг рівня, або рівень нечесний.
 * Послаблювати цей тест не можна: він єдиний, хто відрізняє «складно» від «неможливо».
 */
const ALL_SORTIES = LEVELS.flatMap((l) =>
  l.sorties.map((s, i) => [`${l.index}. ${l.title} / виліт ${i + 1}`, l.id, i, s.targetId] as const),
)

describe('кампанія проходиться', () => {
  it('усього 15 рівнів', () => {
    expect(LEVELS.length).toBe(15)
  })

  it.each(ALL_SORTIES)('%s', (_name, levelId, sortieIndex, targetId) => {
    const r = flySortie(levelId, sortieIndex, 300)
    expect(r.reason ?? 'ok').toBe('ok')
    expect(r.outcome).toBe('success')
    expect(r.hitTargetId).toBe(targetId)
  })

  it('кожен виліт укладається в ліміт часу рівня', () => {
    for (const level of LEVELS) {
      for (const r of flyLevel(level.id)) {
        expect(r.stats.timeS, level.id).toBeLessThan(level.timeLimitS)
      }
    }
  })

  it('заряду вистачає на виліт із запасом', () => {
    for (const level of LEVELS) {
      const s = createSession(level)
      for (const r of flyLevel(level.id)) {
        expect(r.stats.mahUsed, level.id).toBeLessThan(s.drone.spec.battery.capacityMah * 0.8)
      }
    }
  })

  it('сигнал не втрачається на маршруті до цілі', () => {
    for (const level of LEVELS) {
      for (let i = 0; i < level.sorties.length; i++) {
        const session = createSession(level, i)
        const ap = new Autopilot(session)
        let worst = 1
        for (let step = 0; step < 300 / PHYSICS_DT; step++) {
          session.drone.step(ap.step(session.mission.primary), PHYSICS_DT)
          const r = session.mission.update(PHYSICS_DT)
          worst = Math.min(worst, session.mission.signal)
          if (r.outcome !== 'flying') break
        }
        expect(worst, `${level.id} виліт ${i + 1}`).toBeGreaterThan(0.05)
      }
    }
  })

  it('дрон не пробиває рельєф на жодному маршруті', () => {
    for (const level of LEVELS) {
      for (let i = 0; i < level.sorties.length; i++) {
        const session = createSession(level, i)
        const ap = new Autopilot(session)
        for (let step = 0; step < 300 / PHYSICS_DT; step++) {
          session.drone.step(ap.step(session.mission.primary), PHYSICS_DT)
          const p = session.drone.state.position
          expect(p.z, `${level.id} виліт ${i + 1}`).toBeGreaterThan(session.terrain.height(p.x, p.y) - 0.5)
          if (session.mission.update(PHYSICS_DT).outcome !== 'flying') break
        }
      }
    }
  })
})

describe('складність росте', () => {
  it('фінальний рівень коштує значно більше заряду, ніж перший', () => {
    const first = flySortie('l1-first-flight').stats.mahUsed
    const last = flyLevel('l15-final').reduce((sum, r) => sum + r.stats.mahUsed, 0)
    expect(last).toBeGreaterThan(first * 5)
  })

  it('перший рівень — найкоротший', () => {
    const first = flySortie('l1-first-flight').stats.timeS
    for (const level of LEVELS.slice(4)) {
      const total = flyLevel(level.id).reduce((sum, r) => sum + r.stats.timeS, 0)
      expect(total, level.id).toBeGreaterThan(first)
    }
  })
})
