import * as THREE from 'three'
import type { Terrain } from '../level/terrain'
import type { LevelSpec, WeatherSpec } from '../level/types'
import { makeRng } from '../flight/math'

/**
 * Уся геометрія світу — процедурна: жодних асетів, усе з того самого seed,
 * що й фізичний рельєф. Бюджет: < 1.5 млн трикутників, < 120 draw calls.
 */

const TERRAIN_SEGMENTS = 320
const GRASS_RADIUS = 75
const GRASS_COUNT = 5200
const TREE_COUNT = 900

interface Palette {
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

const PALETTES: Record<WeatherSpec['timeOfDay'], Palette> = {
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
  ) {
    this.palette = PALETTES[level.weather.timeOfDay]
    this.grassRng = makeRng(level.terrain.seed ^ 0x51ed)

    this.scene.background = this.palette.sky
    this.scene.fog = new THREE.FogExp2(this.palette.fog.getHex(), level.weather.fogDensity)

    this.buildLights()
    this.buildSky()
    this.buildTerrain()
    this.buildTrees()
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

  /** Лісосмуги: детерміновані по seed, згущені смугами — щоб було де ховатись цілі. */
  private buildTrees(): void {
    const rng = makeRng(this.terrain.config.seed ^ 0x7ee5)
    const size = this.terrain.config.size
    const trunk = new THREE.CylinderGeometry(0.28, 0.42, 5, 5)
    trunk.rotateX(Math.PI / 2)
    trunk.translate(0, 0, 2.5)
    const crown = new THREE.ConeGeometry(2.6, 9, 6)
    crown.rotateX(Math.PI / 2)
    crown.translate(0, 0, 8.5)

    const trunkMesh = new THREE.InstancedMesh(
      trunk,
      new THREE.MeshLambertMaterial({ color: 0x4a3f31 }),
      TREE_COUNT,
    )
    const crownMesh = new THREE.InstancedMesh(
      crown,
      new THREE.MeshLambertMaterial({ color: this.palette.tree }),
      TREE_COUNT,
    )

    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const s = new THREE.Vector3()
    const p = new THREE.Vector3()

    for (let i = 0; i < TREE_COUNT; i++) {
      // смуги вздовж осі Y з випадковим зсувом — імітація лісосмуг між полями
      const belt = Math.floor(rng() * 7)
      const bx = -size + ((belt + 0.5) / 7) * size * 2 + (rng() - 0.5) * 90
      const by = (rng() * 2 - 1) * size
      const h = this.terrain.height(bx, by)
      p.set(bx, by, h)
      const scale = 0.7 + rng() * 0.8
      s.set(scale, scale, scale * (0.8 + rng() * 0.5))
      q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), rng() * Math.PI * 2)
      m.compose(p, q, s)
      trunkMesh.setMatrixAt(i, m)
      crownMesh.setMatrixAt(i, m)
    }
    trunkMesh.instanceMatrix.needsUpdate = true
    crownMesh.instanceMatrix.needsUpdate = true
    this.scene.add(trunkMesh, crownMesh)
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
