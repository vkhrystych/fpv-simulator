// Запікання GLB-моделей у статичні дані:
//   техніка  assets/mil/       → src/render/vehicle-data.ts
//   будівлі  assets/suburban/  → src/render/building-data.ts (Kenney City Kit Suburban, CC0)
//
// Чому запікання, а не GLTFLoader у рантаймі:
//  1. buildVehicle() синхронний — його кличуть тести (Node) і картки брифінгу.
//  2. Бюджет draw calls: модель з 11 матеріалів злипається в ОДИН меш
//     із вершинними кольорами ще тут, а не в грі.
//  3. Габарити: модель нормалізується в одиничний бокс (x,y ∈ [-.5,.5], z ∈ [0,1]),
//     а справжні розміри приходять із даних гри — силует і є складність.
//
// Кольори: у техніки — baseColorFactor матеріалу (linear → sRGB); у будівель
// матеріал один із palette-текстурою, тому колір грані семплиться з colormap
// по UV-центроїду (текстура вже в sRGB).
//
// Конвенції на виході — ті самі, що в shapes.ts: Z угору, ніс у +Y, стоїть на z=0.
// Запуск: node scripts/bake-vehicles.mjs   (дебаг-рендери: --debug <dir>)

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const SRC_DIR = path.join(ROOT, 'assets/mil')
const BUILDING_DIR = path.join(ROOT, 'assets/suburban')
const OUT = path.join(ROOT, 'src/render/vehicle-data.ts')
const BUILDING_OUT = path.join(ROOT, 'src/render/building-data.ts')

// Клас гри → файл + доворот носа (рад, навколо Z, ПІСЛЯ переводу в Z-up).
// Увесь набір змодельований носом у -Y нашої системи, тому всім π.
// Без класу лишаються: Helicopter і Military Boat (у грі немає авіації й води)
// та Bike (велосипед). car і emplacement — процедурні.
const MODELS = {
  motorcycle: { file: 'Military Motorbike.glb', yaw: Math.PI },
  pickup: { file: 'Jeep.glb', yaw: Math.PI },
  van: { file: 'Ambulance Car.glb', yaw: Math.PI },
  truck: { file: 'Truck.glb', yaw: Math.PI },
  apc: { file: 'Light Tank.glb', yaw: Math.PI },
  tank: { file: 'Tank.glb', yaw: Math.PI },
}

// 8 із 21 типів набору — різні силуети: одноповерхові, двоповерхові з крилом,
// вузький високий, модерн із плоским дахом. Всі 21 роздули б бандл удвічі.
const BUILDINGS = ['a', 'b', 'd', 'f', 'g', 'h', 'q', 'u']

// Дерева з Low Poly Tree Pack (OBJ + MTL): найлегші з листяних і сосен —
// це наймасовіший інстансований проп, полігони тут множаться на сотні.
const TREES = ['CommonTree_3', 'CommonTree_4', 'CommonTree_5', 'BirchTree_2', 'BirchTree_5', 'PineTree_2', 'PineTree_5']

// ---------- мінімальний парсер GLB ----------

function parseGlb(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('не GLB')
  const jsonLen = buf.readUInt32LE(12)
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString())
  let bin = null
  let off = 20 + jsonLen
  while (off < buf.length) {
    const len = buf.readUInt32LE(off)
    const type = buf.readUInt32LE(off + 4)
    if (type === 0x004e4942) bin = buf.subarray(off + 8, off + 8 + len)
    off += 8 + len
  }
  return { json, bin }
}

function accessorData(json, bin, index) {
  const acc = json.accessors[index]
  const bv = json.bufferViews[acc.bufferView]
  const start = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0)
  const compSize = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[acc.componentType]
  const compCount = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type]
  const stride = bv.byteStride ?? compSize * compCount
  const out = new Float64Array(acc.count * compCount)
  for (let i = 0; i < acc.count; i++) {
    for (let c = 0; c < compCount; c++) {
      const o = start + i * stride + c * compSize
      out[i * compCount + c] =
        acc.componentType === 5126 ? bin.readFloatLE(o)
        : acc.componentType === 5125 ? bin.readUInt32LE(o)
        : acc.componentType === 5123 ? bin.readUInt16LE(o)
        : acc.componentType === 5122 ? bin.readInt16LE(o)
        : acc.componentType === 5121 ? bin.readUInt8(o)
        : bin.readInt8(o)
    }
  }
  return out
}

