import { clamp, makeRng, type Vec3 } from '../flight/math'
// building-data — чисті числа без three.js, тому логічному шару можна:
// пропорції моделей потрібні тут, щоб колайдер збігався з тим, що намальовано
import { BUILDING_RATIOS } from '../render/building-data'
import type { Terrain } from './terrain'

/**
 * Наповнення карти: лісосмуги, чагарники, ферми, стоги, стовпи ЛЕП.
 *
 * Живе в логічному шарі, а не в рендері, бо об це тепер б'ються: і меші,
 * і колізії мусять брати позиції з ОДНОГО детермінованого джерела —
 * інакше гравець розіб'ється об дерево, якого не бачить.
 *
 * Крім зіткнень, це головний орієнтир пілота: по будівлях і лісосмугах
 * читається висота, швидкість і напрямок, а цілі отримують за чим ховатись.
 */

export type PropKind = 'tree' | 'bush' | 'building' | 'haystack' | 'pole'

export interface Prop {
  kind: PropKind
  x: number
  y: number
  /** висота землі під об'єктом */
  groundZ: number
  /** повна висота, м */
  height: number
  rotation: number
  /** круглий слід: дерева, стоги, стовпи, кущі */
  radius?: number
  /** прямокутний слід (напівдовжини в локальних осях): будівлі */
  halfW?: number
  halfL?: number
  /**
   * Індекс моделі будівлі (BUILDING_TYPES): обирається при генерації, бо
   * габарити колайдера кроються під пропорції саме цієї моделі. Для решти
   * видів варіант рендер добирає хешем координат.
   */
  variant?: number
  /** масштаб для рендера */
  scale: number
  /**
   * Траверса ЛЕП: тонка плита впоперек стовпа, зверху щогли.
   * Без неї в найпомітнішу частину стовпа можна пролетіти наскрізь —
   * колайдер щогли має радіус 0.6 м, а траверса розкинута на 4.3 м.
   */
  arm?: PropArm
}

export interface PropArm {
  /** півширина плити вздовж локальної осі X, м */
  halfSpan: number
  halfThick: number
  /** межі по висоті, у частках `height` */
  z0: number
  z1: number
}

/** Одна траверса на всі стовпи — усі три моделі малюють її однаковою. */
export const POLE_ARM: PropArm = { halfSpan: 2.15, halfThick: 0.2, z0: 0.75, z1: 1 }

/** Людські назви для дебрифу — гравець мусить розуміти, у що саме він влетів. */
export const PROP_LABELS: Record<PropKind, string> = {
  tree: 'a tree',
  bush: 'a bush',
  building: 'a building',
  haystack: 'a haystack',
  pole: 'a power line pole',
}

export interface Exclusion {
  x: number
  y: number
  radius: number
}

const CELL = 60
const TREE_BASE_HEIGHT = 13
const TREE_BASE_RADIUS = 2.6
/** Крона рідка по краях, тому радіус зіткнення менший за візуальний. */
const CROWN_COLLISION_FACTOR = 0.62

export interface PropFieldOptions {
  trees?: number
  bushes?: number
  buildings?: number
  haystacks?: number
  /** ряди стовпів ЛЕП */
  powerLines?: number
  /** зони, де нічого не ставимо: точки зльоту й маршрути цілей */
  exclusions?: Exclusion[]
}

export class PropField {
  readonly props: Prop[] = []
  private grid = new Map<string, Prop[]>()

  constructor(
    private terrain: Terrain,
    options: PropFieldOptions = {},
  ) {
    const {
      trees = 900,
      bushes = 520,
      buildings = 22,
      haystacks = 46,
      powerLines = 2,
      exclusions = [],
    } = options

    const size = terrain.config.size
    const seed = terrain.config.seed
    // окремий генератор на кожен вид: додавання нового виду не зсуває решту
    this.spawnTrees(makeRng(seed ^ 0x7ee5), size, trees, exclusions)
    this.spawnBushes(makeRng(seed ^ 0x1b05), size, bushes, exclusions)
    this.spawnBuildings(makeRng(seed ^ 0x8017), size, buildings, exclusions)
    this.spawnHaystacks(makeRng(seed ^ 0x5747), size, haystacks, exclusions)
    this.spawnPowerLines(makeRng(seed ^ 0x901e), size, powerLines, exclusions)
  }

  private blocked(x: number, y: number, pad: number, exclusions: Exclusion[]): boolean {
    for (const e of exclusions) {
      if (Math.hypot(x - e.x, y - e.y) < e.radius + pad) return true
    }
    return false
  }

  private add(p: Prop): void {
    this.props.push(p)
    const k = `${Math.floor(p.x / CELL)},${Math.floor(p.y / CELL)}`
    const b = this.grid.get(k)
    if (b) b.push(p)
    else this.grid.set(k, [p])
  }

