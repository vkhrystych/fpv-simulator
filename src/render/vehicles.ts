import * as THREE from 'three'
import type { Target, TargetKind, VehicleClass } from '../game/targets'
import { buildBakedMesh } from './baked'
import { box, flatten, wedge } from './shapes'
import { BAKED_VEHICLES, type BakedModel } from './vehicle-data'

/**
 * Моделі техніки.
 *
 * Шість класів (мотоцикл, пікап, фургон, вантажівка, БМП, танк) — запечені
 * низькополі GLB з військового набору (`assets/mil/`, конвертер —
 * `scripts/bake-vehicles.mjs`). Модель приходить одним мешем із вершинними
 * кольорами: хоч в оригіналі 11 матеріалів, у кадрі це один draw call.
 *
 * Легковик і укриття лишаються процедурними: у наборі немає ні цивільного
 * седана, ні насипу.
 *
 * Розрізнення «свій/чужий» — кольором: у цивільних машин оливкові частини
 * корпусу перетягнуті в світлий бежевий, у макетів — у мертвий сіро-зелений.
 * Силует лишається силуетом: габарити береться з каталогу `VEHICLES`,
 * а пропорції боковини — з оригінальної моделі, щоб колеса не ставали овалами.
 */

const TARGET_PAINT = 0x4b5240
const CIVILIAN_PAINT = 0xb9b3a4
const DECOY_PAINT = 0x555b48
const RUBBER = 0x1c1c1c
const GLASS = 0x2e3a3c
const WOOD = 0x8a7f68
const DARK = 0x2a2a24
const EARTH = 0x6a6350

/** Нейтральне навісне однакове для всіх — воно не несе ознаки «свій/чужий». */
const SHARED = {
  rubber: new THREE.MeshLambertMaterial({ color: RUBBER, flatShading: true }),
  glass: new THREE.MeshLambertMaterial({ color: GLASS, flatShading: true }),
  wood: new THREE.MeshLambertMaterial({ color: WOOD, flatShading: true }),
  dark: new THREE.MeshLambertMaterial({ color: DARK, flatShading: true }),
  earth: new THREE.MeshLambertMaterial({ color: EARTH, flatShading: true }),
}

interface Dims {
  length: number
  width: number
  height: number
}

interface Kit {
  body: THREE.Material
  rubber: THREE.Material
  glass: THREE.Material
  wood: THREE.Material
  dark: THREE.Material
  earth: THREE.Material
}

function paintFor(kind: TargetKind): number {
  switch (kind) {
    case 'target':
      return TARGET_PAINT
    case 'civilian':
      return CIVILIAN_PAINT
    case 'decoy':
      return DECOY_PAINT
  }
}

function kitFor(kind: TargetKind): Kit {
  return {
    body: new THREE.MeshLambertMaterial({ color: paintFor(kind), flatShading: true }),
    ...SHARED,
  }
}

// ---------------------------------------------------------------------------
// Запечені GLB-моделі
// ---------------------------------------------------------------------------

/**
 * Оливкові кольори корпусу — те, що перефарбовується за належністю.
 * Гуми, скла, вантажу і хрестів санітарки це не торкається: зелений канал
 * мусить домінувати і мати помітну насиченість.
 */
function isBodyPaint(r: number, g: number, b: number): boolean {
  return g > r && g > b && g - Math.min(r, g, b) > 12
}

function tintedPalette(model: BakedModel, kind: TargetKind): THREE.Color[] {
  return model.palette.map((hex) => {
    let r = (hex >> 16) & 255
    let g = (hex >> 8) & 255
    let b = hex & 255
    if (kind !== 'target' && isBodyPaint(r, g, b)) {
      const to = kind === 'civilian' ? CIVILIAN_PAINT : DECOY_PAINT
      const t = kind === 'civilian' ? 0.72 : 0.5
      r += (((to >> 16) & 255) - r) * t
      g += (((to >> 8) & 255) - g) * t
      b += ((to & 255) - b) * t
    }
    // через hex, а не setRGB: так спрацьовує та сама конвертація sRGB → linear,
    // що й у матеріалів процедурних моделей
    return new THREE.Color((Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b))
  })
}