// ---------- 4×4 матриці (column-major, як у glTF) ----------

const I4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

function mul(a, b) {
  const r = new Array(16).fill(0)
  for (let c = 0; c < 4; c++)
    for (let row = 0; row < 4; row++)
      for (let k = 0; k < 4; k++) r[c * 4 + row] += a[k * 4 + row] * b[c * 4 + k]
  return r
}

function trs(node) {
  if (node.matrix) return node.matrix
  const [tx, ty, tz] = node.translation ?? [0, 0, 0]
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1]
  const [sx, sy, sz] = node.scale ?? [1, 1, 1]
  const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz
  const xx = qx * x2, xy = qx * y2, xz = qx * z2
  const yy = qy * y2, yz = qy * z2, zz = qz * z2
  const wx = qw * x2, wy = qw * y2, wz = qw * z2
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ]
}

function apply(m, x, y, z) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ]
}

// ---------- кольори ----------

function linToSrgb(c) {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
}

function materialColor(json, index) {
  const f = json.materials?.[index]?.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1]
  return f.slice(0, 3).map((c) => Math.round(linToSrgb(c) * 255))
}

// ---------- PNG-декодер для palette-текстур (colormap Kenney) ----------

/** Рівно стільки PNG, скільки треба: 8 біт, типи 2 (RGB), 3 (палітра), 6 (RGBA). */
function decodePng(buf) {
  const w = buf.readUInt32BE(16)
  const h = buf.readUInt32BE(20)
  const colorType = buf[25]
  if (buf[24] !== 8 || buf[28] !== 0) throw new Error('PNG: підтримується лише 8 біт без interlace')
  let palette = null
  const idat = []
  let off = 8
  while (off < buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    if (type === 'PLTE') palette = buf.subarray(off + 8, off + 8 + len)
    if (type === 'IDAT') idat.push(buf.subarray(off + 8, off + 8 + len))
    off += 12 + len
  }
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const bpp = { 2: 3, 3: 1, 6: 4 }[colorType]
  if (!bpp) throw new Error(`PNG: тип кольору ${colorType} не підтримується`)
  const stride = w * bpp
  const px = Buffer.alloc(h * stride)
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const out = px.subarray(y * stride, (y + 1) * stride)
    const prev = y ? px.subarray((y - 1) * stride, y * stride) : null
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[i - bpp] : 0
      const b = prev ? prev[i] : 0
      const c = prev && i >= bpp ? prev[i - bpp] : 0
      let v = line[i]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      out[i] = v
    }
  }
  const sample = (u, v) => {
    const x = Math.min(w - 1, Math.max(0, Math.floor((u - Math.floor(u)) * w)))
    const y = Math.min(h - 1, Math.max(0, Math.floor((v - Math.floor(v)) * h)))
    if (colorType === 3) {
      const i = px[y * stride + x] * 3
      return [palette[i], palette[i + 1], palette[i + 2]]
    }
    const i = y * stride + x * bpp
    return [px[i], px[i + 1], px[i + 2]]
  }
  return { sample }
}

/** Текстура baseColor (вбудована або по uri поруч із GLB) → семплер, або null. */
function textureSampler(json, bin, baseDir) {
  const image = json.images?.[0]
  if (!image) return null
  if (image.bufferView !== undefined) {
    const bv = json.bufferViews[image.bufferView]
    return decodePng(Buffer.from(bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength))).sample
  }
  if (image.uri && !image.uri.startsWith('data:')) {
    return decodePng(fs.readFileSync(path.join(baseDir, decodeURIComponent(image.uri)))).sample
  }
  return null
}

// ---------- збирання трикутників у світових координатах моделі ----------

