import * as THREE from 'three'
import { makeRng } from '../flight/math'

/**
 * Три варіанти вибуху техніки для повтору спостерігача.
 *
 * Контракт: група стоїть на землі в (0,0,0), `update(t)` — ЧИСТА функція
 * від часу з моменту удару. Тому /models може крутити вибух по колу,
 * а гра — програти один раз; випадковість зашита сідом при створенні.
 * Кольори підібрані під монохромний тракт: важить яскравість, не відтінок.
 */

export interface ExplosionInstance {
  group: THREE.Group
  /** t — секунди від удару */
  update(t: number): void
  /** підкид корпуса техніки в метрах (детонація БК підкидає башту з корпусом) */
  vehicleLift(t: number): number
  dispose(): void
}

export interface ExplosionVariant {
  id: string
  label: string
  hint: string
  /** повна тривалість ефекту, с */
  duration: number
  make(seed?: number): ExplosionInstance
}

type Rng = () => number

interface Piece {
  update(t: number): void
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const easeOut = (k: number) => 1 - (1 - k) * (1 - k)

function lambert(color: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0, flatShading: true })
}

function basic(color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0 })
}

// ---------------------------------------------------------------- шматки

/** Виблиск: перетримана куля, що вигорає за чверть секунди. */
function flash(group: THREE.Group, size: number, z: number): Piece {
  const mat = basic(0xffffff)
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), mat)
  mesh.position.z = z
  group.add(mesh)
  return {
    update(t) {
      const k = clamp01(t / 0.26)
      mat.opacity = t <= 0 ? 0 : 1 - k * k
      mesh.scale.setScalar(size * (0.4 + k))
    },
  }
}

/** Ударна хвиля: кільце пилу, що розбігається по землі. */
function shockRing(group: THREE.Group, radius: number): Piece {
  const mat = lambert(0x8d867a)
  mat.side = THREE.DoubleSide
  const mesh = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 24), mat)
  mesh.position.z = 0.35
  group.add(mesh)
  return {
    update(t) {
      const k = clamp01(t / 0.55)
      mat.opacity = t <= 0 ? 0 : 0.55 * (1 - k)
      mesh.scale.setScalar(2 + easeOut(k) * radius)
    },
  }
}

/** Обгоріла пляма: з'являється під технікою і вже не зникає. */
function scorch(group: THREE.Group, radius: number): Piece {
  const mat = lambert(0x161711)
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 20), mat)
  mesh.position.z = 0.12
  group.add(mesh)
  return {
    update(t) {
      mat.opacity = t <= 0 ? 0 : 0.85 * clamp01(t / 0.4)
    },
  }
}

/** Уламки: темні шматки по балістиці, падають, підстрибувати не вміють. */
function debris(group: THREE.Group, rng: Rng, count: number, power: number): Piece {
  const mat = lambert(0x201f1a)
  const items: Array<{ mesh: THREE.Mesh; v: THREE.Vector3; w: THREE.Vector3; land: number; rest: THREE.Vector3 }> = []
  for (let i = 0; i < count; i++) {
    const s = 0.14 + rng() * 0.34
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(s, s * (0.6 + rng()), s * 0.8), mat)
    const az = rng() * Math.PI * 2
    const up = 6 + rng() * 9 * power
    const out = (3 + rng() * 8) * power
    const v = new THREE.Vector3(Math.sin(az) * out, Math.cos(az) * out, up)
    // z(t) = 1.4 + up·t − 4.9·t²; приземлення на половину висоти шматка
    const land = (up + Math.sqrt(up * up + 4 * 4.9 * (1.4 - s / 2))) / (2 * 4.9)
    items.push({
      mesh,
      v,
      w: new THREE.Vector3(rng() * 9, rng() * 9, rng() * 9),
      land,
      rest: new THREE.Vector3(v.x * land, v.y * land, s / 2),
    })
    group.add(mesh)
  }
  return {
    update(t) {
      for (const d of items) {
        if (t <= 0) {
          d.mesh.visible = false
          continue
        }
        d.mesh.visible = true
        mat.opacity = 1
        const ft = Math.min(t, d.land)
        if (ft < d.land) {
          d.mesh.position.set(d.v.x * ft, d.v.y * ft, 1.4 + d.v.z * ft - 4.9 * ft * ft)
        } else {
          d.mesh.position.copy(d.rest)
        }
        d.mesh.rotation.set(d.w.x * ft, d.w.y * ft, d.w.z * ft)
      }
    },
  }
}

