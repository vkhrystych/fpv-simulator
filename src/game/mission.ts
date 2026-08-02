import type { Drone } from '../flight/drone'
import { clamp, qrotate, v3, vdot, vlen, vnorm, vsub, type Vec3 } from '../flight/math'
import { degToRad } from '../flight/rates'
import { Terrain, gridLabel } from '../level/terrain'
import type { FailReason, LevelSpec, MissionOutcome, SortieSpec } from '../level/types'
import { Target } from './targets'

/** Скільки секунд ціль має протриматись у кадрі, щоб зарахувалась ідентифікація. */
export const ID_HOLD_SECONDS = 1.5
/** Максимальна дальність ідентифікації, м. */
export const ID_RANGE = 80
/** Скільки секунд без сигналу до провалу. */
export const SIGNAL_LOSS_LIMIT = 8

export interface MissionStats {
  timeS: number
  distanceM: number
  mahUsed: number
  topSpeed: number
  identified: string[]
}

export interface MissionResult {
  outcome: MissionOutcome
  reason?: FailReason
  hitTargetId?: string
  stats: MissionStats
}

/**
 * Логіка вильоту. Не знає про three.js — усе рішення про успіх/провал
 * ухвалюється тут і тестується без рендера.
 */
export class Mission {
  readonly targets: Target[]
  outcome: MissionOutcome = 'flying'
  reason?: FailReason
  hitTargetId?: string

  /** якість відеосигналу 0..1 */
  signal = 1
  private noSignalFor = 0
  private elapsed = 0
  private topSpeed = 0
  private lastPosition: Vec3
  private travelled = 0
  /** сюди пишемо ID-блимання для OSD */
  idFlash = 0

  constructor(
    readonly level: LevelSpec,
    readonly terrain: Terrain,
    private drone: Drone,
    /** індекс вильоту в межах рівня */
    readonly sortieIndex = 0,
  ) {
    this.targets = level.targets.map((t) => new Target(t, terrain))
    // цілі попередніх вильотів уже уражені — прибираємо їх зі світу,
    // щоб не можна було «перезарахувати» те саме двічі
    for (let i = 0; i < sortieIndex && i < level.sorties.length; i++) {
      const done = this.targets.find((t) => t.spec.id === level.sorties[i].targetId)
      if (done) done.destroyed = true
    }
    this.lastPosition = { ...drone.state.position }
  }

  get sortie(): SortieSpec {
    const s = this.level.sorties[this.sortieIndex]
    if (!s) throw new Error(`level ${this.level.id}: немає вильоту ${this.sortieIndex}`)
    return s
  }

  /** Чи це останній виліт рівня. */
  get isFinalSortie(): boolean {
    return this.sortieIndex >= this.level.sorties.length - 1
  }

  get primary(): Target {
    const t = this.targets.find((x) => x.spec.id === this.sortie.targetId)
    if (!t) throw new Error(`level ${this.level.id}: немає цілі ${this.sortie.targetId}`)
    return t
  }

  get timeLeft(): number {
    return Math.max(0, this.level.timeLimitS - this.elapsed)
  }

  get currentCell(): string | null {
    return gridLabel(this.terrain, this.drone.state.position.x, this.drone.state.position.y)
  }

  /**
   * Висота над рельєфом і статус зведення рахуємо самі, а не беремо з телеметрії:
   * телеметрія оновлюється лише фізичним кроком, а правила місії мусять бути
   * істинними в будь-який момент — зокрема на паузі та в тестах.
   */
  get altitude(): number {
    const p = this.drone.state.position
    return p.z - this.terrain.height(p.x, p.y)
  }

  get armed(): boolean {
    return this.drone.distanceFromLaunch >= this.drone.payload.armDistance
  }

  get stats(): MissionStats {
    return {
      timeS: this.elapsed,
      distanceM: this.travelled,
      mahUsed: this.drone.battery.mahUsed,
      topSpeed: this.topSpeed,
      identified: this.targets.filter((t) => t.identified).map((t) => t.spec.id),
    }
  }

  get result(): MissionResult {
    return { outcome: this.outcome, reason: this.reason, hitTargetId: this.hitTargetId, stats: this.stats }
  }

  /** Напрям, куди дивиться камера (з урахуванням нахилу об’єктива вгору). */
  cameraForward(): Vec3 {
    const tilt = degToRad(this.drone.spec.camera.tiltDeg)
    // у системі тіла: вперед (0,1,0), піднятий на tilt навколо осі X
    const local = v3(0, Math.cos(tilt), Math.sin(tilt))
    return qrotate(this.drone.state.orientation, local)
  }

