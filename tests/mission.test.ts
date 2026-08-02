import { describe, it, expect } from 'vitest'
import { createSession, windVector } from '../src/game/session'
import { getLevel, LEVELS } from '../src/level/levels'
import { Terrain, gridLabel, gridCenter, gridCellSize, DEFAULT_TERRAIN } from '../src/level/terrain'
import { Target } from '../src/game/targets'
import { ID_HOLD_SECONDS, ID_RANGE, SIGNAL_LOSS_LIMIT, segmentSphereHit } from '../src/game/mission'
import { neutralInput } from '../src/flight/types'
import { qFromAxisAngle, v3, vsub, vlen } from '../src/flight/math'
import { PHYSICS_DT } from '../src/flight/drone'

const FRAME = 1 / 60

/**
 * Проганяє тільки логіку місії: дрон висить там, де його поставили.
 * Так правила перевіряються ізольовано від фізики.
 */
function tick(session: ReturnType<typeof createSession>, seconds: number, dt = FRAME) {
  const steps = Math.round(seconds / dt)
  for (let i = 0; i < steps; i++) {
    const r = session.mission.update(dt)
    if (r.outcome !== 'flying') return r
  }
  return session.mission.result
}

/** Ставить дрон у точку і напрямок, обходячи фізику — для перевірки правил місії. */
function place(session: ReturnType<typeof createSession>, pos: ReturnType<typeof v3>, lookAt?: ReturnType<typeof v3>) {
  session.drone.state.position = pos
  session.drone.state.velocity = v3()
  if (lookAt) {
    const d = vsub(lookAt, pos)
    const yaw = Math.atan2(-d.x, d.y)
    // нахил камери вгору компенсуємо тангажем донизу, щоб ціль була в центрі кадру
    const pitch = Math.atan2(d.z, Math.hypot(d.x, d.y)) - (session.drone.spec.camera.tiltDeg * Math.PI) / 180
    const qz = qFromAxisAngle(v3(0, 0, 1), yaw)
    const qx = qFromAxisAngle(v3(1, 0, 0), pitch)
    session.drone.state.orientation = {
      x: qz.w * qx.x + qz.x * qx.w + qz.y * qx.z - qz.z * qx.y,
      y: qz.w * qx.y - qz.x * qx.z + qz.y * qx.w + qz.z * qx.x,
      z: qz.w * qx.z + qz.x * qx.y - qz.y * qx.x + qz.z * qx.w,
      w: qz.w * qx.w - qz.x * qx.x - qz.y * qx.y - qz.z * qx.z,
    }
  }
}

describe('рельєф', () => {
  const t = new Terrain(DEFAULT_TERRAIN)

  it('висота детермінована', () => {
    expect(t.height(123.4, -56.7)).toBe(t.height(123.4, -56.7))
  })

  it('висота в межах амплітуди', () => {
    for (let x = -1000; x <= 1000; x += 137) {
      for (let y = -1000; y <= 1000; y += 149) {
        expect(Math.abs(t.height(x, y))).toBeLessThanOrEqual(DEFAULT_TERRAIN.amplitude + 1e-9)
      }
    }
  })

  it('рельєф не плоский', () => {
    const hs = [0, 200, 400, 600, 800].map((x) => t.height(x, x * 0.3))
    expect(new Set(hs.map((h) => h.toFixed(2))).size).toBeGreaterThan(3)
  })

  it('різні seed — різний рельєф', () => {
    const a = new Terrain({ ...DEFAULT_TERRAIN, seed: 1 })
    const b = new Terrain({ ...DEFAULT_TERRAIN, seed: 2 })
    expect(a.height(100, 100)).not.toBe(b.height(100, 100))
  })

  it('ЖОДЕН seed не вироджується у плоский рельєф', () => {
    // цілочисельне переповнення в хеші колись робило рельєф константою
    // саме для сіда рівня 1 — перевіряємо всі реальні сіди й купу випадкових
    const seeds = [...LEVELS.map((l) => l.terrain.seed), 1, 1337, 20260801, 776041, 2 ** 31 - 1, 123456789]
    for (const seed of seeds) {
      const t = new Terrain({ ...DEFAULT_TERRAIN, seed })
      const hs: number[] = []
      for (let i = 0; i < 40; i++) hs.push(t.height(i * 97 - 900, i * 53 - 700))
      const spread = Math.max(...hs) - Math.min(...hs)
      expect(spread, `seed ${seed}`).toBeGreaterThan(DEFAULT_TERRAIN.amplitude * 0.4)
      expect(new Set(hs.map((h) => h.toFixed(3))).size, `seed ${seed}`).toBeGreaterThan(30)
    }
  })

  it('patchNoise дає варіацію для всіх сідів рівнів', () => {
    for (const level of LEVELS) {
      const t = new Terrain(level.terrain)
      const vals = new Set<string>()
      for (let i = 0; i < 40; i++) vals.add(t.patchNoise(i * 71 - 800, i * 37 - 500, 140).toFixed(3))
      expect(vals.size, level.id).toBeGreaterThan(25)
    }
  })

  it('нормаль одинична і дивиться вгору', () => {
    const n = t.normal(250, -310)
    expect(Math.hypot(...n)).toBeCloseTo(1, 6)
    expect(n[2]).toBeGreaterThan(0.5)
  })

  it('схили пологі — на такому рельєфі можна літати низько', () => {
    let maxSlope = 0
    for (let x = -900; x <= 900; x += 97) {
      for (let y = -900; y <= 900; y += 103) maxSlope = Math.max(maxSlope, t.slopeDeg(x, y))
    }
    expect(maxSlope).toBeLessThan(45)
  })

  it('межі карти', () => {
    expect(t.inBounds(0, 0)).toBe(true)
    expect(t.inBounds(1001, 0)).toBe(false)
    expect(t.inBounds(0, -1001)).toBe(false)
  })
})

