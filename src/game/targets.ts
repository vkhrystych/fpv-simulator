import { clamp, v3, type Vec3 } from '../flight/math'
import type { Terrain } from '../level/terrain'

export type TargetKind =
  /** призначена ціль — влучання = успіх */
  | 'target'
  /** цивільний об’єкт — влучання = провал місії */
  | 'civilian'
  /** макет — влучання = провал завдання, але без «штрафу» */
  | 'decoy'

export interface RouteSpec {
  /** точки маршруту в світових (x, y) */
  points: Array<[number, number]>
  /** крейсерська швидкість, м/с */
  speed: number
  loop: boolean
  /** пауза на кожній точці, с */
  waitAtPoint?: number
}

export interface TargetSpec {
  id: string
  kind: TargetKind
  label: string
  /** статична позиція (x, y); ігнорується, якщо є route */
  position?: [number, number]
  headingDeg?: number
  /** радіус ураження, м */
  hitRadius: number
  /** висота корпуса, м — впливає на видимість і точку влучання */
  height: number
  /** довжина корпуса, м — з неї гравець і розрізняє силует */
  length: number
  route?: RouteSpec
  /** чи стоїть під маскувальною сіткою: видно лише зблизька */
  concealed?: boolean
}

/**
 * Рухома ціль. Прості waypoint-маршрути зі сталою швидкістю та паузами —
 * жодного AI: поведінка мусить бути передбачуваною, щоб гравець міг її прочитати.
 */
export class Target {
  position: Vec3
  heading: number
  speed = 0
  destroyed = false
  /** накопичений час у кадрі камери, с */
  observedFor = 0
  identified = false

  private legIndex = 0
  private legProgress = 0
  private waiting = 0

  constructor(
    readonly spec: TargetSpec,
    private terrain: Terrain,
  ) {
    const p = spec.route ? spec.route.points[0] : (spec.position ?? [0, 0])
    this.position = v3(p[0], p[1], terrain.height(p[0], p[1]))
    this.heading = ((spec.headingDeg ?? 0) * Math.PI) / 180
    if (spec.route && spec.route.points.length > 1) {
      this.heading = this.legHeading(0)
    }
  }

  get isMoving(): boolean {
    return !!this.spec.route && this.spec.route.points.length > 1
  }

  private legHeading(i: number): number {
    const pts = this.spec.route!.points
    const a = pts[i % pts.length]
    const b = pts[(i + 1) % pts.length]
    return Math.atan2(b[0] - a[0], b[1] - a[1])
  }

  update(dt: number): void {
    if (this.destroyed) return
    const route = this.spec.route
    if (!route || route.points.length < 2) {
      this.speed = 0
      return
    }

    if (this.waiting > 0) {
      this.waiting -= dt
      this.speed = 0
      return
    }

    const pts = route.points
    const lastLeg = this.legIndex >= pts.length - 2
    if (!route.loop && lastLeg && this.legProgress >= 1) {
      this.speed = 0
      return
    }

    const a = pts[this.legIndex % pts.length]
    const b = pts[(this.legIndex + 1) % pts.length]
    const legLength = Math.hypot(b[0] - a[0], b[1] - a[1])
    this.speed = route.speed
    this.legProgress += (route.speed * dt) / Math.max(legLength, 1e-6)

    while (this.legProgress >= 1) {
      this.legProgress -= 1
      this.legIndex++
      this.waiting = route.waitAtPoint ?? 0
      if (!route.loop && this.legIndex >= pts.length - 1) {
        this.legIndex = pts.length - 2
        this.legProgress = 1
        this.speed = 0
        break
      }
      if (route.loop) this.legIndex %= pts.length
    }

    const t = clamp(this.legProgress, 0, 1)
    const na = pts[this.legIndex % pts.length]
    const nb = pts[(this.legIndex + 1) % pts.length]
    const x = na[0] + (nb[0] - na[0]) * t
    const y = na[1] + (nb[1] - na[1]) * t
    this.position = v3(x, y, this.terrain.height(x, y))
    this.heading = this.legHeading(this.legIndex)
  }

  /** Точка, у яку зараховується влучання (середина корпуса). */
  get aimPoint(): Vec3 {
    return v3(this.position.x, this.position.y, this.position.z + this.spec.height * 0.5)
  }

  /**
   * Дистанція, з якої ціль узагалі можна розгледіти.
   * Замаскована — тільки зблизька; великий корпус — здалеку.
   */
  get visibilityRange(): number {
    const base = 120 + this.spec.length * 45
    return this.spec.concealed ? base * 0.45 : base
  }
}
