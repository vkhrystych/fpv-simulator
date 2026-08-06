import type { DroneSpec, PayloadSpec } from '../flight/types'

/**
 * RATES навмисно НЕ гоночні. Повний стік дає 110–310 °/с залежно від дрона —
 * це фристайл-діапазон, а не 500–800 °/с, як у перегонах. Причина проста:
 * ця гра про пошук і точний захід, а не про фліпи; на гоночних кривих
 * будь-який дотик стіка збиває лінію на ціль.
 *
 * Уся поведінка дрона живе тут, у даних. Новий дрон = новий об'єкт, нуль рядків коду.
 * Головні ручки «відчуття»: motorTau (в'ялість), tuneQuality (осциляції/пропвош),
 * maxThrustN vs mass (запас тяги), inertia (радіус розвороту).
 */
export const DRONES: Record<string, DroneSpec> = {
  'trainer-7': {
    id: 'trainer-7',
    label: '7" trainer',
    mass: 0.85,
    maxThrustN: 68,
    armLength: 0.15,
    inertia: [0.0075, 0.0075, 0.014],
    motorTau: 0.03,
    torqueRatio: 0.017,
    dragXY: 0.03,
    dragZ: 0.055,
    cpOffset: 0.008,
    propRadius: 0.089,
    rates: {
      roll: { rcRate: 1.0, superRate: 0.35, expo: 0.25 },
      pitch: { rcRate: 1.0, superRate: 0.35, expo: 0.25 },
      yaw: { rcRate: 0.85, superRate: 0.25, expo: 0.2 },
    },
    pid: {
      roll: { p: 0.052, i: 0.09, d: 0.0016 },
      pitch: { p: 0.056, i: 0.095, d: 0.0018 },
      yaw: { p: 0.075, i: 0.12, d: 0.0 },
    },
    tuneQuality: 1,
    battery: { cells: 6, capacityMah: 3000, internalResistance: 0.016 },
    videoLatencyMs: 90,
    camera: { fov: 130, tiltDeg: 25 },
    vtx: { rangeM: 2500 },
  },

  'light-7': {
    id: 'light-7',
    label: '7" light',
    mass: 1.05,
    maxThrustN: 72,
    armLength: 0.155,
    inertia: [0.009, 0.009, 0.017],
    motorTau: 0.042,
    torqueRatio: 0.017,
    dragXY: 0.032,
    dragZ: 0.06,
    cpOffset: 0.01,
    propRadius: 0.089,
    rates: {
      roll: { rcRate: 0.8, superRate: 0.25, expo: 0.3 },
      pitch: { rcRate: 0.8, superRate: 0.25, expo: 0.3 },
      yaw: { rcRate: 0.7, superRate: 0.2, expo: 0.25 },
    },
    pid: {
      roll: { p: 0.05, i: 0.085, d: 0.0017 },
      pitch: { p: 0.054, i: 0.09, d: 0.0019 },
      yaw: { p: 0.07, i: 0.11, d: 0.0 },
    },
    tuneQuality: 0.88,
    battery: { cells: 6, capacityMah: 4000, internalResistance: 0.017},
    videoLatencyMs: 100,
    camera: { fov: 125, tiltDeg: 28 },
    vtx: { rangeM: 3500 },
  },

  'mid-8': {
    id: 'mid-8',
    label: '8" medium',
    mass: 1.6,
    maxThrustN: 88,
    armLength: 0.185,
    inertia: [0.018, 0.018, 0.032],
    motorTau: 0.06,
    torqueRatio: 0.019,
    dragXY: 0.042,
    dragZ: 0.075,
    cpOffset: 0.012,
    propRadius: 0.102,
    rates: {
      roll: { rcRate: 0.62, superRate: 0.18, expo: 0.35 },
      pitch: { rcRate: 0.62, superRate: 0.18, expo: 0.35 },
      yaw: { rcRate: 0.6, superRate: 0.15, expo: 0.3 },
    },
    pid: {
      roll: { p: 0.055, i: 0.09, d: 0.0026 },
      pitch: { p: 0.058, i: 0.095, d: 0.0028 },
      yaw: { p: 0.075, i: 0.11, d: 0.0 },
    },
    tuneQuality: 0.8,
    battery: { cells: 6, capacityMah: 5200, internalResistance: 0.019 },
    videoLatencyMs: 110,
    camera: { fov: 120, tiltDeg: 25 },
    vtx: { rangeM: 4500 },
  },

  'heavy-10': {
    id: 'heavy-10',
    label: '10" heavy',
    mass: 2.4,
    // 140 Н — TWR ~2.9 з важким БК: інерція баржі лишилась (маса й
    // motorTau ті самі), але крейсер удвічі бадьоріший — рішення 07.08.2026,
    // бо перегін до квадрата пошуку з'їдав половину вильоту
    maxThrustN: 140,
    armLength: 0.23,
    inertia: [0.038, 0.038, 0.068],
    motorTau: 0.085,
    torqueRatio: 0.022,
    dragXY: 0.055,
    dragZ: 0.095,
    cpOffset: 0.015,
    propRadius: 0.127,
    rates: {
      roll: { rcRate: 0.5, superRate: 0.12, expo: 0.4 },
      pitch: { rcRate: 0.5, superRate: 0.12, expo: 0.4 },
      yaw: { rcRate: 0.5, superRate: 0.1, expo: 0.35 },
    },
    pid: {
      roll: { p: 0.062, i: 0.1, d: 0.0042 },
      pitch: { p: 0.065, i: 0.105, d: 0.0045 },
      yaw: { p: 0.08, i: 0.12, d: 0.0 },
    },
    tuneQuality: 0.75,
    battery: { cells: 6, capacityMah: 8000, internalResistance: 0.021},
    videoLatencyMs: 125,
    camera: { fov: 115, tiltDeg: 22 },
    vtx: { rangeM: 6000 },
  },

  'longrange-13': {
    id: 'longrange-13',
    label: '13" long-range',
    mass: 2.9,
    maxThrustN: 132,
    armLength: 0.28,
    inertia: [0.055, 0.055, 0.098],
    motorTau: 0.11,
    torqueRatio: 0.024,
    dragXY: 0.06,
    dragZ: 0.105,
    cpOffset: 0.016,
    propRadius: 0.165,
    rates: {
      roll: { rcRate: 0.45, superRate: 0.1, expo: 0.42 },
      pitch: { rcRate: 0.45, superRate: 0.1, expo: 0.42 },
      yaw: { rcRate: 0.45, superRate: 0.08, expo: 0.38 },
    },
    pid: {
      roll: { p: 0.068, i: 0.105, d: 0.0055 },
      pitch: { p: 0.071, i: 0.11, d: 0.0058 },
      yaw: { p: 0.085, i: 0.125, d: 0.0 },
    },
    tuneQuality: 0.72,
    battery: { cells: 6, capacityMah: 12000, internalResistance: 0.023 },
    videoLatencyMs: 140,
    camera: { fov: 110, tiltDeg: 20 },
    vtx: { rangeM: 9000 },
  },

  'night-8': {
    id: 'night-8',
    label: '8" night',
    mass: 1.75,
    maxThrustN: 90,
    armLength: 0.185,
    inertia: [0.019, 0.019, 0.034],
    motorTau: 0.062,
    torqueRatio: 0.019,
    dragXY: 0.044,
    dragZ: 0.078,
    cpOffset: 0.012,
    propRadius: 0.102,
    rates: {
      roll: { rcRate: 0.58, superRate: 0.16, expo: 0.38 },
      pitch: { rcRate: 0.58, superRate: 0.16, expo: 0.38 },
      yaw: { rcRate: 0.55, superRate: 0.14, expo: 0.32 },
    },
    pid: {
      roll: { p: 0.056, i: 0.092, d: 0.0027 },
      pitch: { p: 0.059, i: 0.097, d: 0.0029 },
      yaw: { p: 0.076, i: 0.112, d: 0.0 },
    },
    tuneQuality: 0.78,
    battery: { cells: 6, capacityMah: 5600, internalResistance: 0.019 },
    videoLatencyMs: 115,
    camera: { fov: 118, tiltDeg: 22, monochrome: true },
    vtx: { rangeM: 4200 },
  },
}

