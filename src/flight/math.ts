/**
 * Мінімальна math-бібліотека для flight-ядра.
 * flight/ НЕ імпортує three.js — це дозволяє тестувати фізику в node без WebGL.
 * Конвенція осей тіла: X = вправо, Y = вперед, Z = вгору.
 */

export type Vec3 = { x: number; y: number; z: number }
export type Quat = { x: number; y: number; z: number; w: number }

export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z })
export const vclone = (a: Vec3): Vec3 => ({ x: a.x, y: a.y, z: a.z })
export const vadd = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
export const vsub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
export const vscale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s })
export const vdot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z
export const vlen = (a: Vec3): number => Math.sqrt(vdot(a, a))

export const vcross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
})

export function vnorm(a: Vec3): Vec3 {
  const l = vlen(a)
  return l < 1e-9 ? v3() : vscale(a, 1 / l)
}

export const quatIdentity = (): Quat => ({ x: 0, y: 0, z: 0, w: 1 })

export function qmul(a: Quat, b: Quat): Quat {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  }
}

export function qnormalize(q: Quat): Quat {
  const l = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w)
  if (l < 1e-9) return quatIdentity()
  return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l }
}

export const qconj = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w })

/** Повертає вектор кватерніоном: v' = q * v * q⁻¹ (тіло → світ). */
export function qrotate(q: Quat, v: Vec3): Vec3 {
  const t = vscale(vcross({ x: q.x, y: q.y, z: q.z }, v), 2)
  return vadd(vadd(v, vscale(t, q.w)), vcross({ x: q.x, y: q.y, z: q.z }, t))
}

/** Світ → тіло. */
export const qrotateInv = (q: Quat, v: Vec3): Vec3 => qrotate(qconj(q), v)

export function qFromAxisAngle(axis: Vec3, angle: number): Quat {
  const a = vnorm(axis)
  const h = angle * 0.5
  const s = Math.sin(h)
  return { x: a.x * s, y: a.y * s, z: a.z * s, w: Math.cos(h) }
}

/**
 * Інтегрує кватерніон кутовою швидкістю тіла (rad/s) за dt.
 * Використовує точний exp-map, а не лінійне наближення — стабільно на високих ω.
 */
export function qIntegrate(q: Quat, omegaBody: Vec3, dt: number): Quat {
  const theta = vlen(omegaBody) * dt
  if (theta < 1e-9) return q
  const dq = qFromAxisAngle(omegaBody, theta)
  return qnormalize(qmul(q, dq))
}

/**
 * Кути Ейлера (rad) з кватерніона у конвенції X=right, Y=forward, Z=up.
 * yaw — КУРС за годинниковою від півночі (+y), як на компасі: доворот управо
 * збільшує yaw. Не математичний кут проти годинникової — інакше і OSD, і будь-яке
 * наведення на ціль отримають протилежний знак.
 */
export function quatToEuler(q: Quat): { pitch: number; roll: number; yaw: number } {
  const fwd = qrotate(q, v3(0, 1, 0))
  const right = qrotate(q, v3(1, 0, 0))
  const pitch = Math.asin(clamp(fwd.z, -1, 1))
  const yaw = Math.atan2(fwd.x, fwd.y)
  const roll = Math.atan2(-right.z, Math.sqrt(Math.max(1e-12, right.x * right.x + right.y * right.y)))
  return { pitch, roll, yaw }
}

export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x)
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/** Коефіцієнт згладжування першого порядку для кроку dt і сталої часу tau. */
export const smoothing = (dt: number, tau: number): number => (tau <= 1e-6 ? 1 : 1 - Math.exp(-dt / tau))

/** Детермінований PRNG (mulberry32) — фізика має бути відтворюваною. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
