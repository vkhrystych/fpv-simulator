import type { Vec3, Quat } from './math'

/** Вхід від пілота. Конвенція: roll+ = вправо, pitch+ = ніс вгору, yaw+ = ніс вправо. */
export interface ControlInput {
  roll: number // [-1, 1]
  pitch: number // [-1, 1]
  yaw: number // [-1, 1]
  throttle: number // [0, 1]
  armed: boolean
}

export const neutralInput = (): ControlInput => ({
  roll: 0,
  pitch: 0,
  yaw: 0,
  throttle: 0,
  armed: false,
})

/** RC-крива у стилі Betaflight. */
export interface RateCurve {
  rcRate: number
  superRate: number
  expo: number
}

export interface PidGains {
  p: number
  i: number
  d: number
}

/**
 * Навантаження. Три числа, які роблять кожен рівень іншим на дотик:
 *  mass      — з'їдає запас тяги;
 *  comOffset — опускає центр мас → маятник, «залипання» після стіка;
 *  dragArea  — ріже максималку і збільшує знос вітром.
 */
export interface PayloadSpec {
  id: string
  label: string
  mass: number // кг
  comOffset: number // м, униз від площини моторів
  dragArea: number // м², додаткова площа
  armDistance: number // м від точки зльоту до зведення
}

export const NO_PAYLOAD: PayloadSpec = {
  id: 'none',
  label: 'без навантаження',
  mass: 0,
  comOffset: 0,
  dragArea: 0,
  armDistance: 0,
}

export interface DroneSpec {
  id: string
  label: string
  /** суха маса без навантаження, кг */
  mass: number
  /** сумарна тяга всіх 4 моторів при номінальній напрузі, Н */
  maxThrustN: number
  /** довжина променя від центру до мотора, м */
  armLength: number
  /** діагональний тензор інерції сухого дрона, кг·м² */
  inertia: [number, number, number]
  /** стала часу розгону мотора, с — головне джерело «в'ялості» */
  motorTau: number
  /** відношення реактивного моменту до тяги, м (yaw-авторитет) */
  torqueRatio: number
  /** аеродинаміка: коефіцієнти Cd*A по осях тіла, м² */
  dragXY: number
  dragZ: number
  /** висота центру тиску нижче площини моторів, м */
  cpOffset: number
  /** радіус пропелера, м — для ground effect */
  propRadius: number
  rates: { roll: RateCurve; pitch: RateCurve; yaw: RateCurve }
  pid: { roll: PidGains; pitch: PidGains; yaw: PidGains }
  /** 0..1, якість тюну: 1 = чистий, <1 = осциляції та пропвош */
  tuneQuality: number
  battery: {
    cells: number
    capacityMah: number
    internalResistance: number // Ом сумарний
  }
  /** мс затримки відеотракту */
  videoLatencyMs: number
  camera: { fov: number; tiltDeg: number; monochrome?: boolean }
  vtx: { rangeM: number }
}

export interface MotorLayout {
  /** позиція у площині моторів, нормовані ±1 (множаться на armLength) */
  x: number
  y: number
  /** +1 = за годинниковою (вид зверху), -1 = проти */
  spin: 1 | -1
}

/** X-конфігурація. Діагональні пари обертаються в один бік. */
export const MOTOR_LAYOUT: MotorLayout[] = [
  { x: +1, y: +1, spin: -1 }, // 1 front-right
  { x: +1, y: -1, spin: +1 }, // 2 rear-right
  { x: -1, y: -1, spin: -1 }, // 3 rear-left
  { x: -1, y: +1, spin: +1 }, // 4 front-left
]

export interface DroneState {
  position: Vec3
  velocity: Vec3
  orientation: Quat
  angularVelocity: Vec3 // rad/s у системі тіла
  motorRpm: number[]
  batteryMahUsed: number
  batteryVoltage: number
  /** накопичений час польоту, с */
  time: number
  crashed: boolean
  landed: boolean
}

export interface Environment {
  gravity: number
  airDensity: number
  wind: Vec3 // сталий вітер, м/с (світові координати)
  gustStrength: number
  turbulence: number
  /** висота землі у точці (x, y); за замовчуванням 0 */
  groundHeight: (x: number, y: number) => number
}

export const defaultEnvironment = (): Environment => ({
  gravity: 9.81,
  airDensity: 1.225,
  wind: { x: 0, y: 0, z: 0 },
  gustStrength: 0,
  turbulence: 0,
  groundHeight: () => 0,
})
