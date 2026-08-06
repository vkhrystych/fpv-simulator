import * as THREE from 'three'
import { describe, it, expect } from 'vitest'
import { Target, VEHICLES, type VehicleClass } from '../src/game/targets'
import { Terrain, DEFAULT_TERRAIN } from '../src/level/terrain'
import { POLE_ARM } from '../src/level/props'
import { buildVehicle } from '../src/render/vehicles'
import {
  BUILDING_VARIANTS,
  BUSH_VARIANTS,
  BUSH_H,
  BUSH_R,
  HAY_H,
  HAY_R,
  HAY_VARIANTS,
  POLE_H,
  POLE_VARIANTS,
  TREE_H,
  TREE_VARIANTS,
  type PropKit,
} from '../src/render/props-models'

/**
 * Геометрія моделей. Скріншот такого не ловить: об'єкт, що просів під землю
 * або виліз за межі свого колайдера, на картинці виглядає нормально, а в грі
 * дає або удар об порожнечу, або наскрізний привид.
 */

const terrain = new Terrain(DEFAULT_TERRAIN)

const kit = Object.fromEntries(
  ['trunk', 'leaf', 'bushLeaf', 'straw', 'strawCap', 'band', 'wood', 'steel', 'insulator', 'wall', 'roof', 'trim'].map(
    (name) => [name, new THREE.MeshLambertMaterial({ name })],
  ),
) as unknown as PropKit

const boundsOf = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o)
const radiusOf = (b: THREE.Box3) =>
  Math.max(Math.abs(b.min.x), Math.abs(b.max.x), Math.abs(b.min.y), Math.abs(b.max.y))

describe('моделі техніки', () => {
  const classes = Object.keys(VEHICLES) as VehicleClass[]

  it.each(classes)('%s стоїть на землі й тримає габарити каталогу', (cls) => {
    const t = new Target({ id: 't', kind: 'target', vehicle: cls, position: [0, 0] }, terrain)
    const b = boundsOf(buildVehicle(t))
    const size = b.getSize(new THREE.Vector3())
    const p = VEHICLES[cls]

    expect(b.min.z).toBeGreaterThan(-0.05)
    // ±35%: навісне обладнання виступає за корпус, але силует лишається силуетом
    expect(size.y).toBeGreaterThan(p.length * 0.65)
    expect(size.y).toBeLessThan(p.length * 1.35)
    expect(size.x).toBeGreaterThan(p.width * 0.65)
    expect(size.x).toBeLessThan(p.width * 1.35)
    expect(size.z).toBeGreaterThan(p.height * 0.65)
    expect(size.z).toBeLessThan(p.height * 1.35)
  })

  it('склеєна модель — це одиниці draw calls, а не десятки', () => {
    for (const cls of classes) {
      const t = new Target({ id: 't', kind: 'target', vehicle: cls, position: [0, 0] }, terrain)
      expect(buildVehicle(t).children.length, cls).toBeLessThanOrEqual(6)
    }
  })

  it('маскувальна сітка накриває ціль, а не ховається під нею', () => {
    const bare = new Target({ id: 'a', kind: 'target', vehicle: 'tank', position: [0, 0] }, terrain)
    const under = new Target({ id: 'b', kind: 'target', vehicle: 'tank', position: [0, 0], concealed: true }, terrain)
    const hidden = boundsOf(buildVehicle(under))
    expect(hidden.max.z).toBeGreaterThan(boundsOf(buildVehicle(bare)).max.z)
    expect(hidden.min.z).toBeGreaterThan(-0.05)
  })
})

describe('моделі наповнення карти', () => {
  it('кущі вписані у свій слід — інакше удар об порожнечу або привид', () => {
    for (const [i, make] of BUSH_VARIANTS.entries()) {
      const b = boundsOf(make(kit))
      expect(b.min.z, `кущ v${i + 1}`).toBeGreaterThan(-0.05)
      expect(radiusOf(b), `кущ v${i + 1}`).toBeLessThanOrEqual(BUSH_R + 0.05)
      expect(b.max.z, `кущ v${i + 1}`).toBeLessThanOrEqual(BUSH_H + 0.05)
    }
  })

  it('стоги вписані у свій слід', () => {
    for (const [i, make] of HAY_VARIANTS.entries()) {
      const b = boundsOf(make(kit))
      expect(b.min.z, `стіг v${i + 1}`).toBeGreaterThan(-0.05)
      expect(radiusOf(b), `стіг v${i + 1}`).toBeLessThanOrEqual(HAY_R + 0.05)
      expect(b.max.z, `стіг v${i + 1}`).toBeLessThanOrEqual(HAY_H + 0.05)
    }
  })

  it('дерева ростуть із землі на повну висоту', () => {
    for (const [i, make] of TREE_VARIANTS.entries()) {
      const b = boundsOf(make(kit))
      expect(b.min.z, `дерево v${i + 1}`).toBeGreaterThan(-0.05)
      // крона навмисно ширша за колайдер стовбура — перевіряємо лише висоту
      expect(b.max.z, `дерево v${i + 1}`).toBeGreaterThan(TREE_H * 0.9)
      expect(b.max.z, `дерево v${i + 1}`).toBeLessThan(TREE_H * 1.05)
    }
  })

  it('траверса стовпа збігається з колайдером траверси', () => {
    const armZ0 = POLE_H * POLE_ARM.z0
    const armZ1 = POLE_H * POLE_ARM.z1
    for (const [i, make] of POLE_VARIANTS.entries()) {
      const model = make(kit)
      const b = boundsOf(model)
      expect(b.min.z, `стовп v${i + 1}`).toBeGreaterThan(-0.05)
      expect(b.max.z, `стовп v${i + 1}`).toBeLessThanOrEqual(POLE_H + 0.05)

      // усе, що виступає за щоглу, мусить лежати всередині плити траверси
      for (const child of model.children) {
        const geo = (child as THREE.Mesh).geometry
        const pos = geo.attributes.position as THREE.BufferAttribute
        for (let v = 0; v < pos.count; v++) {
          const x = pos.getX(v)
          if (Math.abs(x) <= 0.6) continue
          const z = pos.getZ(v)
          expect(Math.abs(x), `стовп v${i + 1}`).toBeLessThanOrEqual(POLE_ARM.halfSpan + 0.05)
          expect(z, `стовп v${i + 1}`).toBeGreaterThanOrEqual(armZ0 - 0.05)
          expect(z, `стовп v${i + 1}`).toBeLessThanOrEqual(armZ1 + 0.05)
        }
      }
    }
  })

  it('будівля не вилазить за прямокутник, по якому рахується зіткнення', () => {
    for (const [w, l, h] of [
      [9, 14, 5.5],
      [7, 10, 4],
      [15, 28, 8.5],
    ]) {
      for (const [i, make] of BUILDING_VARIANTS.entries()) {
        const b = boundsOf(make(kit, w, l, h))
        const tag = `ферма #${i + 1} ${w}×${l}×${h}`
        expect(b.min.z, tag).toBeGreaterThan(-0.05)
        expect(b.max.z, tag).toBeLessThanOrEqual(h + 0.05)
        expect(Math.max(Math.abs(b.min.x), Math.abs(b.max.x)), tag).toBeLessThanOrEqual(w / 2 + 0.05)
        expect(Math.max(Math.abs(b.min.y), Math.abs(b.max.y)), tag).toBeLessThanOrEqual(l / 2 + 0.05)
      }
    }
  })
})
