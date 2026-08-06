import * as THREE from 'three'
import type { Terrain } from '../level/terrain'
import type { LevelSpec, WeatherSpec } from '../level/types'
import { makeRng } from '../flight/math'
import type { Prop, PropField, PropKind } from '../level/props'
import { mergeByMaterial } from './shapes'
import {
  BUILDING_VARIANTS,
  BUSH_VARIANTS,
  HAY_VARIANTS,
  POLE_H,
  POLE_VARIANTS,
  TREE_H,
  TREE_VARIANTS,
  type PropKit,
} from './props-models'

/**
 * Уся геометрія світу — процедурна: жодних асетів, усе з того самого seed,
 * що й фізичний рельєф. Бюджет: < 1.5 млн трикутників, < 120 draw calls.
 */

const TERRAIN_SEGMENTS = 320
const GRASS_RADIUS = 75
const GRASS_COUNT = 5200

/**
 * Матеріали наповнення (будівлі — запечені GLB зі своїми кольорами).
 * Експортовано, бо сторінка /models показує пропси тими самими матеріалами.
 */
export function makePropKit(palette: Palette): PropKit {
  const lambert = (color: number) => new THREE.MeshLambertMaterial({ color, flatShading: true })
  return {
    trunk: lambert(0x4a3f31),
    leaf: lambert(palette.tree.getHex()),
    bushLeaf: lambert(palette.tree.clone().offsetHSL(0.02, -0.05, 0.06).getHex()),
    straw: lambert(0xa8934f),
    strawCap: lambert(0x9c8746),
    band: lambert(0x5c5040),
    wood: lambert(0x6f6152),
    steel: lambert(0x6b6f66),
    insulator: lambert(0xcfd4d0),
  }
}

export interface Palette {
  sky: THREE.Color
  horizon: THREE.Color
  ground: THREE.Color
  grass: THREE.Color
  tree: THREE.Color
  fog: THREE.Color
  sun: THREE.Vector3
  sunIntensity: number
  ambient: number
}

export const PALETTES: Record<WeatherSpec['timeOfDay'], Palette> = {
  dawn: {
    sky: new THREE.Color(0x9fb2c8),
    horizon: new THREE.Color(0xd9c2a8),
    ground: new THREE.Color(0x6d7355),
    grass: new THREE.Color(0x7c8259),
    tree: new THREE.Color(0x3f4a35),
    fog: new THREE.Color(0xc3c8c6),
    sun: new THREE.Vector3(-0.5, 0.3, 0.25),
    sunIntensity: 1.5,
    ambient: 0.55,
  },
  day: {
    sky: new THREE.Color(0x8ea6c0),
    horizon: new THREE.Color(0xc4cdd2),
    ground: new THREE.Color(0x77784f),
    grass: new THREE.Color(0x8a8c52),
    tree: new THREE.Color(0x3b4a2e),
    fog: new THREE.Color(0xb9c2c4),
    sun: new THREE.Vector3(0.35, 0.5, 0.78),
    sunIntensity: 2.1,
    ambient: 0.7,
  },
  dusk: {
    sky: new THREE.Color(0x6b7488),
    horizon: new THREE.Color(0xb08a6a),
    ground: new THREE.Color(0x554f3c),
    grass: new THREE.Color(0x5f6141),
    tree: new THREE.Color(0x2c3527),
    fog: new THREE.Color(0x8e8a84),
    sun: new THREE.Vector3(-0.7, -0.2, 0.12),
    sunIntensity: 1.1,
    ambient: 0.45,
  },
  night: {
    sky: new THREE.Color(0x1b2028),
    horizon: new THREE.Color(0x272d35),
    ground: new THREE.Color(0x2a2d28),
    grass: new THREE.Color(0x30332b),
    tree: new THREE.Color(0x1b211a),
    fog: new THREE.Color(0x22262a),
    sun: new THREE.Vector3(0.2, 0.4, 0.6),
    sunIntensity: 0.35,
    ambient: 0.25,
  },
}

export class World {
  readonly scene = new THREE.Scene()
  readonly palette: Palette
  private grass?: THREE.InstancedMesh
  private grassAnchor = new THREE.Vector2(1e9, 1e9)
  private grassRng: () => number

  constructor(
    private terrain: Terrain,
    private level: LevelSpec,
    private props: PropField,
  ) {
    this.palette = PALETTES[level.weather.timeOfDay]
    this.grassRng = makeRng(level.terrain.seed ^ 0x51ed)

    this.scene.background = this.palette.sky
    this.scene.fog = new THREE.FogExp2(this.palette.fog.getHex(), level.weather.fogDensity)

    this.buildLights()
    this.buildSky()
    this.buildTerrain()
    this.buildProps()
    this.buildRoads()
    this.buildGrass()
  }

