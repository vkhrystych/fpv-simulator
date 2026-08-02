import { clamp } from './math'
import type { DroneSpec } from './types'

/** Якість гвинта (figure of merit). Нижче — більше струму на ту саму тягу. */
const FIGURE_OF_MERIT = 0.42
/** Постійне споживання польотника, камери та відеопередавача, Вт. */
const AVIONICS_WATTS = 25

export const CELL_FULL = 4.2
export const CELL_NOMINAL = 3.7
export const CELL_EMPTY = 3.3

/** Напруга спокою від залишку заряду. Плаский середній сегмент, різкий обвал у кінці. */
export function restingCellVoltage(stateOfCharge: number): number {
  const soc = clamp(stateOfCharge, 0, 1)
  if (soc > 0.2) {
    // 4.2 → 3.75 майже лінійно
    return CELL_EMPTY + 0.45 + (soc - 0.2) * ((CELL_FULL - CELL_EMPTY - 0.45) / 0.8)
  }
  // останні 20% валяться швидко
  return CELL_EMPTY + (soc / 0.2) * 0.45
}

export class Battery {
  mahUsed = 0
  voltage: number
  /** миттєвий струм, А */
  current = 0
  /** множник P = k · T^1.5, виведений із площі ометаної поверхні */
  private readonly powerCoefficient: number

  constructor(
    private spec: DroneSpec['battery'],
    propRadius: number,
    airDensity = 1.225,
  ) {
    this.voltage = spec.cells * CELL_FULL
    const diskArea = Math.PI * propRadius * propRadius
    // теорія імпульсу: P_ідеальна = T^1.5 / sqrt(2ρA); реальний гвинт гірший у FoM разів
    this.powerCoefficient = 1 / (Math.sqrt(2 * airDensity * diskArea) * FIGURE_OF_MERIT)
  }

  get stateOfCharge(): number {
    return clamp(1 - this.mahUsed / this.spec.capacityMah, 0, 1)
  }

  get nominalVoltage(): number {
    return this.spec.cells * CELL_NOMINAL
  }

  get empty(): boolean {
    return this.stateOfCharge <= 0
  }

  /** Відношення поточної напруги до номінальної — множник стелі обертів. */
  get voltageRatio(): number {
    return this.voltage / this.nominalVoltage
  }

  /**
   * Потужність гвинта ∝ T^1.5 — тому важкий дрон їсть непропорційно більше,
   * а зависання з великим БК саме по собі коротке. Просадка = I × Rвн:
   * наприкінці польоту той самий газ дає менше тяги.
   * @param thrusts тяга кожного мотора, Н
   */
  step(thrusts: number[], dt: number): void {
    let power = AVIONICS_WATTS
    for (const t of thrusts) {
      if (t > 0) power += this.powerCoefficient * t ** 1.5
    }

    const resting = this.spec.cells * restingCellVoltage(this.stateOfCharge)
    this.current = power / Math.max(resting, 1)
    this.voltage = Math.max(this.spec.cells * 2.8, resting - this.current * this.spec.internalResistance)
    this.mahUsed += (this.current * 1000 * dt) / 3600
  }

  reset(): void {
    this.mahUsed = 0
    this.current = 0
    this.voltage = this.spec.cells * CELL_FULL
  }
}
