import * as THREE from 'three'
import { POLE_ARM } from '../level/props'
import { buildBakedMesh } from './baked'
import { BAKED_BUILDINGS, BUILDING_TYPES } from './building-data'
import { BAKED_TREES, TREE_TYPES } from './tree-data'
import { box, cyl, fitInto, flatten } from './shapes'

/**
 * Моделі наповнення карти. Рослинність, стоги і стовпи — процедурні,
 * варіанти обрані руками через `models/` (models-config.json): дерево —
 * детальне й блочне, кущ і стіг — усі три, стовп — усі три. Будівлі —
 * запечені GLB (див. розділ «будинки» нижче).
 *
 * Кожен вид будується в БАЗОВИХ габаритах, а на місці масштабується
 * інстансом — рівно тими числами, з якими рахуються зіткнення (`PropField`).
 * Два незалежні джерела тут неприпустимі: гравець розбився б об дерево,
 * якого не бачить, або пролетів би крізь стіну.
 */

export const TREE_H = 13
export const TREE_R = 2.6
export const BUSH_R = 1.5
export const BUSH_H = 1.5
export const HAY_H = 3.2
export const HAY_R = 2.4
export const POLE_H = 11
/** Ширина траверси — з колайдера (`POLE_ARM`), із запасом усередину. */
const ARM_W = POLE_ARM.halfSpan * 2 - 0.1

export interface PropKit {
  trunk: THREE.Material
  /** крона дерева */
  leaf: THREE.Material
  /** чагарник — інший відтінок, інакше кущ читається як маленьке дерево */
  bushLeaf: THREE.Material
  straw: THREE.Material
  strawCap: THREE.Material
  band: THREE.Material
  wood: THREE.Material
  steel: THREE.Material
  insulator: THREE.Material
}

type Variant = (k: PropKit) => THREE.Group

// ---------------------------------------------------------------- дерево

/**
 * Дерева — запечені OBJ з Low Poly Tree Pack (`assets/trees/`): звичайні,
 * берези і сосни. Висота — рівно TREE_H (закріплено тестом), ширина крони —
 * природна для моделі: колайдер стовбура лишається вузьким, і крона
 * навмисно ширша за нього.
 */
const bakedTree = (type: (typeof TREE_TYPES)[number]): Variant => {
  const model = BAKED_TREES[type]
  const palette = model.palette.map((hex) => new THREE.Color(hex))
  const length = TREE_H / model.heightRatio
  return () => {
    const g = new THREE.Group()
    g.add(buildBakedMesh(model, { width: length * model.widthRatio, length, height: TREE_H }, palette))
    return g
  }
}

// ---------------------------------------------------------------- кущ

const bushDome: Variant = (k) => {
  const g = new THREE.Group()
  const s = new THREE.Mesh(new THREE.SphereGeometry(BUSH_R, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2), k.bushLeaf)
  s.rotation.x = Math.PI / 2
  s.scale.set(1, 1, 0.8)
  g.add(s)
  return fitInto(flatten(g), BUSH_R, BUSH_H)
}

const bushRock: Variant = (k) => {
  const g = new THREE.Group()
  const s = new THREE.Mesh(new THREE.IcosahedronGeometry(BUSH_R, 0), k.bushLeaf)
  s.scale.set(1.1, 0.95, 0.62)
  s.position.z = BUSH_R * 0.5
  g.add(s)
  return fitInto(flatten(g), BUSH_R, BUSH_H)
}

/** Три зрощені шапки: неоднорідний край, за яким ховається техніка. */
const bushCluster: Variant = (k) => {
  const g = new THREE.Group()
  const r = BUSH_R
  for (const [x, y, kk] of [
    [0, 0, 1],
    [r * 0.7, r * 0.3, 0.72],
    [-r * 0.5, -r * 0.55, 0.6],
  ]) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(r * kk, 6, 4), k.bushLeaf)
    s.scale.set(1, 1, 0.62)
    s.position.set(x, y, r * kk * 0.62)
    g.add(s)
  }
  return fitInto(flatten(g), BUSH_R, BUSH_H)
}

// ---------------------------------------------------------------- стіг

const hayDrum: Variant = (k) => {
  const g = new THREE.Group()
  cyl(g, HAY_R * 0.96, HAY_R, HAY_H, 8, k.straw, 0, 0, HAY_H / 2, 'z')
  return fitInto(flatten(g), HAY_R, HAY_H)
}

/** Лежачий рулон — інший силует із повітря, ніж стоячий барабан. */
const hayRoll: Variant = (k) => {
  const g = new THREE.Group()
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(HAY_H * 0.5, HAY_H * 0.5, HAY_R * 1.7, 10), k.straw)
  roll.rotation.z = Math.PI / 2
  roll.position.z = HAY_H * 0.5
  g.add(roll)
  return fitInto(flatten(g), HAY_R, HAY_H)
}

