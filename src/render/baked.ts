import * as THREE from 'three'
import type { BakedModel } from './vehicle-data'

/**
 * Спільне декодування запечених GLB (див. scripts/bake-vehicles.mjs):
 * base64 → Int16-позиції в одиничному боксі → один меш із вершинними
 * кольорами. Техніка і будівлі відрізняються лише тим, звідки беруть
 * палітру (техніка ще перефарбовує її за належністю).
 */

/** Один матеріал на все запечене: колір живе у вершинах. */
export const BAKED_MATERIAL = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })

interface Decoded {
  /** нормалізовані позиції: x,y ∈ [-0.5, 0.5], z ∈ [0, 1] */
  positions: Float32Array
  faceColors: Uint8Array
}

const cache = new Map<BakedModel, Decoded>()

function fromBase64(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function decodeBaked(model: BakedModel): Decoded {
  const cached = cache.get(model)
  if (cached) return cached
  const raw = fromBase64(model.positions)
  const q = new Int16Array(raw.buffer, 0, raw.byteLength / 2)
  const positions = new Float32Array(q.length)
  for (let i = 0; i < q.length; i += 3) {
    positions[i] = q[i] / 32000
    positions[i + 1] = q[i + 1] / 32000
    positions[i + 2] = q[i + 2] / 32000 + 0.5
  }
  const d: Decoded = { positions, faceColors: fromBase64(model.faceColors) }
  cache.set(model, d)
  return d
}

/** Меш моделі, розтягнутої до заданих габаритів, з кольорами з палітри. */
export function buildBakedMesh(
  model: BakedModel,
  dims: { width: number; length: number; height: number },
  palette: THREE.Color[],
): THREE.Mesh {
  const { positions, faceColors } = decodeBaked(model)
  const pos = new Float32Array(positions.length)
  const col = new Float32Array(positions.length)
  for (let i = 0; i < positions.length; i += 3) {
    pos[i] = positions[i] * dims.width
    pos[i + 1] = positions[i + 1] * dims.length
    pos[i + 2] = positions[i + 2] * dims.height
    const c = palette[faceColors[(i / 9) | 0]]
    col[i] = c.r
    col[i + 1] = c.g
    col[i + 2] = c.b
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  geo.computeVertexNormals()
  return new THREE.Mesh(geo, BAKED_MATERIAL)
}
