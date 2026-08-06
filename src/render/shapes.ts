import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Примітиви, з яких зібрані всі моделі гри, і склеювання готової моделі
 * в одну геометрію на матеріал.
 *
 * Домовленості, без яких модель не можна ставити в світ:
 *  1. Вісь Z — угору, об'єкт стоїть на z = 0.
 *  2. Ніс машини дивиться в +Y — VehicleRenderer крутить групу навколо Z.
 *  3. Габарити приходять із даних (`VEHICLES`, `PropField`), а не з коду:
 *     силует — це складність, і танк мусить лишитись 9.5 м у будь-якому стилі.
 */

export function box(
  g: THREE.Object3D,
  w: number,
  l: number,
  h: number,
  m: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  rot?: [number, number, number],
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, l, h), m)
  mesh.position.set(x, y, z)
  if (rot) mesh.rotation.set(rot[0], rot[1], rot[2])
  g.add(mesh)
  return mesh
}

/** Циліндр уздовж заданої осі: 'z' стоїть, 'y' лежить уперед, 'x' — поперек. */
export function cyl(
  g: THREE.Object3D,
  rTop: number,
  rBot: number,
  len: number,
  seg: number,
  m: THREE.Material,
  x: number,
  y: number,
  z: number,
  axis: 'x' | 'y' | 'z' = 'z',
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, len, seg), m)
  if (axis === 'z') mesh.rotation.x = Math.PI / 2
  else if (axis === 'x') mesh.rotation.z = Math.PI / 2
  mesh.position.set(x, y, z)
  g.add(mesh)
  return mesh
}

/**
 * Клин: коробка зі зсунутою верхньою гранню. Дає скоси, яких BoxGeometry
 * не вміє, і лишається дешевим — саме за скоси зачепився вибір моделей
 * (легковик, вантажівка, укриття).
 */
export function wedge(
  g: THREE.Object3D,
  wTop: number,
  wBot: number,
  l: number,
  h: number,
  m: THREE.Material,
  x: number,
  y: number,
  z: number,
  taperY = 1,
): THREE.Mesh {
  const geo = new THREE.BoxGeometry(1, 1, 1)
  const p = geo.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const top = p.getZ(i) > 0
    const k = top ? wTop : wBot
    p.setX(i, p.getX(i) * k)
    p.setY(i, p.getY(i) * l * (top ? taperY : 1))
    p.setZ(i, (p.getZ(i) + 0.5) * h)
  }
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(geo, m)
  mesh.position.set(x, y, z)
  g.add(mesh)
  return mesh
}

/**
 * Двосхилий дах: тригранна призма, вісь якої вже вздовж будівлі (локальна Y),
 * а ребро — уже вгору. Обертати її НЕ треба: доворот навколо власної осі кладе
 * дах набік (так це й було зламано).
 *
 * Ширина й підйом задаються НЕЗАЛЕЖНО, через scale: у призми радіуса R ширина
 * 1.732R жорстко зв'язана з висотою 1.5R, і на 9-метровій будівлі виходив
 * хребет завширшки 2.4 м.
 */
export function gable(
  g: THREE.Object3D,
  w: number,
  l: number,
  rise: number,
  m: THREE.Material,
  baseZ: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, l, 3, 1), m)
  mesh.scale.set(w / Math.sqrt(3), 1, rise / 1.5)
  mesh.position.set(0, 0, baseZ + (rise / 1.5) * 0.5)
  g.add(mesh)
  return mesh
}

/**
 * Склеює всі меші в одну геометрію на матеріал.
 *
 * Це не мікрооптимізація: детальні моделі дають 20+ мешів на машину і 11 на
 * будівлю, а бюджет — 120 draw calls на кадр (§8). Після склеювання танк — це
 * 2 виклики, а всі ферми карти — 4, замість 88.
 */
export function mergeByMaterial(sources: THREE.Object3D[]): THREE.Mesh[] {
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>()

  for (const src of sources) {
    src.updateMatrixWorld(true)
    src.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const mat = mesh.material as THREE.Material
      // toNonIndexed після трансформації: mergeGeometries не змішує
      // індексовані геометрії з неіндексованими (сфера vs коробка)
      const cloned = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)
      const geo = cloned.index ? cloned.toNonIndexed() : cloned
      const bucket = buckets.get(mat)
      if (bucket) bucket.push(geo)
      else buckets.set(mat, [geo])
    })
  }

  const out: THREE.Mesh[] = []
  for (const [mat, geos] of buckets) {
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos)
    if (!merged) continue
    if (geos.length > 1) for (const g of geos) g.dispose()
    out.push(new THREE.Mesh(merged, mat))
  }
  return out
}

/** Те саме, але на місці: група лишається тією ж, усередині — по мешу на матеріал. */
export function flatten(group: THREE.Group): THREE.Group {
  const merged = mergeByMaterial([group])
  group.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.isMesh) mesh.geometry.dispose()
  })
  group.clear()
  for (const m of merged) group.add(m)
  return group
}

/**
 * Уписує модель у слід колайдера: об'єкт, який стирчить за межі того, об що
 * гравець б'ється, — це або наскрізний привид, або удар об порожнечу.
 * Тільки зменшує: дозволяє малювати крону дерева ширшою за стовбур-колайдер.
 *
 * Масштаб запікається в геометрію, а не в трансформ групи: далі з цих
 * геометрій робляться InstancedMesh, і трансформ групи там просто зникне.
 * Викликати ПІСЛЯ flatten().
 */
export function fitInto(group: THREE.Group, radius: number, height: number): THREE.Group {
  const b = new THREE.Box3().setFromObject(group)
  const rXY = Math.max(Math.abs(b.min.x), Math.abs(b.max.x), Math.abs(b.min.y), Math.abs(b.max.y))
  const k = Math.min(1, radius / Math.max(rXY, 1e-6), height / Math.max(b.max.z, 1e-6))
  if (k < 1) {
    for (const child of group.children) {
      const mesh = child as THREE.Mesh
      if (mesh.isMesh) mesh.geometry.scale(k, k, k)
    }
  }
  return group
}
