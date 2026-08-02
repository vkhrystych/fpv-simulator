import type { Drone } from '../flight/drone'
import type { Mission } from '../game/mission'
import { quatToEuler } from '../flight/math'
import { radToDeg } from '../flight/rates'

/**
 * OSD: напруга, висота, швидкість, час, компас-стрічка. І все.
 * Ніякої мінімапи, стрілок на ціль, підсвітки ворогів чи хіт-маркерів —
 * єдина «навігація» гравця це компас і пам'ять про брифінг.
 */
const CARDINALS: Array<[number, string]> = [
  [0, 'Пн'],
  [45, 'ПнС'],
  [90, 'С'],
  [135, 'ПдС'],
  [180, 'Пд'],
  [225, 'ПдЗ'],
  [270, 'З'],
  [315, 'ПнЗ'],
]

export class Osd {
  readonly root: HTMLDivElement
  private compass: HTMLDivElement
  private tl: HTMLDivElement
  private tr: HTMLDivElement
  private bl: HTMLDivElement
  private br: HTMLDivElement
  private center: HTMLDivElement

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div')
    this.root.className = 'osd'
    this.compass = this.cell('osd-compass')
    this.tl = this.cell('osd-tl')
    this.tr = this.cell('osd-tr')
    this.bl = this.cell('osd-bl')
    this.br = this.cell('osd-br')
    this.center = this.cell('osd-center')
    parent.appendChild(this.root)
  }

  private cell(cls: string): HTMLDivElement {
    const d = document.createElement('div')
    d.className = cls
    this.root.appendChild(d)
    return d
  }

  /** Стрічка курсу: рухається під нерухомою міткою по центру. */
  private compassRibbon(headingDeg: number): string {
    const span = 90
    const width = 41
    const chars: string[] = []
    for (let i = 0; i < width; i++) {
      const offset = ((i / (width - 1)) - 0.5) * span
      const bearing = (((headingDeg + offset) % 360) + 360) % 360
      const near = CARDINALS.find(([deg]) => Math.abs(((bearing - deg + 540) % 360) - 180) > 178)
      chars.push(near ? near[1][0] : Math.abs(bearing % 15) < 1.2 ? '|' : '·')
    }
    const label = CARDINALS.reduce((best, c) => {
      const d = Math.abs(((headingDeg - c[0] + 540) % 360) - 180)
      const bd = Math.abs(((headingDeg - best[0] + 540) % 360) - 180)
      return d < bd ? c : best
    })[1]
    return `${chars.join('')}\n${String(Math.round(headingDeg)).padStart(3, '0')}° ${label}`
  }

  update(drone: Drone, mission: Mission): void {
    const e = quatToEuler(drone.state.orientation)
    const heading = (((radToDeg(e.yaw) % 360) + 360) % 360)
    const t = drone.telemetry

    this.compass.textContent = this.compassRibbon(heading)

    const mins = Math.floor(mission.stats.timeS / 60)
    const secs = Math.floor(mission.stats.timeS % 60)
    this.tl.textContent =
      `V ${drone.battery.voltage.toFixed(1)}  ${Math.round(drone.battery.stateOfCharge * 100)}%\n` +
      `A ${t.current.toFixed(0)}  ${Math.round(drone.battery.mahUsed)}mAh`
    this.tr.textContent =
      `${mins}:${String(secs).padStart(2, '0')} / ${Math.floor(mission.level.timeLimitS / 60)}:` +
      `${String(mission.level.timeLimitS % 60).padStart(2, '0')}\n` +
      `SIG ${'▮'.repeat(Math.max(0, Math.round(mission.signal * 5))).padEnd(5, '▯')}`
    this.bl.textContent =
      `ALT ${Math.round(mission.altitude)}\n` +
      `SPD ${Math.round(t.speed * 3.6)}`
    this.br.textContent =
      `${Math.round(drone.distanceFromLaunch)} м${mission.armed ? '  A' : '  ·'}\n` +
      `${drone.state.landed ? 'GND' : 'AIR'}${drone.telemetry.saturation > 0.2 ? '  SAT' : ''}`

    this.center.textContent = mission.idFlash > 0 && Math.floor(mission.idFlash * 8) % 2 === 0 ? 'ID' : ''
    this.root.classList.toggle('osd-lost', mission.signal < 0.12)
  }
}
