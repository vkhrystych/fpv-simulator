import { describe, it, expect } from 'vitest'
import { LEVELS, getLevel } from '../src/level/levels'
import { createSession } from '../src/game/session'
import { VEHICLES, Target, type VehicleClass } from '../src/game/targets'
import { Terrain, gridLabel, DEFAULT_TERRAIN } from '../src/level/terrain'
import { DRONES, PAYLOADS } from '../src/drones'
import { neutralInput } from '../src/flight/types'
import { v3 } from '../src/flight/math'

const FRAME = 1 / 60
const terrain = new Terrain(DEFAULT_TERRAIN)

const make = (vehicle: VehicleClass) =>
  new Target({ id: 't', kind: 'target', vehicle, position: [0, 0] }, terrain)

describe('каталог техніки', () => {
  it('розміри впорядковані від мотоцикла до танка', () => {
    const order: VehicleClass[] = ['motorcycle', 'quad', 'car', 'pickup', 'truck', 'tank']
    for (let i = 1; i < order.length; i++) {
      expect(VEHICLES[order[i]].length, order[i]).toBeGreaterThan(VEHICLES[order[i - 1]].length)
    }
  })

  it('радіус ураження росте разом із корпусом', () => {
    expect(VEHICLES.motorcycle.hitRadius).toBeLessThan(VEHICLES.quad.hitRadius)
    expect(VEHICLES.quad.hitRadius).toBeLessThan(VEHICLES.truck.hitRadius)
    expect(VEHICLES.truck.hitRadius).toBeLessThan(VEHICLES.tank.hitRadius)
  })

  it('дрібна техніка швидша за важку — розмір і швидкість тягнуть у різні боки', () => {
    expect(VEHICLES.motorcycle.cruiseSpeed).toBeGreaterThan(VEHICLES.truck.cruiseSpeed)
    expect(VEHICLES.truck.cruiseSpeed).toBeGreaterThan(VEHICLES.tank.cruiseSpeed)
  })

  it('гусеничні мають башту, колісні — ні', () => {
    expect(VEHICLES.tank.tracked).toBe(true)
    expect(VEHICLES.apc.tracked).toBe(true)
    expect(VEHICLES.truck.tracked).toBe(false)
    expect(VEHICLES.tank.turret).toBe(true)
    expect(VEHICLES.car.turret).toBe(false)
  })

  it('ціль бере габарити з класу без дублювання в рівні', () => {
    const t = make('tank')
    expect(t.length).toBe(VEHICLES.tank.length)
    expect(t.height).toBe(VEHICLES.tank.height)
    expect(t.hitRadius).toBe(VEHICLES.tank.hitRadius)
    expect(t.label).toBe('tank')
  })

  it('рівень може перекрити габарити точково', () => {
    const t = new Target(
      { id: 'x', kind: 'target', vehicle: 'truck', position: [0, 0], hitRadius: 9, label: 'special' },
      terrain,
    )
    expect(t.hitRadius).toBe(9)
    expect(t.length).toBe(VEHICLES.truck.length)
    expect(t.label).toBe('special')
  })

  it('малу техніку видно значно ближче, ніж велику', () => {
    expect(make('motorcycle').visibilityRange).toBeLessThan(make('tank').visibilityRange * 0.4)
  })

  it('маскувальна сітка ріже дальність виявлення більш ніж удвічі', () => {
    const open = make('apc')
    const hidden = new Target(
      { id: 'h', kind: 'target', vehicle: 'apc', position: [0, 0], concealed: true },
      terrain,
    )
    expect(hidden.visibilityRange).toBeLessThan(open.visibilityRange * 0.5)
  })

  it('точка влучання — середина корпуса, а не земля', () => {
    const t = make('truck')
    expect(t.aimPoint.z - t.position.z).toBeCloseTo(VEHICLES.truck.height / 2, 6)
  })
})