/** Іскри: яскраві жарини фонтаном, живуть менше секунди. */
function sparks(group: THREE.Group, rng: Rng, count: number, delay = 0, power = 1): Piece {
  const items: Array<{ mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; v: THREE.Vector3; life: number }> = []
  for (let i = 0; i < count; i++) {
    const mat = basic(0xffd9a0)
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.24), mat)
    const az = rng() * Math.PI * 2
    const out = (2 + rng() * 10) * power
    items.push({
      mesh,
      mat,
      v: new THREE.Vector3(Math.sin(az) * out, Math.cos(az) * out, (9 + rng() * 14) * power),
      life: 0.45 + rng() * 0.5,
    })
    group.add(mesh)
  }
  return {
    update(t0) {
      const t = t0 - delay
      for (const s of items) {
        if (t <= 0 || t > s.life) {
          s.mesh.visible = false
          continue
        }
        s.mesh.visible = true
        s.mat.opacity = 1 - (t / s.life) ** 2
        s.mesh.position.set(s.v.x * t, s.v.y * t, 1.5 + s.v.z * t - 4.9 * t * t)
      }
    },
  }
}

interface SmokeOpts {
  ground: number
  column: number
  /** гриб-шапка на верхівці стовпа */
  cap?: boolean
  height: number
  delay?: number
  life: number
}

/**
 * Дим: багато ДРІБНИХ клубів замість кількох куль-парашутів.
 * Нижні повзуть по землі, стовп — вервечка клубів, що піднімаються
 * з турбулентним віляням і легким зносом «вітром»; шапка — купка
 * клубів на верхівці. Кожен клуб трохи пульсує, щоб дим жив.
 */
function smoke(group: THREE.Group, rng: Rng, o: SmokeOpts): Piece {
  const windX = (rng() - 0.5) * 2.4
  const items: Array<{
    mesh: THREE.Mesh
    mat: THREE.MeshLambertMaterial
    grow: number
    rise: number
    delay: number
    x: number
    y: number
    wobble: number
    phase: number
  }> = []
  const add = (kind: 'ground' | 'column' | 'cap', i: number, n: number) => {
    const shade = kind === 'ground' ? 0x3d3b31 : kind === 'cap' ? 0x33322c : 0x2b2b26
    const mat = lambert(shade)
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 7, 5), mat)
    const spread = kind === 'ground' ? 5.2 : kind === 'cap' ? 2.6 : 1.1
    items.push({
      mesh,
      mat,
      grow: kind === 'ground' ? 1.1 + rng() * 0.8 : kind === 'cap' ? 1.3 + rng() * 0.9 : 0.8 + rng() * 0.8,
      rise:
        kind === 'ground'
          ? 0.4 + rng() * 0.8
          : kind === 'cap'
            ? o.height * (0.94 + rng() * 0.12)
            : (o.height * (i + 0.5 + rng() * 0.6)) / n,
      delay:
        (o.delay ?? 0) +
        (kind === 'ground' ? rng() * 0.25 : kind === 'cap' ? 0.85 + rng() * 0.45 : 0.1 + ((i + rng()) / n) * 1.1),
      x: (rng() - 0.5) * spread,
      y: (rng() - 0.5) * spread,
      wobble: 0.25 + rng() * 0.6,
      phase: rng() * Math.PI * 2,
    })
    group.add(mesh)
  }
  for (let i = 0; i < o.ground; i++) add('ground', i, o.ground)
  for (let i = 0; i < o.column; i++) add('column', i, o.column)
  if (o.cap) for (let i = 0; i < 5; i++) add('cap', i, 5)
  return {
    update(t) {
      for (const p of items) {
        const k = clamp01((t - p.delay) / o.life)
        if (k <= 0) {
          p.mesh.visible = false
          continue
        }
        p.mesh.visible = true
        const ease = easeOut(k)
        const pulse = 1 + 0.1 * Math.sin(p.phase + t * 5)
        p.mesh.scale.setScalar((0.25 + ease * p.grow) * pulse)
        // вище — сильніше виляє і зноситься вітром: стовп стає живим шлейфом
        const h = ease * p.rise
        const sway = p.wobble * (h / Math.max(o.height, 1))
        p.mesh.position.set(
          p.x + Math.sin(p.phase + h * 1.7) * sway + windX * ease * (h / Math.max(o.height, 1)),
          p.y + Math.cos(p.phase + h * 1.4) * sway,
          0.5 + h,
        )
        p.mat.opacity = 0.9 * (1 - Math.max(0, k - 0.85) / 0.15)
      }
    },
  }
}