const hayCapped: Variant = (k) => {
  const g = new THREE.Group()
  cyl(g, HAY_R * 0.86, HAY_R, HAY_H * 0.72, 9, k.straw, 0, 0, HAY_H * 0.36, 'z')
  const cap = new THREE.Mesh(new THREE.ConeGeometry(HAY_R * 0.95, HAY_H * 0.42, 9), k.strawCap)
  cap.rotation.x = Math.PI / 2
  cap.position.z = HAY_H * 0.9
  g.add(cap)
  box(g, HAY_R * 2.1, 0.12, 0.1, k.band, 0, 0, HAY_H * 0.55)
  box(g, 0.12, HAY_R * 2.1, 0.1, k.band, 0, 0, HAY_H * 0.6)
  return fitInto(flatten(g), HAY_R, HAY_H)
}

// ---------------------------------------------------------------- стовп ЛЕП

/**
 * Верхня траверса в усіх трьох варіантів однакової ширини: колайдер траверси
 * один на всі стовпи (`POLE_ARM`), і він мусить збігатися з тим, що видно.
 */
const poleBraced: Variant = (k) => {
  const g = new THREE.Group()
  const h = POLE_H
  cyl(g, 0.2, 0.34, h, 6, k.wood, 0, 0, h / 2, 'z')
  box(g, ARM_W, 0.2, 0.2, k.wood, 0, 0, h * 0.94)
  box(g, 2.4, 0.18, 0.18, k.wood, 0, 0, h * 0.8)
  // підкоси: стовп перестає бути «паличкою» на тлі неба
  for (const s of [-1, 1]) box(g, 0.14, 0.14, h * 0.2, k.wood, s * 0.9, 0, h * 0.86, [0, s * 0.5, 0])
  return flatten(g)
}

const poleSteel: Variant = (k) => {
  const g = new THREE.Group()
  const h = POLE_H
  cyl(g, 0.18, 0.36, h, 6, k.wood, 0, 0, h / 2, 'z')
  box(g, ARM_W, 0.22, 0.22, k.steel, 0, 0, h * 0.93)
  box(g, 3.0, 0.2, 0.2, k.steel, 0, 0, h * 0.78)
  for (const x of [-1.9, -0.95, 0.95, 1.9]) cyl(g, 0.11, 0.11, 0.34, 6, k.insulator, x, 0, h * 0.95, 'z')
  for (const x of [-1.35, 1.35]) cyl(g, 0.1, 0.1, 0.3, 6, k.insulator, x, 0, h * 0.8, 'z')
  box(g, 0.5, 0.12, 0.5, k.steel, 0.22, 0, h * 0.5)
  return flatten(g)
}

const poleBlock: Variant = (k) => {
  const g = new THREE.Group()
  const h = POLE_H
  cyl(g, 0.22, 0.32, h, 5, k.wood, 0, 0, h / 2, 'z')
  box(g, ARM_W, 0.22, 0.22, k.wood, 0, 0, h * 0.92)
  return flatten(g)
}

// ---------------------------------------------------------------- будинки

/**
 * Будівлі мають індивідуальні габарити, тому будуються поштучно.
 *
 * `height` — ПОВНА висота разом із дахом: рівно стільки, скільки бере
 * колайдер. Раніше дах стирчав над колайдером і крізь нього можна було
 * пролетіти наскрізь.
 *
 * Моделі — запечені GLB з Kenney City Kit Suburban (`assets/suburban/`).
 * Тут вони просто розтягуються в заданий колайдер: правильні пропорції
 * гарантує props.ts, який кроїть w × l × h під обрану модель ще при
 * генерації карти (див. spawnBuildings).
 */
export type BuildingVariant = (k: PropKit, w: number, l: number, h: number) => THREE.Group

const bakedBuilding = (type: (typeof BUILDING_TYPES)[number]): BuildingVariant => {
  const model = BAKED_BUILDINGS[type]
  const palette = model.palette.map((hex) => new THREE.Color(hex))
  return (_k, w, l, h) => {
    const g = new THREE.Group()
    g.add(buildBakedMesh(model, { width: w, length: l, height: h }, palette))
    return g
  }
}

export const TREE_VARIANTS: Variant[] = TREE_TYPES.map(bakedTree)
export const BUSH_VARIANTS: Variant[] = [bushDome, bushRock, bushCluster]
export const HAY_VARIANTS: Variant[] = [hayDrum, hayRoll, hayCapped]
export const POLE_VARIANTS: Variant[] = [poleBraced, poleSteel, poleBlock]
/** Порядок збігається з BUILDING_TYPES: Prop.variant — індекс сюди. */
export const BUILDING_VARIANTS: BuildingVariant[] = BUILDING_TYPES.map(bakedBuilding)