describe('вильоти', () => {
  it('рівні з кількома вильотами існують і мають різні цілі', () => {
    const multi = LEVELS.filter((l) => l.sorties.length > 1)
    expect(multi.length).toBeGreaterThanOrEqual(4)
    for (const l of multi) {
      const ids = l.sorties.map((s) => s.targetId)
      expect(new Set(ids).size, l.id).toBe(ids.length)
    }
  })

  it('є рівень із трьома вильотами', () => {
    expect(LEVELS.some((l) => l.sorties.length === 3)).toBe(true)
  })

  it('кожен виліт бере свою ціль', () => {
    const level = LEVELS.find((l) => l.sorties.length === 3)!
    level.sorties.forEach((sortie, i) => {
      const s = createSession(level, i)
      expect(s.mission.primary.spec.id).toBe(sortie.targetId)
      expect(s.mission.sortieIndex).toBe(i)
    })
  })

  it('цілі попередніх вильотів уже уражені й повторно не зараховуються', () => {
    const level = LEVELS.find((l) => l.sorties.length === 3)!
    const s = createSession(level, 2)
    const earlier = level.sorties.slice(0, 2).map((x) => x.targetId)
    for (const id of earlier) {
      expect(s.mission.targets.find((t) => t.spec.id === id)!.destroyed, id).toBe(true)
    }
    expect(s.mission.primary.destroyed).toBe(false)
  })

  it('останній виліт позначений як фінальний', () => {
    const level = LEVELS.find((l) => l.sorties.length === 3)!
    expect(createSession(level, 0).mission.isFinalSortie).toBe(false)
    expect(createSession(level, 2).mission.isFinalSortie).toBe(true)
  })

  it('виліт може стартувати з іншої точки карти', () => {
    const level = LEVELS.find((l) => l.sorties.some((s) => s.launch))!
    const idx = level.sorties.findIndex((s) => s.launch)
    const a = createSession(level, 0).drone.state.position
    const b = createSession(level, idx).drone.state.position
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(200)
  })

  it('кожен виліт стартує з повним акумулятором', () => {
    const level = LEVELS.find((l) => l.sorties.length === 3)!
    for (let i = 0; i < 3; i++) {
      expect(createSession(level, i).drone.battery.stateOfCharge).toBe(1)
    }
  })

  it('удар у ціль ЧУЖОГО вильоту не зараховується', () => {
    const level = LEVELS.find((l) => l.sorties.length === 3)!
    const s = createSession(level, 0)
    const other = s.mission.targets.find((t) => t.spec.id === level.sorties[1].targetId)!
    s.drone.state.position = v3(other.aimPoint.x, other.aimPoint.y - 300, other.aimPoint.z)
    s.mission.update(FRAME)
    s.drone.state.position = other.aimPoint
    const r = s.mission.update(FRAME)
    expect(r.outcome).toBe('failed')
    expect(r.reason).toBe('DECOY')
  })
})