describe('сітка квадратів', () => {
  const t = new Terrain(DEFAULT_TERRAIN)

  it('A1 — північно-західний кут', () => {
    const c = gridCenter(t, 'A1')!
    expect(c.x).toBeLessThan(0)
    expect(c.y).toBeGreaterThan(0)
  })

  it('H8 — південно-східний кут', () => {
    const c = gridCenter(t, 'H8')!
    expect(c.x).toBeGreaterThan(0)
    expect(c.y).toBeLessThan(0)
  })

  it('gridLabel і gridCenter взаємно узгоджені', () => {
    for (const label of ['A1', 'C3', 'D4', 'E5', 'H8', 'B7']) {
      const c = gridCenter(t, label)!
      expect(gridLabel(t, c.x, c.y)).toBe(label)
    }
  })

  it('усі 64 квадрати різні', () => {
    const labels = new Set<string>()
    const cell = gridCellSize(t)
    for (let c = 0; c < 8; c++) {
      for (let r = 0; r < 8; r++) {
        const x = -1000 + (c + 0.5) * cell
        const y = 1000 - (r + 0.5) * cell
        labels.add(gridLabel(t, x, y)!)
      }
    }
    expect(labels.size).toBe(64)
  })

  it('за межами карти квадрата немає', () => {
    expect(gridLabel(t, 5000, 0)).toBeNull()
  })

  it('некоректна мітка не парситься', () => {
    expect(gridCenter(t, 'Z9')).toBeNull()
    expect(gridCenter(t, 'A9')).toBeNull()
  })
})