/** Вогняна куля: народжується білою, гасне в жар і перетворюється на кіптяву. */
function fireball(group: THREE.Group, rng: Rng, count: number, size: number): Piece {
  const hot = new THREE.Color(0xffe9c4)
  const ember = new THREE.Color(0xff7d22)
  const soot = new THREE.Color(0x232320)
  const items: Array<{ mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; x: number; y: number; z: number; s: number }> = []
  for (let i = 0; i < count; i++) {
    const mat = basic(0xffe9c4)
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 9, 7), mat)
    items.push({
      mesh,
      mat,
      x: (rng() - 0.5) * 2.4,
      y: (rng() - 0.5) * 2.4,
      z: 1 + rng() * 1.6,
      s: size * (0.6 + rng() * 0.7),
    })
    group.add(mesh)
  }
  return {
    update(t) {
      for (const f of items) {
        if (t <= 0 || t > 1.15) {
          f.mesh.visible = false
          continue
        }
        f.mesh.visible = true
        const k = clamp01(t / 1.15)
        const c = k < 0.25 ? hot.clone().lerp(ember, k / 0.25) : ember.clone().lerp(soot, (k - 0.25) / 0.75)
        f.mat.color = c
        f.mat.opacity = 1 - Math.max(0, k - 0.7) / 0.3
        f.mesh.scale.setScalar(f.s * (0.5 + easeOut(k) * 1.3))
        f.mesh.position.set(f.x, f.y, f.z + easeOut(k) * 2.2)
      }
    },
  }
}

/** Вторинні детонації: пізні короткі спалахи з жаринами. */
function pops(group: THREE.Group, rng: Rng, times: number[]): Piece {
  const pieces = times.map((at) => {
    const f = flash(group, 2.2 + rng() * 1.2, 1.6 + rng() * 1.2)
    const s = sparks(group, rng, 12, 0, 0.7)
    return { at, f, s }
  })
  return {
    update(t) {
      for (const p of pieces) {
        p.f.update(t - p.at)
        p.s.update(t - p.at)
      }
    },
  }
}

// ---------------------------------------------------------------- варіанти

function instance(seed: number, build: (g: THREE.Group, rng: Rng) => Piece[], lift?: (t: number) => number): ExplosionInstance {
  const group = new THREE.Group()
  const pieces = build(group, makeRng(seed))
  return {
    group,
    update(t) {
      for (const p of pieces) p.update(t)
    },
    vehicleLift(t) {
      return lift ? lift(t) : 0
    },
    dispose() {
      group.parent?.remove(group)
      group.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.isMesh) {
          m.geometry.dispose()
          ;(m.material as THREE.Material).dispose()
        }
      })
    },
  }
}

export const EXPLOSION_VARIANTS: ExplosionVariant[] = [
  {
    id: 'dust',
    label: 'Dust & debris',
    hint: 'Сухий підрив: ударна хвиля, уламки, пил і стовп диму з шапкою',
    duration: 3.6,
    make: (seed = 1) =>
      instance(seed, (g, rng) => [
        flash(g, 6, 1.6),
        shockRing(g, 22),
        debris(g, rng, 12, 1),
        smoke(g, rng, { ground: 14, column: 20, cap: true, height: 9, life: 2.9 }),
        scorch(g, 4.2),
      ]),
  },
  {
    id: 'fireball',
    label: 'Fireball',
    hint: 'Паливо: вогняна куля вигорає в чорну кіптяву, жарини віялом',
    duration: 3.6,
    make: (seed = 2) =>
      instance(
        seed,
        (g, rng) => [
          flash(g, 7, 1.8),
          fireball(g, rng, 5, 2.6),
          sparks(g, rng, 26),
          shockRing(g, 18),
          debris(g, rng, 8, 0.9),
          smoke(g, rng, { ground: 10, column: 22, cap: true, height: 11, delay: 0.35, life: 2.8 }),
          scorch(g, 4.6),
        ],
        (t) => (t <= 0 ? 0 : Math.max(0, 0.35 * Math.sin(Math.min(t / 0.5, 1) * Math.PI))),
      ),
  },
  {
    id: 'cookoff',
    label: 'Ammo cook-off',
    hint: 'Детонація БК: корпус підкидає, потім серія вторинних детонацій',
    duration: 4.2,
    make: (seed = 3) =>
      instance(
        seed,
        (g, rng) => [
          flash(g, 8, 1.8),
          fireball(g, rng, 4, 2.2),
          sparks(g, rng, 34, 0, 1.25),
          shockRing(g, 26),
          debris(g, rng, 16, 1.35),
          pops(g, rng, [1.05, 1.7, 2.5]),
          smoke(g, rng, { ground: 16, column: 24, cap: true, height: 12, life: 3.4 }),
          scorch(g, 5.2),
        ],
        (t) => (t <= 0 ? 0 : Math.max(0, 0.9 * Math.sin(Math.min(t / 0.6, 1) * Math.PI)) * Math.exp(-t * 1.6)),
      ),
  },
]