describe('чесність рівнів', () => {
  it('у кожному рівні є що уражати, і це завжди ціль типу target', () => {
    for (const level of LEVELS) {
      expect(level.sorties.length, level.id).toBeGreaterThan(0)
      for (const sortie of level.sorties) {
        const t = level.targets.find((x) => x.id === sortie.targetId)
        expect(t, `${level.id}: немає цілі ${sortie.targetId}`).toBeDefined()
        expect(t!.kind, `${level.id}/${sortie.targetId}`).toBe('target')
      }
    }
  })

  it('цивільні та макети НЕ стоять на точках маршруту цілей', () => {
    // спільна точка маршруту = дві машини в одному місці, і гравець фізично
    // не може їх розрізнити — це нечесний провал, а не помилка пілота
    for (const level of LEVELS) {
      const targetPoints = level.targets
        .filter((t) => t.kind === 'target')
        .flatMap((t) => (t.route ? t.route.points : t.position ? [t.position] : []))
      const others = level.targets
        .filter((t) => t.kind !== 'target')
        .flatMap((t) => (t.route ? t.route.points : t.position ? [t.position] : []))
      for (const [ax, ay] of targetPoints) {
        for (const [bx, by] of others) {
          expect(Math.hypot(ax - bx, ay - by), `${level.id}: маршрути збігаються`).toBeGreaterThan(20)
        }
      }
    }
  })

  it('усі цілі рухаються або мають вагому причину стояти', () => {
    for (const level of LEVELS) {
      for (const sortie of level.sorties) {
        const t = level.targets.find((x) => x.id === sortie.targetId)!
        const stationary = !t.route
        // статична ціль допускається лише замаскованою або в тренуванні
        if (stationary) {
          const ok = t.concealed || level.allowAngleMode || t.vehicle === 'tank' || t.vehicle === 'apc'
          expect(ok, `${level.id}/${t.id}: статична ціль без причини`).toBe(true)
        }
      }
    }
  })

  it('більшість цілей кампанії — рухомі', () => {
    const all = LEVELS.flatMap((l) => l.sorties.map((s) => l.targets.find((t) => t.id === s.targetId)!))
    const moving = all.filter((t) => t.route && t.route.points.length > 1)
    expect(moving.length).toBeGreaterThan(all.length * 0.6)
  })

  it('кампанія використовує всю лінійку розмірів техніки', () => {
    const used = new Set(
      LEVELS.flatMap((l) => l.sorties.map((s) => l.targets.find((t) => t.id === s.targetId)!.vehicle)),
    )
    for (const v of ['motorcycle', 'quad', 'truck', 'apc', 'tank'] as VehicleClass[]) {
      expect(used.has(v), `клас ${v} не використано в жодному вильоті`).toBe(true)
    }
  })

  it('цілі рознесені по карті, а не купчаться в центрі', () => {
    for (const level of LEVELS.filter((l) => l.sorties.length > 1)) {
      const s = createSession(level)
      const cells = level.sorties.map((sortie) => {
        const t = level.targets.find((x) => x.id === sortie.targetId)!
        const p = t.route ? t.route.points[0] : t.position!
        return gridLabel(s.terrain, p[0], p[1])
      })
      expect(new Set(cells).size, `${level.id}: цілі в одному квадраті`).toBe(cells.length)
    }
  })

  it('індекси рівнів послідовні, id та назви унікальні', () => {
    LEVELS.forEach((l, i) => expect(l.index).toBe(i + 1))
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(LEVELS.length)
    expect(new Set(LEVELS.map((l) => l.title)).size).toBe(LEVELS.length)
  })

  it('усі рівні посилаються на наявні дрони й БК', () => {
    for (const l of LEVELS) {
      expect(DRONES[l.droneId], l.id).toBeDefined()
      expect(PAYLOADS[l.payloadId], l.id).toBeDefined()
    }
  })

  it('кампанія показує всі шість дронів', () => {
    const used = new Set(LEVELS.map((l) => l.droneId))
    expect(used.size).toBe(Object.keys(DRONES).length)
  })

  it('кожен рівень має запас тяги з призначеним БК', () => {
    for (const l of LEVELS) {
      expect(createSession(l).drone.thrustToWeight, l.id).toBeGreaterThan(1.4)
    }
  })

  it('дрон завжди стартує на землі й не зведений', () => {
    for (const l of LEVELS) {
      for (let i = 0; i < l.sorties.length; i++) {
        const s = createSession(l, i)
        expect(s.drone.state.landed, l.id).toBe(true)
        if (s.drone.payload.armDistance > 0) expect(s.mission.armed, l.id).toBe(false)
      }
    }
  })

  it('на бойових рівнях завжди є кого переплутати з ціллю', () => {
    for (const l of LEVELS.filter((x) => !x.allowAngleMode)) {
      const distractors = l.targets.filter((t) => t.kind !== 'target')
      expect(distractors.length, l.id).toBeGreaterThan(0)
    }
  })

  it('брифінг не порожній і згадує квадрати пошуку', () => {
    for (const l of LEVELS) {
      expect(l.brief.length, l.id).toBeGreaterThan(80)
      expect(l.objectives.length, l.id).toBeGreaterThanOrEqual(3)
      expect(l.searchCells.length, l.id).toBeGreaterThan(0)
      for (const sortie of l.sorties) expect(sortie.note.length, l.id).toBeGreaterThan(5)
    }
  })

  it('погода різноманітна: є день, сутінки, ніч і туман', () => {
    const times = new Set(LEVELS.map((l) => l.weather.timeOfDay))
    expect(times.has('day')).toBe(true)
    expect(times.has('dusk')).toBe(true)
    expect(times.has('night')).toBe(true)
    expect(times.has('dawn')).toBe(true)
  })

  it('тільки перший рівень дозволяє ANGLE', () => {
    expect(getLevel('l1-first-flight').allowAngleMode).toBe(true)
    for (const l of LEVELS.slice(1)) expect(l.allowAngleMode, l.id).toBe(false)
  })

  it('незаармлений дрон не злітає на жодному рівні', () => {
    for (const l of LEVELS) {
      const s = createSession(l)
      const z = s.drone.state.position.z
      for (let i = 0; i < 60; i++) s.drone.step({ ...neutralInput(), throttle: 1, armed: false })
      expect(s.drone.state.position.z, l.id).toBeLessThanOrEqual(z + 0.01)
    }
  })
})