describe('цілі', () => {
  const terrain = new Terrain(DEFAULT_TERRAIN)

  it('статична ціль стоїть на землі й не рухається', () => {
    const t = new Target(
      { id: 's', kind: 'target', label: '', position: [100, 200], hitRadius: 4, height: 2, length: 6 },
      terrain,
    )
    const before = { ...t.position }
    t.update(10)
    expect(t.position).toEqual(before)
    expect(t.position.z).toBeCloseTo(terrain.height(100, 200), 6)
    expect(t.isMoving).toBe(false)
  })

  it('рухома ціль проходить маршрут із заданою швидкістю', () => {
    const t = new Target(
      {
        id: 'm',
        kind: 'target',
        label: '',
        hitRadius: 4,
        height: 3,
        length: 8,
        route: { points: [[0, 0], [200, 0]], speed: 10, loop: false },
      },
      terrain,
    )
    for (let i = 0; i < 600; i++) t.update(1 / 60) // 10 с
    expect(t.position.x).toBeCloseTo(100, 0)
    expect(t.speed).toBe(10)
  })

  it('ціль тримається землі на всьому маршруті', () => {
    const t = new Target(
      {
        id: 'm',
        kind: 'target',
        label: '',
        hitRadius: 4,
        height: 3,
        length: 8,
        route: { points: [[-400, -300], [400, 350]], speed: 20, loop: false },
      },
      terrain,
    )
    for (let i = 0; i < 3000; i++) {
      t.update(1 / 60)
      expect(t.position.z).toBeCloseTo(terrain.height(t.position.x, t.position.y), 6)
    }
  })

  it('маршрут без циклу зупиняється в кінці', () => {
    const t = new Target(
      {
        id: 'm',
        kind: 'target',
        label: '',
        hitRadius: 4,
        height: 3,
        length: 8,
        route: { points: [[0, 0], [100, 0]], speed: 10, loop: false },
      },
      terrain,
    )
    for (let i = 0; i < 3000; i++) t.update(1 / 60)
    expect(t.position.x).toBeCloseTo(100, 1)
    expect(t.speed).toBe(0)
  })

  it('циклічний маршрут повертається на старт', () => {
    const t = new Target(
      {
        id: 'm',
        kind: 'target',
        label: '',
        hitRadius: 4,
        height: 3,
        length: 8,
        route: { points: [[0, 0], [100, 0], [100, 100], [0, 100]], speed: 25, loop: true },
      },
      terrain,
    )
    const start = { ...t.position }
    for (let i = 0; i < 16 * 60; i++) t.update(1 / 60) // рівно один оберт 400 м
    expect(vlen(vsub(t.position, start))).toBeLessThan(3)
  })

  it('пауза на точці зупиняє рух', () => {
    const t = new Target(
      {
        id: 'm',
        kind: 'target',
        label: '',
        hitRadius: 4,
        height: 3,
        length: 8,
        route: { points: [[0, 0], [50, 0], [100, 0]], speed: 10, loop: false, waitAtPoint: 5 },
      },
      terrain,
    )
    for (let i = 0; i < 6 * 60; i++) t.update(1 / 60) // 5 с їде + 1 с чекає
    expect(t.speed).toBe(0)
    expect(t.position.x).toBeCloseTo(50, 0)
  })

  it('замасковану ціль видно з меншої дистанції', () => {
    const base = { id: 'x', kind: 'target' as const, label: '', position: [0, 0] as [number, number], hitRadius: 4, height: 3, length: 8 }
    const open = new Target(base, terrain)
    const hidden = new Target({ ...base, concealed: true }, terrain)
    expect(hidden.visibilityRange).toBeLessThan(open.visibilityRange * 0.6)
  })
})

describe('геометрія влучання', () => {
  it('відрізок крізь сферу зараховується', () => {
    expect(segmentSphereHit(v3(-10, 0, 0), v3(10, 0, 0), v3(0, 0, 0), 2)) .toBe(true)
  })
  it('відрізок повз сферу не зараховується', () => {
    expect(segmentSphereHit(v3(-10, 5, 0), v3(10, 5, 0), v3(0, 0, 0), 2)).toBe(false)
  })
  it('швидкий дрон не «прошиває» ціль наскрізь між кадрами', () => {
    // 40 м/с × 1/60 с = 0.67 м кроку, але тест перевіряє екстремум: стрибок на 20 м
    expect(segmentSphereHit(v3(0, -10, 0), v3(0, 10, 0), v3(0, 0, 0), 3)).toBe(true)
  })
  it('нульовий відрізок працює як точка', () => {
    expect(segmentSphereHit(v3(1, 0, 0), v3(1, 0, 0), v3(0, 0, 0), 2)).toBe(true)
    expect(segmentSphereHit(v3(5, 0, 0), v3(5, 0, 0), v3(0, 0, 0), 2)).toBe(false)
  })
})