function collectTriangles(json, bin, baseDir) {
  const sample = textureSampler(json, bin, baseDir)
  const tris = [] // {v: [[x,y,z]×3], color: [r,g,b]}
  const walk = (nodeIndex, parent) => {
    const node = json.nodes[nodeIndex]
    const world = mul(parent, trs(node))
    if (node.mesh !== undefined) {
      for (const prim of json.meshes[node.mesh].primitives) {
        if ((prim.mode ?? 4) !== 4) continue
        const pos = accessorData(json, bin, prim.attributes.POSITION)
        const idx = prim.indices !== undefined ? accessorData(json, bin, prim.indices) : null
        const hasTex =
          sample &&
          prim.attributes.TEXCOORD_0 !== undefined &&
          json.materials?.[prim.material]?.pbrMetallicRoughness?.baseColorTexture !== undefined
        const uv = hasTex ? accessorData(json, bin, prim.attributes.TEXCOORD_0) : null
        const flat = materialColor(json, prim.material ?? -1)
        const count = idx ? idx.length : pos.length / 3
        for (let i = 0; i < count; i += 3) {
          const v = []
          let u = 0
          let w = 0
          for (let k = 0; k < 3; k++) {
            const vi = idx ? idx[i + k] : i + k
            v.push(apply(world, pos[vi * 3], pos[vi * 3 + 1], pos[vi * 3 + 2]))
            if (uv) {
              u += uv[vi * 2] / 3
              w += uv[vi * 2 + 1] / 3
            }
          }
          // palette-текстура — плоскі клітинки кольору, тому центроїда досить
          tris.push({ v, color: uv ? sample(u, w) : flat })
        }
      }
    }
    for (const c of node.children ?? []) walk(c, world)
  }
  const scene = json.scenes[json.scene ?? 0]
  for (const n of scene.nodes) walk(n, I4)
  return tris
}

// ---------- OBJ + MTL (Low Poly Tree Pack) ----------

function parseMtl(text) {
  const colors = new Map()
  let current = null
  for (const line of text.split('\n')) {
    const t = line.trim().split(/\s+/)
    if (t[0] === 'newmtl') current = t[1]
    // Kd у цих MTL — лінійний простір (експорт Blender), як baseColorFactor у GLB
    if (t[0] === 'Kd' && current) {
      colors.set(current, t.slice(1, 4).map((c) => Math.round(linToSrgb(Number(c)) * 255)))
    }
  }
  return colors
}

function collectObjTriangles(objPath) {
  const text = fs.readFileSync(objPath, 'utf8')
  const mtl = parseMtl(fs.readFileSync(objPath.replace(/\.obj$/, '.mtl'), 'utf8'))
  const verts = []
  const tris = []
  let color = [200, 200, 200]
  for (const line of text.split('\n')) {
    const t = line.trim().split(/\s+/)
    if (t[0] === 'v') verts.push([Number(t[1]), Number(t[2]), Number(t[3])])
    else if (t[0] === 'usemtl') color = mtl.get(t[1]) ?? color
    else if (t[0] === 'f') {
      const idx = t.slice(1).map((w) => {
        const i = Number(w.split('/')[0])
        return i > 0 ? i - 1 : verts.length + i
      })
      // полігони — віялом у трикутники
      for (let i = 2; i < idx.length; i++) {
        tris.push({ v: [verts[idx[0]], verts[idx[i - 1]], verts[idx[i]]], color })
      }
    }
  }
  return tris
}

// ---------- нормалізація в конвенції гри ----------

