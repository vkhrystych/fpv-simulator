import { describe, it, expect } from 'vitest'
import { PropField, PROP_LABELS, type PropKind } from '../src/level/props'
import { Terrain, DEFAULT_TERRAIN } from '../src/level/terrain'
import { createSession, clearZones } from '../src/game/session'
import { LEVELS, getLevel } from '../src/level/levels'
import { v3 } from '../src/flight/math'
import { neutralInput } from '../src/flight/types'
import { PHYSICS_DT } from '../src/flight/drone'

const FRAME = 1 / 60
const terrain = new Terrain(DEFAULT_TERRAIN)

describe('наповнення карти', () => {
  const field = new PropField(terrain)

  it('карта не з самих дерев — є всі види', () => {
    const kinds: PropKind[] = ['tree', 'bush', 'building', 'haystack', 'pole']
    for (const k of kinds) {
      expect(field.ofKind(k).length, `${k} не згенеровано`).toBeGreaterThan(0)
    }
  })

  it('дерев найбільше, будівель найменше — це поле, а не місто', () => {
    expect(field.ofKind('tree').length).toBeGreaterThan(field.ofKind('bush').length)
    expect(field.ofKind('bush').length).toBeGreaterThan(field.ofKind('building').length)
  })

  it('генерація детермінована для одного seed', () => {
    const a = new PropField(terrain)
    const b = new PropField(terrain)
    expect(a.props.length).toBe(b.props.length)
    expect(a.props[10]).toEqual(b.props[10])
  })

  it('різні seed — різне наповнення', () => {
    const other = new PropField(new Terrain({ ...DEFAULT_TERRAIN, seed: 4242 }))
    expect(other.props[10]).not.toEqual(field.props[10])
  })

  it('усе стоїть на землі, а не висить у повітрі', () => {
    for (const p of field.props.slice(0, 300)) {
      expect(p.groundZ).toBeCloseTo(terrain.height(p.x, p.y), 6)
      expect(p.height).toBeGreaterThan(0)
    }
  })

  it('усе в межах карти', () => {
    for (const p of field.props) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(DEFAULT_TERRAIN.size + 50)
      expect(Math.abs(p.y)).toBeLessThanOrEqual(DEFAULT_TERRAIN.size + 50)
    }
  })

  it('стовпи ЛЕП вишикувані в лінію, а не розкидані', () => {
    const poles = field.ofKind('pole')
    expect(poles.length).toBeGreaterThan(10)
    // у ряду сусідні стовпи стоять приблизно на однаковій відстані
    const gaps = poles
      .slice(1, 12)
      .map((p, i) => Math.hypot(p.x - poles[i].x, p.y - poles[i].y))
      .filter((g) => g < 200)
    expect(gaps.length).toBeGreaterThan(4)
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length
    for (const g of gaps) expect(Math.abs(g - avg)).toBeLessThan(avg * 0.35)
  })

  it('у кожного виду є людська назва для дебрифу', () => {
    for (const p of field.props) expect(PROP_LABELS[p.kind]).toBeTruthy()
  })
})

describe('зіткнення з перешкодами', () => {
  const field = new PropField(terrain, { bushes: 0, buildings: 0, haystacks: 0, powerLines: 0 })
  const tree = field.ofKind('tree')[0]

  it('політ крізь стовбур зараховується', () => {
    const z = tree.groundZ + tree.height * 0.5
    const hit = field.hitTest(v3(tree.x - 30, tree.y, z), v3(tree.x + 30, tree.y, z))
    expect(hit?.kind).toBe('tree')
  })

  it('політ над кроною — не зараховується', () => {
    const z = tree.groundZ + tree.height + 5
    expect(field.hitTest(v3(tree.x - 30, tree.y, z), v3(tree.x + 30, tree.y, z))).toBeNull()
  })

  it('політ повз стовбур — не зараховується', () => {
    const z = tree.groundZ + tree.height * 0.5
    const side = (tree.radius ?? 2) + 6
    expect(field.hitTest(v3(tree.x - 30, tree.y + side, z), v3(tree.x + 30, tree.y + side, z))).toBeNull()
  })

  it('швидкий дрон не «прошиває» дерево між кадрами', () => {
    // 40 м/с × 1/60 с = 0.67 м; беремо екстремальний стрибок на 25 м
    const z = tree.groundZ + tree.height * 0.4
    expect(field.hitTest(v3(tree.x, tree.y - 12, z), v3(tree.x, tree.y + 13, z))).not.toBeNull()
  })

  it('будівля має прямокутний слід, а не круглий', () => {
    const site = new PropField(terrain, { trees: 0, bushes: 0, haystacks: 0, powerLines: 0 })
    const b = site.ofKind('building')[0]
    const z = b.groundZ + b.height * 0.5
    // політ уздовж довгої осі крізь центр — зіткнення
    const c = Math.cos(b.rotation)
    const s = Math.sin(b.rotation)
    const L = (b.halfL ?? 6) + 25
    const from = v3(b.x - -s * L, b.y - c * L, z)
    const to = v3(b.x + -s * L, b.y + c * L, z)
    expect(site.hitTest(from, to)?.kind).toBe('building')
    // а збоку на відстані, більшій за півширину — вільно
    const off = (b.halfW ?? 4) + 12
    expect(site.hitTest(v3(from.x + c * off, from.y - s * off, z), v3(to.x + c * off, to.y - s * off, z))).toBeNull()
  })

  it('над низьким кущем можна пролетіти, крізь — ні', () => {
    const bushes = new PropField(terrain, { trees: 0, buildings: 0, haystacks: 0, powerLines: 0 })
    const bush = bushes.ofKind('bush')[0]
    const low = bush.groundZ + bush.height * 0.5
    const high = bush.groundZ + bush.height + 3
    expect(bushes.hitTest(v3(bush.x - 10, bush.y, low), v3(bush.x + 10, bush.y, low))).not.toBeNull()
    expect(bushes.hitTest(v3(bush.x - 10, bush.y, high), v3(bush.x + 10, bush.y, high))).toBeNull()
  })
})