describe('правила місії', () => {
  it('вітер: 0° дме з півночі, тобто в −y', () => {
    const w = windVector({ windFromDeg: 0, windSpeed: 5 } as never)
    expect(w.y).toBeCloseTo(-5, 6)
    expect(w.x).toBeCloseTo(0, 6)
    const e = windVector({ windFromDeg: 90, windSpeed: 5 } as never)
    expect(e.x).toBeCloseTo(-5, 6)
  })

  it('виліт стартує в польоті, дрон стоїть на землі в точці зльоту', () => {
    const s = createSession(getLevel('l1-first-flight'))
    expect(s.mission.outcome).toBe('flying')
    expect(s.drone.state.landed).toBe(true)
    expect(s.drone.state.position.z).toBeGreaterThan(s.terrain.height(s.level.launch.x, s.level.launch.y))
    expect(s.drone.telemetry.armDistanceOk).toBe(false)
  })

  it('удар по призначеній цілі = успіх', () => {
    const s = createSession(getLevel('l1-first-flight'))
    const t = s.mission.primary
    place(s, v3(t.position.x, t.position.y - 30, t.aimPoint.z))
    s.mission.update(FRAME)
    place(s, t.aimPoint)
    const r = s.mission.update(FRAME)
    expect(r.outcome).toBe('success')
    expect(r.hitTargetId).toBe('mock-hull')
  })

  it('удар по цивільному = провал MISIDENTIFIED', () => {
    const s = createSession(getLevel('l2-convoy-road'))
    const civ = s.mission.targets.find((t) => t.spec.kind === 'civilian')!
    place(s, v3(civ.aimPoint.x, civ.aimPoint.y - 200, civ.aimPoint.z))
    s.mission.update(FRAME)
    place(s, civ.aimPoint)
    const r = s.mission.update(FRAME)
    expect(r.outcome).toBe('failed')
    expect(r.reason).toBe('MISIDENTIFIED')
  })

  it('удар по макету = провал DECOY', () => {
    const s = createSession(getLevel('l2-convoy-road'))
    const decoy = s.mission.targets.find((t) => t.spec.kind === 'decoy')!
    place(s, v3(decoy.aimPoint.x, decoy.aimPoint.y - 200, decoy.aimPoint.z))
    s.mission.update(FRAME)
    place(s, decoy.aimPoint)
    const r = s.mission.update(FRAME)
    expect(r.outcome).toBe('failed')
    expect(r.reason).toBe('DECOY')
  })

  it('удар ближче за дистанцію зведення не зараховується', () => {
    // ціль стоїть за 20 м від точки зльоту, а БК зводиться на 100 м
    const base = getLevel('l2-convoy-road')
    const near = {
      ...base,
      payloadId: 'medium',
      primaryTargetId: 'close-target',
      targets: [
        {
          id: 'close-target',
          kind: 'target' as const,
          label: 'ціль впритул',
          position: [base.launch.x, base.launch.y + 20] as [number, number],
          hitRadius: 4,
          height: 3,
          length: 8,
        },
      ],
    }
    const s = createSession(near)
    const t = s.mission.primary
    expect(s.drone.payload.armDistance).toBeGreaterThan(20)
    place(s, v3(t.aimPoint.x, t.aimPoint.y - 10, t.aimPoint.z))
    s.mission.update(FRAME)
    place(s, t.aimPoint)
    const r = s.mission.update(FRAME)
    expect(r.outcome).toBe('failed')
    expect(r.reason).toBe('NOT_ARMED')
  })

  it('той самий удар після набору дистанції зведення зараховується', () => {
    const base = getLevel('l2-convoy-road')
    const far = {
      ...base,
      payloadId: 'medium',
      primaryTargetId: 'far-target',
      targets: [
        {
          id: 'far-target',
          kind: 'target' as const,
          label: 'ціль за 300 м',
          position: [base.launch.x, base.launch.y + 300] as [number, number],
          hitRadius: 4,
          height: 3,
          length: 8,
        },
      ],
    }
    const s = createSession(far)
    const t = s.mission.primary
    place(s, v3(t.aimPoint.x, t.aimPoint.y - 30, t.aimPoint.z))
    s.mission.update(FRAME)
    place(s, t.aimPoint)
    const r = s.mission.update(FRAME)
    expect(r.outcome).toBe('success')
  })

  it('ідентифікація вимагає утримання цілі в кадрі', () => {
    const s = createSession(getLevel('l1-first-flight'))
    const t = s.mission.primary
    place(s, v3(t.position.x, t.position.y - 40, t.aimPoint.z + 10), t.aimPoint)
    s.mission.update(FRAME)
    expect(t.identified).toBe(false)
    for (let i = 0; i < Math.ceil(ID_HOLD_SECONDS / FRAME) + 2; i++) s.mission.update(FRAME)
    expect(t.identified).toBe(true)
    expect(s.mission.idFlash).toBeGreaterThan(0)
  })

  it('ціль поза кадром не ідентифікується', () => {
    const s = createSession(getLevel('l1-first-flight'))
    const t = s.mission.primary
    // дивимось у протилежний бік
    place(s, v3(t.position.x, t.position.y - 40, t.aimPoint.z), v3(t.position.x, t.position.y - 400, t.aimPoint.z))
    for (let i = 0; i < 300; i++) s.mission.update(FRAME)
    expect(t.identified).toBe(false)
  })

  it('ціль задалеко не ідентифікується', () => {
    const s = createSession(getLevel('l1-first-flight'))
    const t = s.mission.primary
    place(s, v3(t.position.x, t.position.y - (ID_RANGE + 60), t.aimPoint.z + 20), t.aimPoint)
    for (let i = 0; i < 300; i++) s.mission.update(FRAME)
    expect(t.identified).toBe(false)
  })

  it('перерваний огляд скидає накопичений час', () => {
    const s = createSession(getLevel('l1-first-flight'))
    const t = s.mission.primary
    const near = v3(t.position.x, t.position.y - 40, t.aimPoint.z + 8)
    place(s, near, t.aimPoint)
    for (let i = 0; i < 40; i++) s.mission.update(FRAME) // ~0.67 с
    const partial = t.observedFor
    expect(partial).toBeGreaterThan(0.3)
    place(s, near, v3(t.position.x, t.position.y - 400, t.aimPoint.z))
    for (let i = 0; i < 60; i++) s.mission.update(FRAME)
    expect(t.observedFor).toBe(0)
    expect(t.identified).toBe(false)
  })

  it('сигнал падає з дистанцією і зникає за межами дальності', () => {
    const s = createSession(getLevel('l1-first-flight'))
    place(s, v3(s.level.launch.x, s.level.launch.y + 100, 80))
    s.mission.update(FRAME)
    const near = s.mission.signal
    place(s, v3(s.level.launch.x, s.level.launch.y + s.drone.spec.vtx.rangeM * 0.9, 80))
    s.mission.update(FRAME)
    expect(s.mission.signal).toBeLessThan(near)
    expect(s.mission.signal).toBeGreaterThan(0)
  })

  it('низько над рельєфом сигнал гірший, ніж на висоті', () => {
    const s = createSession(getLevel('l2-convoy-road'))
    const x = s.level.launch.x + 400
    const y = s.level.launch.y + 400
    place(s, v3(x, y, s.terrain.height(x, y) + 3))
    s.mission.update(FRAME)
    const low = s.mission.signal
    place(s, v3(x, y, s.terrain.height(x, y) + 90))
    s.mission.update(FRAME)
    expect(s.mission.signal).toBeGreaterThan(low)
  })

  it('втрата сигналу довше за ліміт = провал', () => {
    // велика карта, щоб можна було вийти за дальність VTX, не покидаючи меж
    const wide = { ...getLevel('l1-first-flight'), terrain: { ...getLevel('l1-first-flight').terrain, size: 9000 } }
    const s = createSession(wide)
    const far = s.drone.spec.vtx.rangeM * 1.5
    place(s, v3(s.level.launch.x, s.level.launch.y + far, s.terrain.height(0, 0) + 2))
    expect(s.mission.update(FRAME).outcome).toBe('flying')
    expect(s.mission.signal).toBeLessThan(0.05)
    const r = tick(s, SIGNAL_LOSS_LIMIT + 1)
    expect(r.outcome).toBe('failed')
    expect(r.reason).toBe('SIGNAL_LOST')
  })

  it('у межах карти сигнал ніколи не втрачається — межа рейду не невидима стіна', () => {
    for (const level of LEVELS) {
      const s = createSession(level)
      const size = s.terrain.config.size
      for (const [x, y] of [[size, size], [-size, size], [size, -size], [-size, -size]]) {
        place(s, v3(x, y, s.terrain.height(x, y) + 60))
        s.mission.update(FRAME)
        expect(s.mission.signal, `${level.id} @ ${x},${y}`).toBeGreaterThan(0.05)
      }
    }
  })

  it('вихід за межі карти = провал', () => {
    const s = createSession(getLevel('l1-first-flight'))
    place(s, v3(5000, 0, 100))
    const r = s.mission.update(FRAME)
    expect(r.outcome).toBe('failed')
    expect(r.reason).toBe('OUT_OF_BOUNDS')
  })

  it('вичерпання таймера = провал', () => {
    const s = createSession(getLevel('l1-first-flight'))
    place(s, v3(s.level.launch.x, s.level.launch.y, 60))
    const r = tick(s, s.level.timeLimitS + 1, 0.5)
    expect(r.outcome).toBe('failed')
    expect(r.reason).toBe('TIMEOUT')
  })

  it('падіння = провал', () => {
    const s = createSession(getLevel('l1-first-flight'))
    s.drone.state.position = v3(s.level.launch.x, s.level.launch.y, s.terrain.height(s.level.launch.x, s.level.launch.y) + 60)
    for (let i = 0; i < 5 / PHYSICS_DT; i++) {
      s.drone.step({ ...neutralInput(), armed: true, throttle: 0 }, PHYSICS_DT)
      const r = s.mission.update(PHYSICS_DT)
      if (r.outcome === 'failed') {
        expect(r.reason).toBe('CRASHED')
        return
      }
    }
    throw new Error('дрон мав розбитися')
  })

  it('після завершення місія більше не змінює стан', () => {
    const s = createSession(getLevel('l1-first-flight'))
    place(s, v3(5000, 0, 100))
    const first = s.mission.update(FRAME)
    const second = s.mission.update(FRAME)
    expect(second.outcome).toBe(first.outcome)
    expect(second.reason).toBe(first.reason)
    expect(second.stats.timeS).toBe(first.stats.timeS)
  })

  it('таймер і статистика накопичуються', () => {
    const s = createSession(getLevel('l2-convoy-road'))
    place(s, v3(s.level.launch.x, s.level.launch.y, 60))
    tick(s, 5)
    expect(s.mission.stats.timeS).toBeGreaterThan(4.9)
    expect(s.mission.timeLeft).toBeLessThan(s.level.timeLimitS)
    expect(s.mission.stats.mahUsed).toBeGreaterThanOrEqual(0)
  })

  it('поточний квадрат рахується від позиції дрона', () => {
    const s = createSession(getLevel('l2-convoy-road'))
    const c = gridCenter(s.terrain, 'D4')!
    place(s, v3(c.x, c.y, 80))
    expect(s.mission.currentCell).toBe('D4')
  })
})