  /** Лісосмуги вздовж осі Y — межі полів, за якими ховається техніка. */
  private spawnTrees(rng: () => number, size: number, count: number, ex: Exclusion[]): void {
    const belts = 7
    for (let i = 0; i < count; i++) {
      const belt = Math.floor(rng() * belts)
      const x = -size + ((belt + 0.5) / belts) * size * 2 + (rng() - 0.5) * 90
      const y = (rng() * 2 - 1) * size
      const scale = 0.7 + rng() * 0.8
      const scaleZ = scale * (0.8 + rng() * 0.5)
      if (this.blocked(x, y, TREE_BASE_RADIUS * scale, ex)) continue
      this.add({
        kind: 'tree',
        x,
        y,
        groundZ: this.terrain.height(x, y),
        height: TREE_BASE_HEIGHT * scaleZ,
        radius: TREE_BASE_RADIUS * scale * CROWN_COLLISION_FACTOR,
        rotation: rng() * Math.PI * 2,
        scale,
      })
    }
  }

  /** Чагарник по всій карті: низький, але на бриючій — смертельний. */
  private spawnBushes(rng: () => number, size: number, count: number, ex: Exclusion[]): void {
    for (let i = 0; i < count; i++) {
      const x = (rng() * 2 - 1) * size
      const y = (rng() * 2 - 1) * size
      const scale = 0.6 + rng() * 0.7
      if (this.blocked(x, y, 2, ex)) continue
      this.add({
        kind: 'bush',
        x,
        y,
        groundZ: this.terrain.height(x, y),
        height: 1.5 * scale,
        radius: 1.5 * scale,
        rotation: rng() * Math.PI * 2,
        scale,
      })
    }
  }

  /** Ферми: будівлі стоять групами по 2–4, як реальні господарства. */
  private spawnBuildings(rng: () => number, size: number, count: number, ex: Exclusion[]): void {
    let placed = 0
    let guard = 0
    while (placed < count && guard++ < count * 20) {
      const cx = (rng() * 2 - 1) * size * 0.88
      const cy = (rng() * 2 - 1) * size * 0.88
      const cluster = 2 + Math.floor(rng() * 3)
      const clusterAngle = rng() * Math.PI * 2

      for (let i = 0; i < cluster && placed < count; i++) {
        const x = cx + (rng() - 0.5) * 55
        const y = cy + (rng() - 0.5) * 55
        // Колайдер кроїться під обрану модель, а не навпаки: інакше дах
        // або стирчить із колайдера, або гравець б'ється об повітря.
        // Фасад 10–20 м, висота не вище 12.5 м — з повітря будинок має
        // читатись як великий орієнтир, а не губитись серед кущів.
        const variant = Math.floor(rng() * BUILDING_RATIOS.length)
        const ratio = BUILDING_RATIOS[variant]
        const facade = Math.min(9.8 + rng() * 9.8, 12.5 / ratio.heightRatio)
        const halfL = facade / 2
        const halfW = (facade * ratio.depthRatio) / 2
        const height = facade * ratio.heightRatio
        if (this.blocked(x, y, Math.max(halfL, halfW) + 6, ex)) continue
        // на крутому схилі будівлю не ставлять
        if (this.terrain.slopeDeg(x, y) > 14) continue
        this.add({
          kind: 'building',
          x,
          y,
          groundZ: this.terrain.height(x, y),
          height,
          halfW,
          halfL,
          variant,
          rotation: clusterAngle + (rng() - 0.5) * 0.5,
          scale: 1,
        })
        placed++
      }
    }
  }

  private spawnHaystacks(rng: () => number, size: number, count: number, ex: Exclusion[]): void {
    for (let i = 0; i < count; i++) {
      const x = (rng() * 2 - 1) * size * 0.92
      const y = (rng() * 2 - 1) * size * 0.92
      const scale = 0.8 + rng() * 0.6
      if (this.blocked(x, y, 3 * scale, ex)) continue
      this.add({
        kind: 'haystack',
        x,
        y,
        groundZ: this.terrain.height(x, y),
        height: 3.2 * scale,
        radius: 2.4 * scale,
        rotation: rng() * Math.PI * 2,
        scale,
      })
    }
  }

  /**
   * ЛЕП: рівний ряд стовпів через усю карту. Найкорисніший орієнтир у грі —
   * пряма лінія на місцевості, де все інше кругле й випадкове.
   */
  private spawnPowerLines(rng: () => number, size: number, lines: number, ex: Exclusion[]): void {
    for (let l = 0; l < lines; l++) {
      const angle = rng() * Math.PI
      const offset = (rng() * 2 - 1) * size * 0.6
      const dx = Math.cos(angle)
      const dy = Math.sin(angle)
      const nx = -dy
      const ny = dx
      const spacing = 62
      const steps = Math.ceil((size * 2.4) / spacing)

      for (let i = -steps / 2; i <= steps / 2; i++) {
        const x = nx * offset + dx * i * spacing
        const y = ny * offset + dy * i * spacing
        if (Math.abs(x) > size || Math.abs(y) > size) continue
        if (this.blocked(x, y, 8, ex)) continue
        this.add({
          kind: 'pole',
          x,
          y,
          groundZ: this.terrain.height(x, y),
          height: 11 + rng() * 2,
          radius: 0.6,
          // траверса дивиться ПОПЕРЕК лінії, тому стовп повернутий на 90°
          rotation: angle + Math.PI / 2,
          scale: 1,
          arm: POLE_ARM,
        })
      }
    }
  }