function normalize(tris, yaw) {
  // glTF: Y угору, тут ніс уже дивиться куди завгодно → Z-up: (x, y, z) → (x, -z, y)
  const cy = Math.cos(yaw), sy = Math.sin(yaw)
  for (const t of tris) {
    t.v = t.v.map(([x, y, z]) => {
      const gx = x, gy = -z, gz = y
      return [gx * cy - gy * sy, gx * sy + gy * cy, gz]
    })
  }
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  for (const t of tris)
    for (const p of t.v)
      for (let i = 0; i < 3; i++) {
        if (p[i] < min[i]) min[i] = p[i]
        if (p[i] > max[i]) max[i] = p[i]
      }
  const size = max.map((v, i) => Math.max(v - min[i], 1e-9))
  for (const t of tris)
    t.v = t.v.map((p) => [
      (p[0] - (min[0] + max[0]) / 2) / size[0],
      (p[1] - (min[1] + max[1]) / 2) / size[1],
      (p[2] - min[2]) / size[2],
    ])
  return { tris, aspect: { length: size[1], width: size[0], height: size[2] } }
}

// ---------- серіалізація: Int16-позиції + палітра + індекс кольору на грань ----------

function serialize(tris) {
  const palette = []
  const paletteIndex = new Map()
  const faceColor = new Uint8Array(tris.length)
  const pos = new Int16Array(tris.length * 9)
  tris.forEach((t, f) => {
    const key = t.color.join(',')
    if (!paletteIndex.has(key)) {
      paletteIndex.set(key, palette.length)
      palette.push((t.color[0] << 16) | (t.color[1] << 8) | t.color[2])
    }
    faceColor[f] = paletteIndex.get(key)
    t.v.forEach((p, k) => {
      pos[f * 9 + k * 3] = Math.round(p[0] * 32000)
      pos[f * 9 + k * 3 + 1] = Math.round(p[1] * 32000)
      pos[f * 9 + k * 3 + 2] = Math.round((p[2] - 0.5) * 32000)
    })
  })
  return { palette, faceColor, pos }
}

const b64 = (typed) => Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength).toString('base64')

// ---------- дебаг-рендер: плоскі проєкції у PNG, щоб перевірити ніс і силует ----------

function writePng(file, w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  const chunk = (type, data) => {
    const out = Buffer.alloc(data.length + 12)
    out.writeUInt32BE(data.length, 0)
    out.write(type, 4)
    data.copy(out, 8)
    const crc = zlib.crc32 ? zlib.crc32(out.subarray(4, 8 + data.length)) : crc32(out.subarray(4, 8 + data.length))
    out.writeUInt32BE(crc >>> 0, 8 + data.length)
    return out
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 6
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]))
}

let CRC_TABLE
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      CRC_TABLE[n] = c
    }
  }
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return c ^ 0xffffffff
}

/** Три проєкції в один PNG: згори (ніс має бути ВГОРУ картинки), збоку, спереду. */
function debugRender(name, tris, aspect, dir) {
  const W = 720, H = 260, pad = 12
  const rgba = Buffer.alloc(W * H * 4)
  rgba.fill(24)
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255

  // Метричні координати: центр у нулі по всіх осях, справжні пропорції моделі.
  const dims = [aspect.width, aspect.length, aspect.height]
  const metric = tris.map((t) => ({
    color: t.color,
    v: t.v.map((p) => [p[0] * dims[0], p[1] * dims[1], (p[2] - 0.5) * dims[2]]),
  }))

  // ax → праворуч картинки, ay → вгору картинки, az → до глядача
  const views = [
    { ax: 0, ay: 1, az: 2 }, // згори: ніс має дивитись ВГОРУ картинки
    { ax: 1, ay: 2, az: 0 }, // збоку: ніс праворуч
    { ax: 0, ay: 2, az: 1 }, // спереду
  ]
  const panelW = W / 3
  views.forEach((view, panel) => {
    const scale = Math.min((panelW - pad * 2) / dims[view.ax], (H - pad * 2) / dims[view.ay])
    const cx = panel * panelW + panelW / 2
    const cy = H / 2
    const sorted = metric
      .map((t) => ({ t, d: t.v[0][view.az] + t.v[1][view.az] + t.v[2][view.az] }))
      .sort((a, b) => a.d - b.d)
    for (const { t } of sorted) {
      const [a, b, c] = t.v
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
      const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
      const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]
      const nl = Math.hypot(n[0], n[1], n[2]) || 1
      const light = 0.55 + 0.45 * Math.abs((n[0] * 0.4 + n[1] * 0.2 + n[2] * 0.89) / nl)
      const col = t.color.map((v) => Math.min(255, v * light))
      const px = t.v.map((p) => [cx + p[view.ax] * scale, cy - p[view.ay] * scale])
      fillTri(rgba, W, H, px, col)
    }
  })
  writePng(path.join(dir, `${name}.png`), W, H, rgba)
}