describe('цілісність рівнів', () => {
  it.each(LEVELS.map((l) => [l.id, l] as const))('%s коректний', (_id, level) => {
    const s = createSession(level)
    expect(s.mission.primary).toBeDefined()
    expect(s.terrain.inBounds(level.launch.x, level.launch.y)).toBe(true)
    expect(level.timeLimitS).toBeGreaterThan(60)
    expect(level.objectives.length).toBeGreaterThan(0)
    expect(level.searchCells.length).toBeGreaterThan(0)

    for (const cell of level.searchCells) {
      expect(gridCenter(s.terrain, cell), `квадрат ${cell}`).not.toBeNull()
    }
    for (const t of level.targets) {
      expect(t.hitRadius).toBeGreaterThan(0)
      const p = t.route ? t.route.points[0] : t.position!
      expect(s.terrain.inBounds(p[0], p[1]), `ціль ${t.id} поза картою`).toBe(true)
    }
  })

  it('індекси та id рівнів унікальні й послідовні', () => {
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(LEVELS.length)
    LEVELS.forEach((l, i) => expect(l.index).toBe(i + 1))
  })

  it('призначена ціль кожного рівня — у заявлених квадратах пошуку', () => {
    for (const level of LEVELS) {
      const s = createSession(level)
      const t = s.mission.primary
      const cells = new Set(level.searchCells)
      // для рухомої цілі перевіряємо весь маршрут
      const points = t.spec.route ? t.spec.route.points : [t.spec.position!]
      const covered = points.some(([x, y]) => cells.has(gridLabel(s.terrain, x, y) ?? ''))
      expect(covered, `${level.id}: ціль поза квадратами брифінгу`).toBe(true)
    }
  })

  it('на кожному бойовому рівні є що переплутати', () => {
    const combat = LEVELS.filter((l) => !l.allowAngleMode)
    expect(combat.length).toBeGreaterThan(0)
    for (const l of combat) {
      const distractors = l.targets.filter((t) => t.kind !== 'target')
      expect(distractors.length, l.id).toBeGreaterThan(0)
    }
  })

  it('усі рівні мають запас тяги з їхнім БК', () => {
    for (const l of LEVELS) {
      const s = createSession(l)
      expect(s.drone.thrustToWeight, l.id).toBeGreaterThan(1.4)
    }
  })

  it('заряду вистачає на ліміт часу з розумним запасом', () => {
    for (const l of LEVELS) {
      const s = createSession(l)
      const d = s.drone
      const start = { x: d.state.position.x, y: d.state.position.y }
      for (let i = 0; i < 30 / PHYSICS_DT; i++) {
        d.step({ ...neutralInput(), armed: true, throttle: d.hoverThrottle }, PHYSICS_DT)
      }
      const mahPerSec = d.battery.mahUsed / 30
      const enduranceS = d.spec.battery.capacityMah / mahPerSec
      // висіти весь виліт не можна — але половину ліміту заряд мусить тягнути
      expect(enduranceS, l.id).toBeGreaterThan(l.timeLimitS * 0.5)
      expect(start).toBeDefined()
    }
  })
})
