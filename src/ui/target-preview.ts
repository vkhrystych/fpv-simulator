import * as THREE from 'three'
import { Target, VEHICLES, type TargetSpec } from '../game/targets'
import type { Terrain } from '../level/terrain'
import { buildVehicle } from '../render/vehicles'

/**
 * Показ цілі в брифінгу: та сама модель, що стоятиме в полі, повільно
 * обертається на місці. Це не спойлер — це те, що пілот мусить знати ДО
 * вильоту: у польоті немає ні маркерів, ні підказок, і відрізняти ціль
 * від цивільної машини доводиться по силуету (§6).
 *
 * Усі картки малює ОДИН WebGL-контекст і копіює результат у 2D-канвас:
 * браузер дає їх десяток на вкладку, а рівень із трьох вильотів забрав би
 * три ще до того, як гра взагалі запустилась.
 */

const W = 260
const H = 160
/** пологий погляд згори — так само, як ціль видно з дрона на заході */
const PITCH = 0.36

interface Item {
  model: THREE.Group
  /** півдіагональ у плані: найширше, чим машина може повернутись до камери */
  halfSpan: number
  halfHeight: number
  center: number
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
}

export class TargetPreviews {
  private renderer?: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(34, W / H, 0.1, 400)
  private items: Item[] = []
  private raf = 0
  private yaw = 0.8

  constructor() {
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true })
    } catch {
      return
    }
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.setSize(W, H, false)

    this.scene.background = new THREE.Color(0x171c15)
    this.camera.up.set(0, 0, 1)

    // Світло — те саме, що на денному рівні (`PALETTES.day` у render/world.ts).
    // Своє, «гарніше», зробило б із хакі світло-сіру пляму, і гравець запам'ятав
    // би не той колір, який шукатиме в полі.
    const sun = new THREE.DirectionalLight(0xffffff, 2.1)
    sun.position.set(0.35, 0.5, 0.78).normalize().multiplyScalar(100)
    // слабкий контровий підсвіт — лише щоб тіньовий борт не був чорною плямою
    const fill = new THREE.DirectionalLight(0xbcd0e0, 0.25)
    fill.position.set(-40, -30, 20)
    this.scene.add(sun, fill, new THREE.HemisphereLight(0x8ea6c0, 0x77784f, 0.7))

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(30, 24),
      new THREE.MeshLambertMaterial({ color: 0x3f4a35 }),
    )
    this.scene.add(ground)
  }

  /** Картка однієї цілі. Повертає канвас, у який її малюють. */
  add(spec: TargetSpec, terrain: Terrain): HTMLCanvasElement {
    const canvas = document.createElement('canvas')
    canvas.className = 'target-view'
    canvas.width = W
    canvas.height = H
    canvas.style.aspectRatio = `${W} / ${H}`
    if (!this.renderer) return canvas

    const model = buildVehicle(new Target(spec, terrain))
    const b = new THREE.Box3().setFromObject(model)
    const size = b.getSize(new THREE.Vector3())

    this.items.push({
      model,
      halfSpan: Math.hypot(size.x, size.y) * 0.5,
      halfHeight: size.z * 0.5,
      center: size.z * 0.45,
      canvas,
      ctx: canvas.getContext('2d')!,
    })
    return canvas
  }

  start(): void {
    if (!this.renderer || !this.items.length || this.raf) return
    let last = performance.now()
    const frame = (now: number) => {
      this.raf = requestAnimationFrame(frame)
      this.yaw += Math.min(0.05, (now - last) / 1000) * 0.35
      last = now
      this.render()
    }
    this.raf = requestAnimationFrame(frame)
  }

  private render(): void {
    const r = this.renderer!
    // кадр обмежує ГОРИЗОНТАЛЬНИЙ кут: картка широка й низька, і через
    // вертикальний FOV танк вилазив би за краї
    const vHalf = (this.camera.fov * Math.PI) / 360
    const hHalf = Math.atan(Math.tan(vHalf) * this.camera.aspect)

    for (const item of this.items) {
      this.scene.add(item.model)
      // дистанція окремо по ширині й по висоті кадру: одна габаритна сфера
      // на низьку широку машину дає півкартки порожнечі
      const halfV = item.halfHeight + item.halfSpan * Math.sin(PITCH)
      const dist = Math.max(item.halfSpan / Math.tan(hHalf), halfV / Math.tan(vHalf)) * 1.18
      const cp = Math.cos(PITCH)
      this.camera.position.set(
        Math.sin(this.yaw) * cp * dist,
        -Math.cos(this.yaw) * cp * dist,
        Math.sin(PITCH) * dist + item.center,
      )
      this.camera.lookAt(0, 0, item.center)
      r.render(this.scene, this.camera)
      item.ctx.drawImage(r.domElement, 0, 0, item.canvas.width, item.canvas.height)
      this.scene.remove(item.model)
    }
  }

  dispose(): void {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
    for (const item of this.items) {
      item.model.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (mesh.isMesh) mesh.geometry.dispose()
      })
    }
    this.items = []
    this.renderer?.dispose()
    this.renderer = undefined
  }
}

/** Один рядок під карткою: розмір, радіус ураження, чим ускладнене. */
export function targetSummary(spec: TargetSpec): string {
  const p = VEHICLES[spec.vehicle]
  const length = spec.length ?? p.length
  const height = spec.height ?? p.height
  const bits = [`${length.toFixed(1)} × ${p.width.toFixed(1)} × ${height.toFixed(1)} m`]
  bits.push(`hit radius ${(spec.hitRadius ?? p.hitRadius).toFixed(1)} m`)
  if (spec.route && spec.route.points.length > 1) bits.push(`moving ${Math.round(spec.route.speed * 3.6)} km/h`)
  else bits.push('static')
  if (spec.concealed) bits.push('under netting')
  return bits.join(' · ')
}
