import * as THREE from 'three'
import type { Target } from '../game/targets'

/**
 * Силуети техніки. Розрізняти їх — це і є геймплей, тому форми зроблені
 * навмисно близькими: гусенична машина від колісної відрізняється низьким
 * корпусом, гусеницями та баштою, а ворожа вантажівка від цивільної —
 * лише довжиною кузова, кольором тенту та наявністю причепа.
 * З 200 м усе це — темні плями; різниця з'являється метрів із сорока.
 */

const TARGET_PAINT = 0x4b5240
const TARGET_CAB = 0x434a3a
const CIVILIAN_PAINT = 0xb9b3a4
const CIVILIAN_CAB = 0x8d99a6
const DECOY_PAINT = 0x555b48
const RUBBER = 0x1c1c1c

function paintFor(t: Target): { body: number; cab: number } {
  switch (t.spec.kind) {
    case 'target':
      return { body: TARGET_PAINT, cab: TARGET_CAB }
    case 'civilian':
      return { body: CIVILIAN_PAINT, cab: CIVILIAN_CAB }
    case 'decoy':
      return { body: DECOY_PAINT, cab: DECOY_PAINT }
  }
}

/** Гусенична машина: низький корпус, гусениці по бортах, башта. */
function buildTracked(g: THREE.Group, t: Target, bodyMat: THREE.Material): void {
  const { width } = t.profile
  const len = t.length
  const h = t.height

  const hull = new THREE.Mesh(new THREE.BoxGeometry(width * 0.82, len * 0.95, h * 0.45), bodyMat)
  hull.position.set(0, 0, h * 0.42)
  g.add(hull)

  // скошена лобова деталь — головна ознака бронетехніки згори
  const glacis = new THREE.Mesh(new THREE.BoxGeometry(width * 0.8, len * 0.3, h * 0.22), bodyMat)
  glacis.position.set(0, len * 0.34, h * 0.28)
  glacis.rotation.x = -0.5
  g.add(glacis)

  const trackMat = new THREE.MeshLambertMaterial({ color: RUBBER })
  for (const side of [-1, 1]) {
    const track = new THREE.Mesh(new THREE.BoxGeometry(width * 0.2, len * 0.98, h * 0.3), trackMat)
    track.position.set((side * width) / 2.3, 0, h * 0.16)
    g.add(track)
  }

  if (t.profile.turret) {
    const turret = new THREE.Mesh(new THREE.CylinderGeometry(width * 0.3, width * 0.34, h * 0.32, 8), bodyMat)
    turret.rotation.x = Math.PI / 2
    turret.position.set(0, -len * 0.06, h * 0.78)
    g.add(turret)

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, len * 0.55, 6), bodyMat)
    barrel.rotation.x = Math.PI / 2
    barrel.position.set(0, len * 0.24, h * 0.82)
    g.add(barrel)
  }
}

/** Колісна машина: кабіна + кузов, за потреби причіп. */
function buildWheeled(g: THREE.Group, t: Target, bodyMat: THREE.Material, cabMat: THREE.Material): void {
  const { width } = t.profile
  const len = t.length
  const h = t.height
  const twoBox = len > 4.8

  if (twoBox) {
    const cabLen = len * 0.3
    const bodyLen = len * 0.7
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, bodyLen, h * 0.7), bodyMat)
    body.position.set(0, -cabLen / 2, h * 0.55)
    g.add(body)

    const cab = new THREE.Mesh(new THREE.BoxGeometry(width * 0.95, cabLen, h * 0.55), cabMat)
    cab.position.set(0, bodyLen / 2, h * 0.4)
    g.add(cab)

    // причіп — ознака цивільної машини
    if (t.spec.kind === 'civilian' && len > 5.4) {
      const trailer = new THREE.Mesh(new THREE.BoxGeometry(width * 0.95, bodyLen * 0.8, h * 0.55), bodyMat)
      trailer.position.set(0, -bodyLen - cabLen * 0.6, h * 0.45)
      g.add(trailer)
    }
  } else {
    // мотоцикл, квадроцикл, легковик — один суцільний корпус
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, len * 0.85, h * 0.5), bodyMat)
    body.position.set(0, 0, h * 0.55)
    g.add(body)
    const rider = new THREE.Mesh(new THREE.BoxGeometry(width * 0.55, len * 0.3, h * 0.4), cabMat)
    rider.position.set(0, -len * 0.05, h * 0.9)
    g.add(rider)
  }

  const wheelR = Math.min(h * 0.19, 0.55)
  const wheel = new THREE.CylinderGeometry(wheelR, wheelR, Math.min(0.35, width * 0.28), 8)
  wheel.rotateZ(Math.PI / 2)
  const wheelMat = new THREE.MeshLambertMaterial({ color: RUBBER })
  const axles = len < 3 ? 2 : len > 6 ? 3 : 2
  for (let i = 0; i < axles; i++) {
    const y = len * 0.36 - (i / Math.max(1, axles - 1)) * len * 0.72
    for (const side of [-1, 1]) {
      const w = new THREE.Mesh(wheel, wheelMat)
      w.position.set((side * width) / 2, y, wheelR)
      g.add(w)
    }
  }
}

export function buildVehicle(target: Target): THREE.Group {
  const g = new THREE.Group()
  const paint = paintFor(target)
  const bodyMat = new THREE.MeshLambertMaterial({ color: paint.body })
  const cabMat = new THREE.MeshLambertMaterial({ color: paint.cab })

  if (target.profile.tracked) buildTracked(g, target, bodyMat)
  else buildWheeled(g, target, bodyMat, cabMat)

  // маскувальна сітка: розмиває силует, поки не підлетиш близько
  if (target.spec.concealed) {
    const net = new THREE.Mesh(
      new THREE.BoxGeometry(target.profile.width * 1.5, target.length * 1.15, target.height * 1.05),
      new THREE.MeshLambertMaterial({ color: 0x6a6f52, transparent: true, opacity: 0.82 }),
    )
    net.position.set(0, 0, target.height * 0.55)
    g.add(net)
  }

  g.name = target.spec.id
  return g
}

/** Тримає меші в синхроні з логічними цілями. Логіка нічого не знає про three.js. */
export class VehicleRenderer {
  private meshes = new Map<string, THREE.Group>()

  constructor(
    private scene: THREE.Scene,
    targets: Target[],
  ) {
    for (const t of targets) {
      const g = buildVehicle(t)
      this.meshes.set(t.spec.id, g)
      scene.add(g)
    }
  }

  update(targets: Target[]): void {
    for (const t of targets) {
      const g = this.meshes.get(t.spec.id)
      if (!g) continue
      if (t.destroyed) {
        g.visible = false
        continue
      }
      g.position.set(t.position.x, t.position.y, t.position.z)
      g.rotation.set(0, 0, -t.heading)
    }
  }

  dispose(): void {
    for (const g of this.meshes.values()) this.scene.remove(g)
    this.meshes.clear()
  }
}
