import * as THREE from 'three'
import type { Vec3 } from '../flight/math'
import type { ReplayFrame } from '../game/replay'
import { EXPLOSION_VARIANTS, type ExplosionInstance } from './explosion'
import type { VehicleRenderer } from './vehicles'

/**
 * Повтор ураження з борта дрона-спостерігача: статична камера високо збоку,
 * FPV-борт влітає в кадр і зникає у виблиску, далі — вибух «Dust & debris»
 * (обраний через /models → Effects: ударна хвиля, уламки, пил, стовп диму).
 *
 * Тон гри (§13): це не кіношний кілкам, а сухе розвід-відео — тому камера
 * не крутиться навколо цілі, вибух без вогняної кулі, а картинка йде через
 * той самий аналоговий тракт у монохромі.
 */

const PLAYBACK_S = 3.2
const EXPLOSION = EXPLOSION_VARIANTS.find((v) => v.id === 'dust')!

export class ReplayView {
  readonly camera: THREE.PerspectiveCamera
  private time = 0
  private readonly playbackS: number
  private drone: THREE.Group
  private explosion: ExplosionInstance
  private exploded = false

  constructor(
    private scene: THREE.Scene,
    private vehicles: VehicleRenderer,
    private frames: ReplayFrame[],
    private impact: Vec3,
    private hitTargetId: string | undefined,
    aspect: number,
  ) {
    this.playbackS = Math.min(PLAYBACK_S, frames[frames.length - 1].t)

    // Спостерігач висить збоку від лінії заходу, вище за ціль: видно і борт
    // у польоті, і техніку. Кут — від напрямку підльоту, щоб борт летів
    // «через кадр», а не в спину камері.
    const first = frames[0].drone.p
    const az = Math.atan2(impact.x - first.x, impact.y - first.y) + 1.9
    this.camera = new THREE.PerspectiveCamera(30, aspect, 0.5, 4000)
    this.camera.up.set(0, 0, 1)
    this.camera.position.set(
      impact.x + Math.sin(az) * 88,
      impact.y + Math.cos(az) * 88,
      impact.z + 56,
    )
    this.camera.lookAt(impact.x, impact.y, impact.z + 2)

    // FPV-борт: темний хрест із моторами — з 100 м це просто «пляшка», як у житті
    this.drone = buildDroneMarker()
    scene.add(this.drone)

    // Вибух стоїть на землі під точкою удару, а не в центрі корпусу:
    // z цілі в записі — це висота рельєфу під нею. Сід — з координат,
    // щоб кожне ураження виглядало своїм, але детерміновано.
    const hit = frames[frames.length - 1].targets.find((tp) => tp.id === hitTargetId)
    this.explosion = EXPLOSION.make((Math.abs(Math.round(impact.x * 31 + impact.y * 7)) % 9973) + 1)
    this.explosion.group.position.set(impact.x, impact.y, hit ? hit.z : impact.z - 1)
    scene.add(this.explosion.group)
  }

  /** Якість «лінка» спостерігача: добра, з легким миготінням і врубанням. */
  get signal(): number {
    if (this.time < 0.3) return 0.45
    return 0.86 + Math.sin(this.time * 9) * 0.03
  }

  /** true — повтор ще триває. */
  update(dt: number): boolean {
    this.time += dt
    const t = this.time

    // повільний дрейф камери: спостерігач висить, а не стоїть на штативі
    this.camera.position.x += dt * 0.9
    this.camera.position.z += dt * 0.25
    this.camera.lookAt(this.impact.x, this.impact.y, this.impact.z + 2)

    if (t < this.playbackS) {
      this.pose(t)
      return true
    }

    if (!this.exploded) {
      this.exploded = true
      this.drone.visible = false
      // уражена техніка ЛИШАЄТЬСЯ в кадрі й димить — зникнення корпусу
      // виглядало як фокус, а не як ураження
      if (this.hitTargetId) this.vehicles.setVisible(this.hitTargetId, true)
    }
    this.explosion.update(t - this.playbackS)
    return t < this.playbackS + EXPLOSION.duration
  }

  /** Інтерполяція записаних кадрів: борт + пози цілей. */
  private pose(t: number): void {
    const fs = this.frames
    let i = 1
    while (i < fs.length - 1 && fs[i].t < t) i++
    const a = fs[i - 1]
    const b = fs[i]
    const k = Math.min(1, Math.max(0, (t - a.t) / Math.max(b.t - a.t, 1e-6)))

    this.drone.position.set(
      a.drone.p.x + (b.drone.p.x - a.drone.p.x) * k,
      a.drone.p.y + (b.drone.p.y - a.drone.p.y) * k,
      a.drone.p.z + (b.drone.p.z - a.drone.p.z) * k,
    )
    const qa = new THREE.Quaternion(a.drone.q.x, a.drone.q.y, a.drone.q.z, a.drone.q.w)
    const qb = new THREE.Quaternion(b.drone.q.x, b.drone.q.y, b.drone.q.z, b.drone.q.w)
    this.drone.setRotationFromQuaternion(qa.slerp(qb, k))

    for (const tp of b.targets) {
      // уражену ціль показуємо до самого удару — вона зникне у виблиску
      const visible = !tp.destroyed || tp.id === this.hitTargetId
      this.vehicles.pose(tp.id, tp.x, tp.y, tp.z, tp.heading, visible)
    }
  }

  dispose(): void {
    this.explosion.dispose()
    this.scene.remove(this.drone)
    this.drone.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        m.geometry.dispose()
        ;(m.material as THREE.Material).dispose()
      }
    })
  }
}

/**
 * Темний X-квад: трохи більший за реальний і з світлішими роторами —
 * інакше на тлі темного поля борт у кадрі спостерігача просто зникає.
 */
function buildDroneMarker(): THREE.Group {
  const g = new THREE.Group()
  const dark = new THREE.MeshLambertMaterial({ color: 0x191b16, flatShading: true })
  const light = new THREE.MeshLambertMaterial({ color: 0x8b9088, flatShading: true })
  for (const a of [Math.PI / 4, -Math.PI / 4]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 0.07), dark)
    arm.rotation.z = a
    g.add(arm)
  }
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.18), dark)
  body.position.z = 0.07
  g.add(body)
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) {
      const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 8), light)
      rotor.rotation.x = Math.PI / 2
      rotor.position.set(sx * 0.46, sy * 0.46, 0.13)
      g.add(rotor)
    }
  return g
}
