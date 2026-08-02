import * as THREE from 'three'
import type { Target } from '../game/targets'

/**
 * Силуети машин. Розрізняти їх — це і є геймплей, тому пропорції та колір
 * зроблені навмисно схожими: ворожа й цивільна вантажівки відрізняються
 * довжиною кузова, кольором тенту та наявністю причепа, і більше нічим.
 */

interface VehicleStyle {
  cab: number
  body: number
  trailer: boolean
  color: number
  cabColor: number
}

function styleFor(t: Target): VehicleStyle {
  const len = t.spec.length
  switch (t.spec.kind) {
    case 'target':
      return { cab: len * 0.28, body: len * 0.72, trailer: false, color: 0x4b5240, cabColor: 0x434a3a }
    case 'civilian':
      return len < 5
        ? { cab: len * 0.55, body: len * 0.45, trailer: false, color: 0x9aa2a6, cabColor: 0x9aa2a6 }
        : { cab: len * 0.3, body: len * 0.7, trailer: true, color: 0xb9b3a4, cabColor: 0x8d99a6 }
    case 'decoy':
      // макет: ті самі габарити, але спрощена «коробка» без кабіни
      return { cab: len * 0.12, body: len * 0.88, trailer: false, color: 0x555b48, cabColor: 0x555b48 }
  }
}

export function buildVehicle(target: Target): THREE.Group {
  const g = new THREE.Group()
  const s = styleFor(target)
  const h = target.spec.height
  const width = Math.min(2.6, h * 0.85)

  const bodyMat = new THREE.MeshLambertMaterial({ color: s.color })
  const cabMat = new THREE.MeshLambertMaterial({ color: s.cabColor })
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1e1e1e })

  const body = new THREE.Mesh(new THREE.BoxGeometry(width, s.body, h * 0.7), bodyMat)
  body.position.set(0, -s.cab / 2, h * 0.55)
  g.add(body)

  const cab = new THREE.Mesh(new THREE.BoxGeometry(width * 0.95, s.cab, h * 0.55), cabMat)
  cab.position.set(0, s.body / 2, h * 0.4)
  g.add(cab)

  if (s.trailer) {
    const tr = new THREE.Mesh(new THREE.BoxGeometry(width * 0.95, s.body * 0.8, h * 0.55), bodyMat)
    tr.position.set(0, -s.body - s.cab * 0.6, h * 0.45)
    g.add(tr)
  }

  const wheel = new THREE.CylinderGeometry(h * 0.19, h * 0.19, 0.35, 8)
  wheel.rotateZ(Math.PI / 2)
  const axles = s.trailer ? 4 : 3
  for (let i = 0; i < axles; i++) {
    const y = s.body / 2 - (i / Math.max(1, axles - 1)) * (s.body + (s.trailer ? s.body * 0.8 : 0))
    for (const side of [-1, 1]) {
      const w = new THREE.Mesh(wheel, wheelMat)
      w.position.set((side * width) / 2, y, h * 0.19)
      g.add(w)
    }
  }

  // маскувальна сітка: розмиває силует, поки не підлетиш близько
  if (target.spec.concealed) {
    const net = new THREE.Mesh(
      new THREE.BoxGeometry(width * 1.5, target.spec.length * 1.1, h * 1.05),
      new THREE.MeshLambertMaterial({ color: 0x6a6f52, transparent: true, opacity: 0.82 }),
    )
    net.position.set(0, 0, h * 0.55)
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