function fillTri(rgba, W, H, [p0, p1, p2], col) {
  const minX = Math.max(0, Math.floor(Math.min(p0[0], p1[0], p2[0])))
  const maxX = Math.min(W - 1, Math.ceil(Math.max(p0[0], p1[0], p2[0])))
  const minY = Math.max(0, Math.floor(Math.min(p0[1], p1[1], p2[1])))
  const maxY = Math.min(H - 1, Math.ceil(Math.max(p0[1], p1[1], p2[1])))
  const area = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1])
  if (Math.abs(area) < 1e-9) return
  for (let y = minY; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++) {
      const w0 = (p1[0] - x) * (p2[1] - y) - (p2[0] - x) * (p1[1] - y)
      const w1 = (p2[0] - x) * (p0[1] - y) - (p0[0] - x) * (p2[1] - y)
      const w2 = (p0[0] - x) * (p1[1] - y) - (p1[0] - x) * (p0[1] - y)
      const neg = w0 < 0 || w1 < 0 || w2 < 0
      const posi = w0 > 0 || w1 > 0 || w2 > 0
      if (neg && posi) continue
      const o = (y * W + x) * 4
      rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 255
    }
}

// ---------- головний прохід ----------

const debugIdx = process.argv.indexOf('--debug')
const debugDir = debugIdx >= 0 ? process.argv[debugIdx + 1] : null
if (debugDir) fs.mkdirSync(debugDir, { recursive: true })

function bake(key, file, yaw) {
  let raw
  if (file.endsWith('.obj')) {
    raw = collectObjTriangles(file)
  } else {
    const { json, bin } = parseGlb(fs.readFileSync(file))
    raw = collectTriangles(json, bin, path.dirname(file))
  }
  const { tris, aspect } = normalize(raw, yaw)
  const { palette, faceColor, pos } = serialize(tris)
  if (debugDir) debugRender(key, tris, aspect, debugDir)
  console.log(
    `${key.padEnd(10)} ${path.basename(file).padEnd(24)} ${tris.length} граней, ${palette.length} кольорів, ` +
      `w/l=${(aspect.width / aspect.length).toFixed(2)} h/l=${(aspect.height / aspect.length).toFixed(2)}`,
  )
  return { key, file: path.basename(file), faces: tris.length, palette, faceColor, pos, aspect }
}

function emit(entries) {
  const out = []
  for (const e of entries) {
    out.push(`  // ${e.file}`)
    out.push(`  ${e.key}: {`)
    out.push(`    positions: '${b64(e.pos)}',`)
    out.push(`    faceColors: '${b64(e.faceColor)}',`)
    out.push(`    palette: [${e.palette.map((p) => '0x' + p.toString(16).padStart(6, '0')).join(', ')}],`)
    out.push(`    faces: ${e.faces},`)
    out.push(`    widthRatio: ${(e.aspect.width / e.aspect.length).toFixed(4)},`)
    out.push(`    heightRatio: ${(e.aspect.height / e.aspect.length).toFixed(4)},`)
    out.push('  },')
  }
  return out
}

const FORMAT_DOC = [
  '// ЗГЕНЕРОВАНО scripts/bake-vehicles.mjs — не редагувати руками.',
  '// Формат: Int16-позиції ×32000, нормалізовані в x,y ∈ [-0.5, 0.5], z ∈ [-0.5, 0.5]',
  '// (z зсунуто на -0.5, щоб влізти в Int16; рантайм додає 0.5 і множить на габарити).',
  '// Z — угору. Колір — індекс у палітрі, по одному на грань (sRGB hex).',
]