  ofKind(kind: PropKind): Prop[] {
    return this.props.filter((p) => p.kind === kind)
  }

  /** Об'єкти поблизу точки — лише сусідні комірки сітки, а не всі 1500. */
  near(x: number, y: number, radius = 0): Prop[] {
    const out: Prop[] = []
    const span = Math.ceil((radius + CELL) / CELL)
    const cx = Math.floor(x / CELL)
    const cy = Math.floor(y / CELL)
    for (let i = -span; i <= span; i++) {
      for (let j = -span; j <= span; j++) {
        const b = this.grid.get(`${cx + i},${cy + j}`)
        if (b) out.push(...b)
      }
    }
    return out
  }

  /**
   * Чи перетинає відрізок [from → to] якийсь об'єкт.
   * Відрізком, а не точкою: на 25 м/с дрон за кадр проходить пів метра
   * і міг би «прошити» стовбур наскрізь між двома кадрами.
   */
  hitTest(from: Vec3, to: Vec3, droneRadius = 0.2): Prop | null {
    const midX = (from.x + to.x) / 2
    const midY = (from.y + to.y) / 2
    const span = Math.hypot(to.x - from.x, to.y - from.y) / 2 + 16

    for (const p of this.near(midX, midY, span)) {
      if (hitsBody(from, to, p, droneRadius)) return p
      if (p.arm && hitsArm(from, to, p, droneRadius)) return p
    }
    return null
  }

  /** Відстань до найближчого об'єкта — для перевірок чесності рівня. */
  clearanceAt(x: number, y: number): number {
    let best = Infinity
    for (const p of this.near(x, y, CELL * 2)) {
      const r = p.radius ?? Math.hypot(p.halfW ?? 0, p.halfL ?? 0)
      best = Math.min(best, Math.hypot(x - p.x, y - p.y) - r)
    }
    return best
  }
}

/** Основне тіло об'єкта: круглий слід (дерево, кущ, стіг, щогла) або прямокутний (будівля). */
function hitsBody(from: Vec3, to: Vec3, p: Prop, droneRadius: number): boolean {
  const t = p.radius !== undefined
    ? closestParamToPoint(from, to, p.x, p.y)
    : closestParamToBox(from, to, p.x, p.y, p.rotation, p.halfW ?? 0, p.halfL ?? 0)
  if (t === null) return false

  const px = from.x + (to.x - from.x) * t
  const py = from.y + (to.y - from.y) * t
  const pz = from.z + (to.z - from.z) * t

  if (p.radius !== undefined && Math.hypot(px - p.x, py - p.y) > p.radius + droneRadius) return false
  return pz >= p.groundZ && pz <= p.groundZ + p.height
}

/** Траверса: та сама плита, що й у моделі, тільки з запасом на радіус дрона. */
function hitsArm(from: Vec3, to: Vec3, p: Prop, droneRadius: number): boolean {
  const arm = p.arm!
  const t = closestParamToBox(
    from,
    to,
    p.x,
    p.y,
    p.rotation,
    arm.halfSpan + droneRadius,
    arm.halfThick + droneRadius,
  )
  if (t === null) return false
  const pz = from.z + (to.z - from.z) * t
  return pz >= p.groundZ + p.height * arm.z0 && pz <= p.groundZ + p.height * arm.z1
}

/** Параметр найближчої точки відрізка до вертикальної осі, у [0,1]. */
function closestParamToPoint(from: Vec3, to: Vec3, tx: number, ty: number): number {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const lenSq = dx * dx + dy * dy
  if (lenSq < 1e-12) return 0
  return clamp(((tx - from.x) * dx + (ty - from.y) * dy) / lenSq, 0, 1)
}

/**
 * Перетин відрізка з повернутим прямокутником: переводимо відрізок у локальні
 * осі будівлі й робимо звичайний slab-тест. Повертає параметр входу або null.
 */
function closestParamToBox(
  from: Vec3,
  to: Vec3,
  cx: number,
  cy: number,
  rotation: number,
  hw: number,
  hl: number,
): number | null {
  const c = Math.cos(-rotation)
  const s = Math.sin(-rotation)
  const ax = (from.x - cx) * c - (from.y - cy) * s
  const ay = (from.x - cx) * s + (from.y - cy) * c
  const bx = (to.x - cx) * c - (to.y - cy) * s
  const by = (to.x - cx) * s + (to.y - cy) * c

  const dx = bx - ax
  const dy = by - ay

  let tMin = 0
  let tMax = 1
  for (const [origin, dir, half] of [
    [ax, dx, hw],
    [ay, dy, hl],
  ] as const) {
    if (Math.abs(dir) < 1e-9) {
      if (Math.abs(origin) > half) return null
      continue
    }
    let t1 = (-half - origin) / dir
    let t2 = (half - origin) / dir
    if (t1 > t2) [t1, t2] = [t2, t1]
    tMin = Math.max(tMin, t1)
    tMax = Math.min(tMax, t2)
    if (tMin > tMax) return null
  }
  return tMin
}