  private buildLights(): void {
    const p = this.palette
    const sun = new THREE.DirectionalLight(0xffffff, p.sunIntensity)
    sun.position.set(p.sun.x, p.sun.y, p.sun.z).normalize().multiplyScalar(500)
    this.scene.add(sun)
    this.scene.add(new THREE.HemisphereLight(p.sky.getHex(), p.ground.getHex(), p.ambient))
  }

  /** Купол неба з градієнтом — дешевше й читабельніше за skybox-текстуру. */
  private buildSky(): void {
    const geo = new THREE.SphereGeometry(this.terrain.config.size * 4, 24, 12)
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: this.palette.sky },
        bottom: { value: this.palette.horizon },
      },
      vertexShader: `
        varying float vH;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vH = normalize(world.xyz).z;
          gl_Position = projectionMatrix * viewMatrix * world;
        }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 bottom; varying float vH;
        void main() {
          gl_FragColor = vec4(mix(bottom, top, smoothstep(-0.05, 0.45, vH)), 1.0);
        }`,
    })
    this.scene.add(new THREE.Mesh(geo, mat))
  }

  private buildTerrain(): void {
    const size = this.terrain.config.size * 2
    const geo = new THREE.PlaneGeometry(size, size, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS)
    const pos = geo.attributes.position as THREE.BufferAttribute
    const colors = new Float32Array(pos.count * 3)
    const base = this.palette.ground

    // палітра полів: рілля, стерня, трава, пар. Межі між ними — головний
    // орієнтир пілота: по них читається і висота, і швидкість, і напрямок.
    const fields = [
      base.clone().multiplyScalar(0.62).offsetHSL(0.02, -0.1, 0),
      base.clone().multiplyScalar(1.18).offsetHSL(-0.02, 0.05, 0),
      base.clone().multiplyScalar(0.86),
      base.clone().multiplyScalar(1.05).offsetHSL(0.04, 0.08, 0),
    ]
    const c = new THREE.Color()

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const h = this.terrain.height(x, y)
      pos.setZ(i, h)

      // великі поля + дрібна фактура всередині поля
      const field = fields[Math.floor(this.terrain.patchNoise(x, y, 140) * fields.length) % fields.length]
      const grain = this.terrain.patchNoise(x, y, 18, 31) - 0.5
      const slope = (h / this.terrain.config.amplitude) * 0.5 + 0.5
      c.copy(field).multiplyScalar(0.9 + grain * 0.22 + slope * 0.18)

      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.computeVertexNormals()

    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshLambertMaterial({ vertexColors: true }),
    )
    mesh.name = 'terrain'
    this.scene.add(mesh)
  }

  /**
   * Наповнення карти малюється з PropField — того самого, об який відбуваються
   * зіткнення. Два незалежні генератори тут неприпустимі: гравець розбився б
   * об дерево, якого не бачить.
   */
  private buildProps(): void {
    const kit = this.propKit()
    this.instanced('tree', TREE_VARIANTS.map((v) => v(kit)), (p) => p.height / TREE_H)
    this.instanced('bush', BUSH_VARIANTS.map((v) => v(kit)), (p) => p.scale)
    this.instanced('haystack', HAY_VARIANTS.map((v) => v(kit)), (p) => p.scale)
    this.instanced('pole', POLE_VARIANTS.map((v) => v(kit)), (p) => p.height / POLE_H)
    this.buildBuildings(kit)
  }

  private propKit(): PropKit {
    return makePropKit(this.palette)
  }

  /**
   * Один InstancedMesh на варіант і матеріал — так тримаємось бюджету
   * draw calls навіть із трьома варіантами кожного виду.
   */
  private instanced(kind: PropKind, models: THREE.Group[], heightScale: (p: Prop) => number): void {
    const items = this.props.ofKind(kind)
    if (!items.length) return

    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 0, 1)
    const scale = new THREE.Vector3()
    const pos = new THREE.Vector3()

    const byVariant: Prop[][] = models.map(() => [])
    for (const p of items) byVariant[variantIndex(p, models.length)].push(p)

    models.forEach((model, vi) => {
      const list = byVariant[vi]
      if (!list.length) return
      for (const child of model.children) {
        const part = child as THREE.Mesh
        if (!part.isMesh) continue
        const mesh = new THREE.InstancedMesh(part.geometry, part.material as THREE.Material, list.length)
        list.forEach((p, i) => {
          pos.set(p.x, p.y, p.groundZ)
          scale.set(p.scale, p.scale, heightScale(p))
          q.setFromAxisAngle(up, p.rotation)
          m.compose(pos, q, scale)
          mesh.setMatrixAt(i, m)
        })
        mesh.instanceMatrix.needsUpdate = true
        this.scene.add(mesh)
      }
    })
  }

  /**
   * Будівлі мають індивідуальні габарити, тому інстансами їх не зібрати —
   * зате всі ферми карти склеюються в кілька мешів на матеріал.
   */
  private buildBuildings(kit: PropKit): void {
    const groups: THREE.Group[] = []
    for (const p of this.props.ofKind('building')) {
      const w = (p.halfW ?? 4) * 2
      const l = (p.halfL ?? 7) * 2
      const build = BUILDING_VARIANTS[p.variant ?? variantIndex(p, BUILDING_VARIANTS.length)]
      const g = build(kit, w, l, p.height)
      g.position.set(p.x, p.y, p.groundZ)
      g.rotation.z = p.rotation
      groups.push(g)
    }
    if (!groups.length) return
    for (const mesh of mergeByMaterial(groups)) this.scene.add(mesh)
  }

  /** Ґрунтівки будуємо з маршрутів цілей — дорога і є підказкою, де шукати. */
  private buildRoads(): void {
    const mat = new THREE.MeshLambertMaterial({ color: 0x8a7f68 })
    for (const t of this.level.targets) {
      if (!t.route || t.route.points.length < 2) continue
      const geo = this.ribbon(t.route.points, 7)
      if (geo) this.scene.add(new THREE.Mesh(geo, mat))
    }
  }

  /** Плоска стрічка вздовж ламаної, покладена на рельєф. */
  private ribbon(points: Array<[number, number]>, width: number): THREE.BufferGeometry | null {
    const verts: number[] = []
    const idx: number[] = []
    const step = 12
    const half = width / 2
    let n = 0

    for (let i = 0; i < points.length - 1; i++) {
      const [ax, ay] = points[i]
      const [bx, by] = points[i + 1]
      const len = Math.hypot(bx - ax, by - ay)
      const segs = Math.max(2, Math.ceil(len / step))
      const dx = (bx - ax) / len
      const dy = (by - ay) / len
      for (let s = 0; s <= segs; s++) {
        const t = s / segs
        const x = ax + (bx - ax) * t
        const y = ay + (by - ay) * t
        const h = this.terrain.height(x, y) + 0.15
        verts.push(x - dy * half, y + dx * half, h, x + dy * half, y - dx * half, h)
        if (s < segs) {
          const b = n + s * 2
          idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2)
        }
      }
      n += (segs + 1) * 2
    }
    if (!verts.length) return null
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
    geo.setIndex(idx)
    geo.computeVertexNormals()
    return geo
  }

  /** Трава лише навколо дрона — інакше не влізаємо в бюджет. */
  private buildGrass(): void {
    const blade = new THREE.PlaneGeometry(0.16, 0.8)
    blade.translate(0, 0, 0.4)
    blade.rotateX(Math.PI / 2)
    this.grass = new THREE.InstancedMesh(
      blade,
      // вертикальний квад майже не ловить світло згори і виглядав би чорним
      // сміттям — тому підсвічуємо його власним кольором
      new THREE.MeshLambertMaterial({
        color: this.palette.grass,
        emissive: this.palette.grass.clone().multiplyScalar(0.5),
        side: THREE.DoubleSide,
      }),
      GRASS_COUNT,
    )
    this.grass.frustumCulled = false
    this.scene.add(this.grass)
  }

  /**
   * Пересіває траву, коли дрон від'їхав далеко від якоря.
   * Без цього або трава закінчується, або бюджет вибухає.
   */
  updateGrass(x: number, y: number): void {
    if (!this.grass) return
    if (this.grassAnchor.distanceTo(new THREE.Vector2(x, y)) < GRASS_RADIUS * 0.4) return
    this.grassAnchor.set(x, y)

    const rng = this.grassRng
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 0, 1)
    const s = new THREE.Vector3()
    const p = new THREE.Vector3()

    for (let i = 0; i < GRASS_COUNT; i++) {
      const a = rng() * Math.PI * 2
      // щільність ∝ 1/r: густо під дроном, розріджено до краю — так межа
      // «килима» трави не читається як коло
      const r = rng() * GRASS_RADIUS
      const gx = x + Math.cos(a) * r
      const gy = y + Math.sin(a) * r
      p.set(gx, gy, this.terrain.height(gx, gy))
      const sc = 0.7 + rng() * 0.9
      s.set(sc, sc, sc)
      q.setFromAxisAngle(up, rng() * Math.PI)
      m.compose(p, q, s)
      this.grass.setMatrixAt(i, m)
    }
    this.grass.instanceMatrix.needsUpdate = true
  }
}

/**
 * Який із варіантів моделі дістанеться цьому об'єкту. Рахується з координат,
 * а не з лічильника: лісосмуга мусить виглядати однаково при кожному запуску
 * рівня, інакше орієнтир, який пілот запам'ятав на брифінгу, зникає.
 *
 * Хеш — тільки через Math.imul: велика константа у звичайному множенні
 * виходить за точність float64 (§11a.3).
 */
function variantIndex(p: Prop, count: number): number {
  let h = Math.imul(Math.round(p.x * 16) | 0, 0x27d4eb2d)
  h = Math.imul(h ^ (Math.round(p.y * 16) | 0), 0x165667b1)
  h ^= h >>> 15
  return Math.abs(h) % count
}
