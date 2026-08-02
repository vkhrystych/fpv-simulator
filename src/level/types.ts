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
  /** id призначеної цілі — влучання саме в неї = успіх */
  primaryTargetId: string
  /** квадрати ймовірного розташування — усе, що гравець бачить у брифінгу */
  searchCells: string[]
  /** режим польоту: тренування дозволяє ANGLE */
  allowAngleMode: boolean
  objectives: string[]
}

export type FailReason =
  | 'CRASHED'
  | 'BATTERY_EMPTY'
  | 'SIGNAL_LOST'
  | 'TIMEOUT'
  | 'MISIDENTIFIED'
  | 'DECOY'
  | 'NOT_ARMED'
  | 'OUT_OF_BOUNDS'

export type MissionOutcome = 'flying' | 'success' | 'failed'