  update(dt: number): MissionResult {
    if (this.outcome !== 'flying') return this.result

    this.elapsed += dt
    for (const t of this.targets) t.update(dt)

    const pos = this.drone.state.position
    this.travelled += vlen(vsub(pos, this.lastPosition))
    const prev = this.lastPosition
    this.lastPosition = { ...pos }
    this.topSpeed = Math.max(this.topSpeed, this.drone.telemetry.speed)
    this.idFlash = Math.max(0, this.idFlash - dt)

    this.updateSignal(dt)
    this.updateIdentification(dt)

    const impact = this.checkImpact(prev, pos)
    if (impact) return impact

    return this.checkFailures(dt)
  }

  /**
   * Якість сигналу: падає з дистанцією і низько над рельєфом.
   * Це і є природний обмежувач глибини рейду — жодних невидимих стін.
   */
  private updateSignal(dt: number): void {
    const d = this.drone.distanceFromLaunch
    const range = this.drone.spec.vtx.rangeM
    const byDistance = clamp(1 - (d / range) ** 2, 0, 1)
    // низько за пагорбами сигнал гірший, але помірно: політ на бриючій — це
    // тактика, а не покарання. Вище ~80 м — чиста лінія візування.
    const byAltitude = clamp(0.65 + this.altitude / 120, 0, 1)
    this.signal = clamp(byDistance * byAltitude, 0, 1)
    if (this.signal < 0.05) this.noSignalFor += dt
    else this.noSignalFor = 0
  }

  /**
   * Ідентифікація: ціль має протриматись у кадрі ID_HOLD_SECONDS з дистанції < ID_RANGE.
   * Це не маркер і не трекер — лише підтвердження, що гравець її справді бачив.
   */
  private updateIdentification(dt: number): void {
    const forward = this.cameraForward()
    const halfFov = degToRad(this.drone.spec.camera.fov / 2) * 0.6
    const pos = this.drone.state.position

    for (const t of this.targets) {
      if (t.destroyed || t.identified) continue
      const toTarget = vsub(t.aimPoint, pos)
      const dist = vlen(toTarget)
      const inRange = dist < Math.min(ID_RANGE, t.visibilityRange)
      const angle = Math.acos(clamp(vdot(vnorm(toTarget), vnorm(forward)), -1, 1))
      if (inRange && angle < halfFov && this.signal > 0.25) {
        t.observedFor += dt
        if (t.observedFor >= ID_HOLD_SECONDS) {
          t.identified = true
          this.idFlash = 1.2
        }
      } else {
        t.observedFor = Math.max(0, t.observedFor - dt * 1.5)
      }
    }
  }

  /**
   * Влучання шукаємо відрізком, а не точкою: на 30 м/с дрон за кадр
   * проходить пів метра і міг би «прошити» ціль наскрізь.
   */
  private checkImpact(from: Vec3, to: Vec3): MissionResult | null {
    for (const t of this.targets) {
      if (t.destroyed) continue
      const r = t.hitRadius
      if (segmentSphereHit(from, to, t.aimPoint, r)) {
        t.destroyed = true
        this.hitTargetId = t.spec.id

        if (t.spec.kind === 'civilian') return this.fail('MISIDENTIFIED')
        if (t.spec.kind === 'decoy') return this.fail('DECOY')
        if (!this.armed) return this.fail('NOT_ARMED')
        if (t.spec.id !== this.sortie.targetId) return this.fail('DECOY')

        this.outcome = 'success'
        return this.result
      }
    }
    return null
  }

  private checkFailures(dt: number): MissionResult {
    void dt
    const s = this.drone.state
    if (s.crashed) return this.fail('CRASHED')
    if (this.drone.battery.empty) return this.fail('BATTERY_EMPTY')
    if (this.noSignalFor >= SIGNAL_LOSS_LIMIT) return this.fail('SIGNAL_LOST')
    if (this.elapsed >= this.level.timeLimitS) return this.fail('TIMEOUT')
    if (!this.terrain.inBounds(s.position.x, s.position.y)) return this.fail('OUT_OF_BOUNDS')
    return this.result
  }

  private fail(reason: FailReason): MissionResult {
    this.outcome = 'failed'
    this.reason = reason
    return this.result
  }
}

/** Чи перетинає відрізок [a→b] сферу радіуса r у центрі c. */
export function segmentSphereHit(a: Vec3, b: Vec3, c: Vec3, r: number): boolean {
  const ab = vsub(b, a)
  const ac = vsub(c, a)
  const lenSq = vdot(ab, ab)
  if (lenSq < 1e-12) return vlen(ac) <= r
  const t = clamp(vdot(ac, ab) / lenSq, 0, 1)
  const closest = v3(a.x + ab.x * t, a.y + ab.y * t, a.z + ab.z * t)
  return vlen(vsub(c, closest)) <= r
}