/**
 * Масштаб запеченої моделі. Ширина — точно з каталогу. Довжину й висоту
 * зв'язує спільний множник (колесо в боковині мусить лишитись круглим),
 * тому обидві підтягуються до каталогу компромісом і тримаються в ±30% —
 * рівно та межа, в якій силует ще чесно відповідає класу.
 */
function bakedDims(model: BakedModel, d: Dims): Dims {
  const ideal = Math.sqrt((d.length * d.height) / model.heightRatio)
  const lo = Math.max(0.7 * d.length, (0.7 * d.height) / model.heightRatio)
  const hi = Math.min(1.3 * d.length, (1.3 * d.height) / model.heightRatio)
  const k = Math.min(Math.max(ideal, lo), hi)
  return { length: k, width: d.width, height: k * model.heightRatio }
}

function buildBaked(g: THREE.Group, cls: VehicleClass, kind: TargetKind, v: Dims): void {
  const model = BAKED_VEHICLES[cls]
  g.add(buildBakedMesh(model, v, tintedPalette(model, kind)))
}

// ---------------------------------------------------------------------------
// Процедурні моделі: легковик, укриття
// ---------------------------------------------------------------------------

/** Пара коліс на кожній осі. Геометрія одна на машину — далі все одно склеюємо. */
function axles(
  g: THREE.Group,
  d: Dims,
  count: number,
  r: number,
  width: number,
  m: THREE.Material,
  front = 0.36,
  span = 0.72,
): void {
  const geo = new THREE.CylinderGeometry(r, r, width, 8)
  geo.rotateZ(Math.PI / 2)
  for (let i = 0; i < count; i++) {
    const y = d.length * front - (i / Math.max(1, count - 1)) * d.length * span
    for (const side of [-1, 1]) {
      const mesh = new THREE.Mesh(geo, m)
      mesh.position.set((side * d.width) / 2, y, r)
      g.add(mesh)
    }
  }
}

/** Легковик: звужений корпус і вужча «капсула» салону — читається згори. */
function buildCar(g: THREE.Group, d: Dims, k: Kit): void {
  const { width: w, length: l, height: h } = d
  wedge(g, w * 0.9, w, l * 0.95, h * 0.45, k.body, 0, 0, h * 0.2, 0.95)
  wedge(g, w * 0.6, w * 0.84, l * 0.44, h * 0.4, k.glass, 0, -l * 0.04, h * 0.62, 0.7)
  axles(g, d, 2, Math.min(h * 0.2, 0.35), Math.min(0.3, w * 0.22), k.rubber)
}

/** Укриття: насип зі скосами, вхід видно лише з одного боку (§5). */
function buildEmplacement(g: THREE.Group, d: Dims, k: Kit): void {
  const { width: w, length: l, height: h } = d
  wedge(g, w * 0.62, w, l, h * 0.75, k.earth, 0, 0, 0, 0.75)
  box(g, w * 0.44, l * 0.3, h * 0.5, k.dark, 0, l * 0.36, h * 0.25)
  box(g, w * 0.5, 0.25, h * 0.55, k.wood, 0, l * 0.42, h * 0.28)
}

const BUILDERS: Partial<Record<VehicleClass, (g: THREE.Group, d: Dims, k: Kit) => void>> = {
  car: buildCar,
  emplacement: buildEmplacement,
}

export function buildVehicle(target: Target): THREE.Group {
  const g = new THREE.Group()
  const k = kitFor(target.spec.kind)
  // довжину й висоту рівень може підправити, ширина — з каталогу
  const d: Dims = { length: target.length, width: target.profile.width, height: target.height }

  const baked = BAKED_VEHICLES[target.spec.vehicle]
  // фактичні габарити моделі: у запечених вони трохи відходять від каталогу,
  // і сітка мусить міряти по них, а не по паперових цифрах
  const v: Dims = baked ? bakedDims(baked, d) : d
  if (baked) buildBaked(g, target.spec.vehicle, target.spec.kind, v)
  else BUILDERS[target.spec.vehicle]!(g, d, k)

  // маскувальна сітка: намет зі скосами розмиває силует, поки не підлетиш
  if (target.spec.concealed) {
    const net = new THREE.MeshLambertMaterial({ color: 0x6a6f52, transparent: true, opacity: 0.82, flatShading: true })
    wedge(g, v.width * 0.9, v.width * 1.6, v.length * 1.15, v.height * 1.1, net, 0, 0, 0, 0.86)
  }

  flatten(g)
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