export const PAYLOADS: Record<string, PayloadSpec> = {
  none: {
    id: 'none',
    label: 'none',
    mass: 0,
    comOffset: 0,
    dragArea: 0,
    armDistance: 0,
  },
  light: {
    id: 'light',
    label: 'light (0.5 kg)',
    mass: 0.5,
    comOffset: 0.07,
    dragArea: 0.005,
    armDistance: 60,
  },
  medium: {
    id: 'medium',
    label: 'medium (1.2 kg)',
    mass: 1.2,
    comOffset: 0.095,
    dragArea: 0.013,
    armDistance: 100,
  },
  heavy: {
    id: 'heavy',
    label: 'heavy (2.5 kg)',
    mass: 2.5,
    comOffset: 0.125,
    dragArea: 0.022,
    armDistance: 150,
  },
  bulky: {
    id: 'bulky',
    // сенс цього БК — ПЛОЩА, а не вага: 1.35 кг лишає запас тяги
    // навіть 7-дюймовому борту, але зносить його вітром сильніше за все інше
    label: 'bulky (1.35 kg)',
    mass: 1.35,
    comOffset: 0.115,
    dragArea: 0.055,
    armDistance: 120,
  },
}

export function getDrone(id: string): DroneSpec {
  const d = DRONES[id]
  if (!d) throw new Error(`unknown drone: ${id}`)
  return d
}

export function getPayload(id: string): PayloadSpec {
  const p = PAYLOADS[id]
  if (!p) throw new Error(`unknown payload: ${id}`)
  return p
}