describe('перешкоди в місії', () => {
  it('удар у дерево = провал із причиною HIT_OBSTACLE', () => {
    const s = createSession(getLevel('l2-convoy-road'))
    const tree = s.props.ofKind('tree')[0]
    const z = tree.groundZ + tree.height * 0.5
    s.drone.state.position = v3(tree.x, tree.y - 12, z)
    s.mission.update(FRAME)
    s.drone.state.position = v3(tree.x, tree.y + 2, z)
    const r = s.mission.update(FRAME)
    expect(r.outcome).toBe('failed')
    expect(r.reason).toBe('HIT_OBSTACLE')
    expect(r.hitObstacle).toBe('tree')
    expect(s.mission.obstacleLabel).toBe('a tree')
  })

  it('влучання в ціль важливіше за перешкоду поруч', () => {
    const s = createSession(getLevel('l1-first-flight'))
    const t = s.mission.primary
    s.drone.state.position = v3(t.aimPoint.x, t.aimPoint.y - 12, t.aimPoint.z)
    s.mission.update(FRAME)
    s.drone.state.position = t.aimPoint
    const r = s.mission.update(FRAME)
    expect(r.outcome).toBe('success')
  })

  it('стрибок позиції не рахується за зіткнення', () => {
    const s = createSession(getLevel('l2-convoy-road'))
    s.drone.state.position = v3(900, 900, 200)
    const r = s.mission.update(FRAME)
    expect(r.reason).not.toBe('HIT_OBSTACLE')
  })

  it('політ на висоті над лісосмугою безпечний', () => {
    const s = createSession(getLevel('l2-convoy-road'))
    const tree = s.props.ofKind('tree')[0]
    const z = tree.groundZ + tree.height + 25
    s.drone.state.position = v3(tree.x, tree.y - 20, z)
    s.mission.update(FRAME)
    for (let i = 0; i < 40; i++) {
      s.drone.state.position = v3(tree.x, tree.y - 20 + i, z)
      expect(s.mission.update(FRAME).reason).not.toBe('HIT_OBSTACLE')
    }
  })
})

describe('чесність розміщення', () => {
  it('навколо кожної точки зльоту чисто', () => {
    for (const level of LEVELS) {
      const s = createSession(level)
      const launches = [level.launch, ...level.sorties.map((x) => x.launch).filter(Boolean)]
      for (const l of launches) {
        expect(s.props.clearanceAt(l!.x, l!.y), `${level.id}: зліт у перешкоді`).toBeGreaterThan(20)
      }
    }
  })

  it('маршрути цілей вільні від перешкод', () => {
    for (const level of LEVELS) {
      const s = createSession(level)
      for (const t of level.targets) {
        const pts = t.route ? t.route.points : t.position ? [t.position] : []
        for (const [x, y] of pts) {
          expect(s.props.clearanceAt(x, y), `${level.id}/${t.id}: ціль у перешкоді`).toBeGreaterThan(12)
        }
      }
    }
  })

  it('зони очищення покривають і точки, і коридори між ними', () => {
    const zones = clearZones(getLevel('l2-convoy-road'))
    expect(zones.length).toBeGreaterThan(10)
    for (const z of zones) expect(z.radius).toBeGreaterThan(0)
  })

  it('дрон може злетіти вертикально, ні в що не влетівши', () => {
    for (const level of LEVELS) {
      const s = createSession(level)
      const start = { ...s.drone.state.position }
      for (let i = 0; i < 3 / PHYSICS_DT; i++) {
        s.drone.step({ ...neutralInput(), armed: true, throttle: 1 }, PHYSICS_DT)
        if (s.mission.update(PHYSICS_DT).reason === 'HIT_OBSTACLE') {
          throw new Error(`${level.id}: зліт у перешкоду з ${start.x},${start.y}`)
        }
      }
      expect(s.drone.state.position.z).toBeGreaterThan(start.z + 10)
    }
  })
})
