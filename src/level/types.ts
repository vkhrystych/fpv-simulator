import type { TargetSpec } from '../game/targets'
import type { TerrainConfig } from './terrain'

export interface WeatherSpec {
  /** звідки дме, град (0 = з півночі) */
  windFromDeg: number
  windSpeed: number
  gustStrength: number
  turbulence: number
  timeOfDay: 'dawn' | 'day' | 'dusk' | 'night'
  /** дальність видимості, м */
  visibility: number
  fogDensity: number
}

/**
 * Один виліт усередині рівня. Рівень із кількох вильотів проходиться поспіль:
 * зафейлив будь-який — рівень починається спочатку, з першого вильоту.
 * Кожен виліт — новий борт із повним акумулятором, тому вибір висоти й швидкості
 * доводиться робити щоразу заново.
 */
export interface SortieSpec {
  /** ціль цього вильоту; влучання саме в неї = виліт виконано */
  targetId: string
  /** рядок у брифінгу для цього вильоту */
  note: string
  /** точка зльоту, якщо відрізняється від рівневої */
  launch?: { x: number; y: number; headingDeg: number }
}

export interface LevelSpec {
  id: string
  index: number
  title: string
  /** текст завдання у брифінгу */
  brief: string
  droneId: string
  payloadId: string
  terrain: TerrainConfig
  weather: WeatherSpec
  launch: { x: number; y: number; headingDeg: number }
  /** ліміт часу на виліт, с */
  timeLimitS: number
  targets: TargetSpec[]
  /** вильоти рівня по черзі; майже завжди один, але буває 2–3 */
  sorties: SortieSpec[]
  /** квадрати ймовірного розташування — усе, що гравець бачить у брифінгу */
  searchCells: string[]
  /** режим польоту: тренування дозволяє ANGLE */
  allowAngleMode: boolean
  objectives: string[]
}

export type FailReason =
  | 'CRASHED'
  | 'HIT_OBSTACLE'
  | 'BATTERY_EMPTY'
  | 'SIGNAL_LOST'
  | 'TIMEOUT'
  | 'MISIDENTIFIED'
  | 'DECOY'
  | 'NOT_ARMED'
  | 'OUT_OF_BOUNDS'

export type MissionOutcome = 'flying' | 'success' | 'failed'
