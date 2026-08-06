import type { Quat, Vec3 } from '../flight/math'
import type { Target } from './targets'

/**
 * Запис останніх секунд вильоту для повтору з борта спостерігача.
 *
 * Кільцевий буфер знімків: позиція/орієнтація дрона + пози цілей.
 * Пише ~30 Гц незалежно від кадрової частоти і тримає лише хвіст —
 * повтору потрібні секунди перед ударом, а не весь політ.
 * Логіка без three.js: тестується без рендера.
 */

export interface ReplayTargetPose {
  id: string
  x: number
  y: number
  z: number
  heading: number
  destroyed: boolean
}

export interface ReplayFrame {
  /** секунди; у clip() перебазовано на 0 від першого кадру */
  t: number
  drone: { p: Vec3; q: Quat }
  targets: ReplayTargetPose[]
}

export class ReplayRecorder {
  private frames: ReplayFrame[] = []
  private lastT = -Infinity

  constructor(
    private keepS = 8,
    private hz = 30,
  ) {}

  capture(t: number, position: Vec3, orientation: Quat, targets: Target[]): void {
    if (t - this.lastT < 1 / this.hz) return
    this.lastT = t
    this.frames.push({
      t,
      drone: {
        p: { x: position.x, y: position.y, z: position.z },
        q: { x: orientation.x, y: orientation.y, z: orientation.z, w: orientation.w },
      },
      targets: targets.map((tg) => ({
        id: tg.spec.id,
        x: tg.position.x,
        y: tg.position.y,
        z: tg.position.z,
        heading: tg.heading,
        destroyed: tg.destroyed,
      })),
    })
    while (this.frames.length && this.frames[0].t < t - this.keepS) this.frames.shift()
  }

  /** Останні lastS секунд запису, час перебазовано так, що перший кадр — t=0. */
  clip(lastS: number): ReplayFrame[] {
    if (this.frames.length < 2) return []
    const end = this.frames[this.frames.length - 1].t
    const tail = this.frames.filter((f) => f.t >= end - lastS)
    const t0 = tail[0].t
    return tail.map((f) => ({ ...f, t: f.t - t0 }))
  }
}
