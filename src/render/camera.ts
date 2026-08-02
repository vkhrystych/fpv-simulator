import * as THREE from 'three'
import type { Drone } from '../flight/drone'
import type { DroneState } from '../flight/types'
import { degToRad } from '../flight/rates'

interface Frame {
  t: number
  position: THREE.Vector3
  quaternion: THREE.Quaternion
}

/**
 * FPV-камера з реальною затримкою відеотракту.
 * Рендеримо не «зараз», а те, що дрон бачив videoLatencyMs тому —
 * саме ця затримка робить швидкий політ страшним.
 */
export class FpvCamera {
  readonly camera: THREE.PerspectiveCamera
  private history: Frame[] = []
  private tmpQ = new THREE.Quaternion()
  private tiltQ: THREE.Quaternion
  /** осі гри: Z вгору. Камера three.js дивиться в −Z, тому потрібен доворот. */
  private axisFix = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0))
  private clock = 0

  constructor(private drone: Drone, aspect: number) {
    const spec = drone.spec
    this.camera = new THREE.PerspectiveCamera(this.verticalFov(spec.camera.fov, aspect), aspect, 0.12, 6000)
    this.camera.up.set(0, 0, 1)
    this.tiltQ = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      degToRad(spec.camera.tiltDeg),
    )
  }

  /** У специфікації дрона FOV діагональний/горизонтальний — три.js хоче вертикальний. */
  private verticalFov(horizontalDeg: number, aspect: number): number {
    const h = degToRad(horizontalDeg)
    return (2 * Math.atan(Math.tan(h / 2) / aspect) * 180) / Math.PI
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect
    this.camera.fov = this.verticalFov(this.drone.spec.camera.fov, aspect)
    this.camera.updateProjectionMatrix()
  }

  reset(): void {
    this.history.length = 0
    this.clock = 0
  }

  update(dt: number, state: DroneState = this.drone.state): void {
    this.clock += dt
    const q = new THREE.Quaternion(
      state.orientation.x,
      state.orientation.y,
      state.orientation.z,
      state.orientation.w,
    )
    this.history.push({
      t: this.clock,
      position: new THREE.Vector3(state.position.x, state.position.y, state.position.z),
      quaternion: q,
    })

    const delay = this.drone.spec.videoLatencyMs / 1000
    const showAt = this.clock - delay
    while (this.history.length > 2 && this.history[1].t <= showAt) this.history.shift()

    const a = this.history[0]
    const b = this.history[1] ?? a
    const span = b.t - a.t
    const k = span > 1e-6 ? Math.min(1, Math.max(0, (showAt - a.t) / span)) : 0

    this.camera.position.lerpVectors(a.position, b.position, k)
    this.tmpQ.slerpQuaternions(a.quaternion, b.quaternion, k)
    // орієнтація тіла → нахил об'єктива → перевід у систему камери three.js
    this.tmpQ.multiply(this.tiltQ).multiply(this.axisFix)
    this.camera.quaternion.copy(this.tmpQ)
  }
}
