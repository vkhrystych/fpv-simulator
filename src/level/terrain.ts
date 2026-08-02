import { clamp } from '../flight/math'

/**
 * Детермінований рельєф із seed. Жодних асетів: висота — чиста функція (x, y),
 * тому і фізика, і рендер, і мінімапа брифінгу бачать однакову землю.
 */

/**
 * Цілочисельний хеш строго через Math.imul: усі проміжні значення лишаються
 * в int32. Звичайне множення тут не годиться — великі константи виходять
 * за точність float64, молодші біти гинуть, і для частини сідів шум
 * вироджується в константу (тобто рельєф стає ідеально плоским).
 */
const hash2 = (ix: number, iy: number, seed: number): number => {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul(seed | 0, 1442695041)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

const fade = (t: number): number => t * t * (3 - 2 * t)

function valueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = fade(x - ix)
  const fy = fade(y - iy)
  const a = hash2(ix, iy, seed)
  const b = hash2(ix + 1, iy, seed)
  const c = hash2(ix, iy + 1, seed)
  const d = hash2(ix + 1, iy + 1, seed)
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy
}

export interface TerrainConfig {
  seed: number
  /** півсторона світу в метрах: карта від −size до +size */
  size: number
  /** амплітуда рельєфу, м */
  amplitude: number
  /** довжина найбільшої хвилі рельєфу, м */
  featureSize: number
}

export const DEFAULT_TERRAIN: TerrainConfig = {
  seed: 1337,
  size: 1000,
  amplitude: 18,
  featureSize: 700,
}

export class Terrain {
  constructor(readonly config: TerrainConfig = DEFAULT_TERRAIN) {}

  /** Висота землі, м. Чиста функція — однакова у фізиці й у рендері. */
  height(x: number, y: number): number {
    const { seed, amplitude, featureSize } = this.config
    let h = 0
    let amp = 1
    let freq = 1 / featureSize
    let norm = 0
    for (let o = 0; o < 4; o++) {
      h += valueNoise(x * freq, y * freq, seed + o * 101) * amp
      norm += amp
      amp *= 0.45
      freq *= 2.1
    }
    return (h / norm - 0.5) * 2 * amplitude
  }

  /** Нормаль поверхні — для орієнтації об’єктів на схилі. */
  normal(x: number, y: number, eps = 1): [number, number, number] {
    const hx = this.height(x + eps, y) - this.height(x - eps, y)
    const hy = this.height(x, y + eps) - this.height(x, y - eps)
    const nx = -hx / (2 * eps)
    const ny = -hy / (2 * eps)
    const len = Math.hypot(nx, ny, 1)
    return [nx / len, ny / len, 1 / len]
  }

  /** Крутизна схилу в градусах — де можна сісти, а де ні. */
  slopeDeg(x: number, y: number): number {
    const n = this.normal(x, y)
    return (Math.acos(clamp(n[2], -1, 1)) * 180) / Math.PI
  }

  /**
   * Шум для візуальної розбивки на поля. Не впливає на фізику — але без нього
   * земля з висоти виглядає однорідною плямою, і пілот не відчуває ні висоти,
   * ні швидкості, ні того, що він узагалі рухається.
   */
  patchNoise(x: number, y: number, scale: number, salt = 0): number {
    return valueNoise(x / scale, y / scale, this.config.seed + 7919 + salt)
  }

  inBounds(x: number, y: number): boolean {
    const s = this.config.size
    return x >= -s && x <= s && y >= -s && y <= s
  }
}

/** Сітка квадратів A1…H8 — єдина «навігація», яку має гравець. */
export const GRID_COLS = 8
export const GRID_ROWS = 8
const COL_LETTERS = 'ABCDEFGH'

export function gridCellSize(terrain: Terrain): number {
  return (terrain.config.size * 2) / GRID_COLS
}

/** Світові координати → мітка квадрата, або null за межами карти. */
export function gridLabel(terrain: Terrain, x: number, y: number): string | null {
  if (!terrain.inBounds(x, y)) return null
  const s = terrain.config.size
  const cell = gridCellSize(terrain)
  const col = clamp(Math.floor((x + s) / cell), 0, GRID_COLS - 1)
  // рядок 1 — північний край карти (+y), як на паперовій мапі
  const row = clamp(Math.floor((s - y) / cell), 0, GRID_ROWS - 1)
  return `${COL_LETTERS[col]}${row + 1}`
}

/** Мітка квадрата → координати його центру. */
export function gridCenter(terrain: Terrain, label: string): { x: number; y: number } | null {
  const m = /^([A-H])([1-8])$/.exec(label.toUpperCase())
  if (!m) return null
  const col = COL_LETTERS.indexOf(m[1])
  const row = Number(m[2]) - 1
  const s = terrain.config.size
  const cell = gridCellSize(terrain)
  return { x: -s + (col + 0.5) * cell, y: s - (row + 0.5) * cell }
}
