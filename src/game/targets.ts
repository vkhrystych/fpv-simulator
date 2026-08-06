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

/**
 * Каталог техніки. Розмір — це складність: мотоцикл із 80 м майже не видно
 * і в нього важко влучити, танк видно здалеку, але він повільний і живучий.
 * Рівні задають лише клас — габарити, радіус ураження й крейсерська швидкість
 * беруться звідси, щоб 15 рівнів не перетворились на копіпасту чисел.
 */
export type VehicleClass =
  | 'motorcycle'
  | 'car'
  | 'pickup'
  | 'van'
  | 'truck'
  | 'apc'
  | 'tank'
  | 'emplacement'

export interface VehicleProfile {
  label: string
  /** довжина корпуса, м — головна ознака силуету */
  length: number
  width: number
  height: number
  /** радіус ураження, м */
  hitRadius: number
  /** типова крейсерська швидкість, м/с */
  cruiseSpeed: number
  /** гусенична — інший силует у кадрі */
  tracked: boolean
  /** башта */
  turret: boolean
}

export const VEHICLES: Record<VehicleClass, VehicleProfile> = {
  motorcycle: { label: 'motorcycle', length: 2.1, width: 0.8, height: 1.3, hitRadius: 1.8, cruiseSpeed: 17, tracked: false, turret: false },
  car: { label: 'car', length: 4.4, width: 1.8, height: 1.6, hitRadius: 3, cruiseSpeed: 16, tracked: false, turret: false },
  pickup: { label: 'pickup', length: 5.3, width: 2, height: 1.9, hitRadius: 3.2, cruiseSpeed: 15, tracked: false, turret: false },
  van: { label: 'van', length: 5.6, width: 2.1, height: 2.4, hitRadius: 3.4, cruiseSpeed: 14, tracked: false, turret: false },
  truck: { label: 'truck', length: 8, width: 2.5, height: 3.2, hitRadius: 4.5, cruiseSpeed: 9, tracked: false, turret: false },
  apc: { label: 'APC', length: 6.7, width: 3, height: 2.5, hitRadius: 4, cruiseSpeed: 8, tracked: true, turret: true },
  tank: { label: 'tank', length: 9.5, width: 3.6, height: 2.6, hitRadius: 5, cruiseSpeed: 6, tracked: true, turret: true },
  emplacement: { label: 'emplacement', length: 7, width: 4, height: 2.2, hitRadius: 4.2, cruiseSpeed: 0, tracked: false, turret: false },
}

export interface TargetSpec {
  id: string
  kind: TargetKind
  vehicle: VehicleClass
  /** підпис у дебрифі; за замовчуванням — назва класу */
  label?: string
  /** статична позиція (x, y); ігнорується, якщо є route */
  position?: [number, number]
  headingDeg?: number
  route?: RouteSpec
  /** чи стоїть під маскувальною сіткою: видно лише зблизька */
  concealed?: boolean
  /** точкові правки габаритів, якщо рівню треба щось нетипове */
  hitRadius?: number
  height?: number
  length?: number
}

/**
 * Рухома ціль. Прості waypoint-маршрути зі сталою швидкістю та паузами —
 * жодного AI: поведінка мусить бути передбачуваною, щоб гравець міг її прочитати.
 */
export class Target {
  readonly profile: VehicleProfile
  /** габарити з урахуванням правок рівня */
  readonly length: number
  readonly height: number
  readonly hitRadius: number
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
    this.profile = VEHICLES[spec.vehicle]
    this.length = spec.length ?? this.profile.length
    this.height = spec.height ?? this.profile.height
    this.hitRadius = spec.hitRadius ?? this.profile.hitRadius
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

  get label(): string {
    return this.spec.label ?? this.profile.label
  }

  /** Точка, у яку зараховується влучання (середина корпуса). */
  get aimPoint(): Vec3 {
    return v3(this.position.x, this.position.y, this.position.z + this.height * 0.5)
  }

  /**
   * Дистанція, з якої ціль узагалі можна розгледіти.
   * Прив'язана до довжини корпуса: мотоцикл треба шукати впритул,
   * танк видно вчетверо далі. Маскувальна сітка ріже це більш ніж удвічі.
   */
  get visibilityRange(): number {
    const base = 40 + this.length * 42
    return this.spec.concealed ? base * 0.45 : base
  }
}