// техніка
const vehicles = Object.entries(MODELS).map(([cls, spec]) => bake(cls, path.join(SRC_DIR, spec.file), spec.yaw))
fs.writeFileSync(
  OUT,
  [
    ...FORMAT_DOC,
    '// Джерело: assets/mil/*.glb (низькополі військовий набір). Ніс — у +Y.',
    '',
    'export interface BakedModel {',
    '  /** трикутники: 9 × Int16 на грань, base64 */',
    '  positions: string',
    '  /** індекс кольору грані в палітрі, base64 */',
    '  faceColors: string',
    '  palette: number[]',
    '  faces: number',
    '  /** пропорції оригіналу: ширина/довжина і висота/довжина — щоб не плющити колеса */',
    '  widthRatio: number',
    '  heightRatio: number',
    '}',
    '',
    'export const BAKED_VEHICLES: Record<string, BakedModel> = {',
    ...emit(vehicles),
    '}',
    '',
  ].join('\n'),
)
console.log(`→ ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} КБ)`)

// будівлі: фасад лежить уздовж X → widthRatio тут = глибина/фасад,
// heightRatio = висота/фасад (нормалізація та сама, «довжина» моделі — фасад)
const buildings = BUILDINGS.map((t) => {
  const e = bake(`t${t}`, path.join(BUILDING_DIR, `building-type-${t}.glb`), Math.PI / 2)
  return e
})
fs.writeFileSync(
  BUILDING_OUT,
  [
    ...FORMAT_DOC,
    '// Джерело: assets/suburban/*.glb — Kenney City Kit Suburban 2.0 (CC0, kenney.nl).',
    '// Фасад будинку — вздовж Y (як «довжина» техніки), щоб формат був спільний.',
    '// Пропорції потрібні props.ts: колайдер будівлі кроїться під обрану модель,',
    '// а не навпаки — інакше дах або стирчить із колайдера, або б’єшся об повітря.',
    '',
    "import type { BakedModel } from './vehicle-data'",
    '',
    '/** Порядок = індекс варіанта в Prop.variant. */',
    'export const BUILDING_TYPES = [' + BUILDINGS.map((t) => `'t${t}'`).join(', ') + '] as const',
    '',
    'export const BAKED_BUILDINGS: Record<string, BakedModel> = {',
    ...emit(buildings),
    '}',
    '',
    '/** Пропорції для генератора карти: глибина/фасад і висота/фасад. */',
    'export const BUILDING_RATIOS = BUILDING_TYPES.map((t) => ({',
    '  depthRatio: BAKED_BUILDINGS[t].widthRatio,',
    '  heightRatio: BAKED_BUILDINGS[t].heightRatio,',
    '}))',
    '',
  ].join('\n'),
)
console.log(`→ ${path.relative(ROOT, BUILDING_OUT)} (${(fs.statSync(BUILDING_OUT).size / 1024).toFixed(0)} КБ)`)

// дерева
const TREE_DIR = path.join(ROOT, 'assets/trees')
const TREE_OUT = path.join(ROOT, 'src/render/tree-data.ts')
const trees = TREES.map((t) => bake(t, path.join(TREE_DIR, `${t}.obj`), 0))
fs.writeFileSync(
  TREE_OUT,
  [
    ...FORMAT_DOC,
    '// Джерело: assets/trees/*.obj — Low Poly Tree Pack (Broken Vector).',
    '// Ширина/довжина крони — природні пропорції моделі відносно висоти;',
    '// колайдер стовбура вузький, крона навмисно ширша за нього.',
    '',
    "import type { BakedModel } from './vehicle-data'",
    '',
    '/** Порядок = індекс варіанта для хешу координат. */',
    'export const TREE_TYPES = [' + TREES.map((t) => `'${t}'`).join(', ') + '] as const',
    '',
    'export const BAKED_TREES: Record<string, BakedModel> = {',
    ...emit(trees),
    '}',
    '',
  ].join('\n'),
)
console.log(`→ ${path.relative(ROOT, TREE_OUT)} (${(fs.statSync(TREE_OUT).size / 1024).toFixed(0)} КБ)`)
