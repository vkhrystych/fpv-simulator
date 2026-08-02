import {
  clamp,
  qIntegrate,
  qrotate,
  qrotateInv,
  quatIdentity,
  v3,
  vadd,
  vlen,
  vscale,
  vsub,
  type Vec3,
} from './math'
import { dragForceBody, propwashTorque, windAt } from './aero'
import { Battery } from './battery'
import { groundEffect, mix, motorThrust, stepMotors, thrustCoefficient } from './motors'
import { RateController } from './pid'
import { applyRates, degToRad } from './rates'
import {
  MOTOR_LAYOUT,
  NO_PAYLOAD,
  defaultEnvironment,
  type ControlInput,
  type DroneSpec,
  type DroneState,
  type Environment,
  type PayloadSpec,
} from './types'

/** Фіксований крок фізики. Ніяких deltaTime у формулах сил. */
export const PHYSICS_DT = 1 / 500
const MAX_SUBSTEPS = 40
/** Вертикальна швидкість удару, вище якої це вже не посадка, а падіння. */
export const CRASH_SPEED = 6

export interface FlightTelemetry {
  motorCommands: number[]
  thrustN: number
  altitude: number
  speed: number
  verticalSpeed: number
  current: number
  saturation: number
  armDistanceOk: boolean
}

export class Drone {
  readonly state: DroneState
  readonly telemetry: FlightTelemetry = {
    motorCommands: [0, 0, 0, 0],
    thrustN: 0,
    altitude: 0,
    speed: 0,
    verticalSpeed: 0,
    current: 0,
    saturation: 0,
    armDistanceOk: false,
  }

  readonly battery: Battery
  private controller: RateController
  private kT: number
  private kQ: number
  private accumulator = 0
  private launchPoint: Vec3
  /** переюзаний буфер тяг, щоб не смітити в 500-Гц лупі */
  private thrustScratch = [0, 0, 0, 0]

  /** сумарна маса з навантаженням, кг */
  totalMass: number
  /** зсув центру мас униз від площини моторів, м (>= 0) */
  comShift: number
  private inertia: Vec3
  private dragXY: number
  private dragZ: number
  private cpBelowCom: number

  constructor(
    readonly spec: DroneSpec,
    public payload: PayloadSpec = NO_PAYLOAD,
    public env: Environment = defaultEnvironment(),
  ) {
    this.battery = new Battery(spec.battery, spec.propRadius, env.airDensity)
    this.controller = new RateController(spec.pid, spec.tuneQuality)
    this.kT = thrustCoefficient(spec)
    this.kQ = this.kT * spec.torqueRatio
    this.totalMass = spec.mass + payload.mass
    this.comShift = 0
    this.inertia = v3(...spec.inertia)
    this.dragXY = spec.dragXY
    this.dragZ = spec.dragZ
    this.cpBelowCom = spec.cpOffset
    this.state = {
      position: v3(),
      velocity: v3(),
      orientation: quatIdentity(),
      angularVelocity: v3(),
      motorRpm: [0, 0, 0, 0],
      batteryMahUsed: 0,
      batteryVoltage: spec.battery.cells * 4.2,
      time: 0,
      crashed: false,
      landed: true,
    }
    this.launchPoint = v3()
    this.recomputeMassProperties()
  }

  setPayload(payload: PayloadSpec): void {
    this.payload = payload
    this.recomputeMassProperties()
  }

  /**
   * Уся «фізика навантаження» зводиться сюди: маса, зміщення ЦМ, інерція, площа.
   * Саме тому новий дрон/БК — це JSON, а не код.
   */
  private recomputeMassProperties(): void {
    const md = this.spec.mass
    const mp = this.payload.mass
    const m = md + mp
    this.totalMass = m

    // ЦМ опускається до навантаження
    this.comShift = m > 0 ? (mp * this.payload.comOffset) / m : 0

    // теорема Штейнера: обидві маси віддаляються від нового ЦМ
    const dPayload = this.payload.comOffset - this.comShift
    const extra = mp * dPayload * dPayload + md * this.comShift * this.comShift
    this.inertia = {
      x: this.spec.inertia[0] + extra,
      y: this.spec.inertia[1] + extra,
      z: this.spec.inertia[2], // yaw не страждає — маса лишається на осі
    }

    this.dragXY = this.spec.dragXY + this.payload.dragArea
    this.dragZ = this.spec.dragZ + this.payload.dragArea * 0.35

    // центр тиску: середньозважений по площах, потім відносно нового ЦМ
    const totalArea = this.dragXY
    const cpDepth =
      totalArea > 0
        ? (this.spec.dragXY * this.spec.cpOffset + this.payload.dragArea * this.payload.comOffset) /
          totalArea
        : this.spec.cpOffset
    this.cpBelowCom = cpDepth - this.comShift
  }

  get thrustToWeight(): number {
    return this.spec.maxThrustN / (this.totalMass * this.env.gravity)
  }

  /** Газ, потрібний для зависання (приблизно, без урахування просадки). */
  get hoverThrottle(): number {
    return clamp(Math.sqrt(1 / Math.max(this.thrustToWeight, 1e-6)), 0, 1)
  }

  get distanceFromLaunch(): number {
    return vlen(vsub(this.state.position, this.launchPoint))
  }

  reset(position: Vec3 = v3(), yaw = 0): void {
    const s = this.state
    s.position = { ...position }
    s.velocity = v3()
    s.orientation = { x: 0, y: 0, z: Math.sin(-yaw / 2), w: Math.cos(-yaw / 2) }
    s.angularVelocity = v3()
    s.motorRpm = [0, 0, 0, 0]
    s.time = 0
    s.crashed = false
    s.landed = true
    this.battery.reset()
    this.controller.reset()
    this.accumulator = 0
    this.launchPoint = { ...position }
  }

  /** Реальний кадр змінної тривалості → фіксовані субкроки. */
  update(input: ControlInput, frameDt: number): void {
    this.accumulator += Math.min(frameDt, 0.25)
    let steps = 0
    while (this.accumulator >= PHYSICS_DT && steps < MAX_SUBSTEPS) {
      this.step(input, PHYSICS_DT)
      this.accumulator -= PHYSICS_DT
      steps++
    }
    if (steps >= MAX_SUBSTEPS) this.accumulator = 0
  }

  /** Один крок фіксованої фізики. */
  step(input: ControlInput, dt: number = PHYSICS_DT): void {
    const s = this.state
    if (s.crashed) return

    s.time += dt

    // 1. Стіки → цільова кутова швидкість (rad/s у системі тіла)
    const wantPitch = degToRad(applyRates(input.pitch, this.spec.rates.pitch))
    const wantRoll = degToRad(applyRates(input.roll, this.spec.rates.roll))
    const wantYaw = degToRad(applyRates(input.yaw, this.spec.rates.yaw))
    const setpoint = v3(wantPitch, wantRoll, -wantYaw)

    // 2. PID на кутовій швидкості
    const armed = input.armed && !this.battery.empty
    const pitchOut = armed ? this.controller.pitch.update(setpoint.x, s.angularVelocity.x, dt) : 0
    const rollOut = armed ? this.controller.roll.update(setpoint.y, s.angularVelocity.y, dt) : 0
    const yawOut = armed ? this.controller.yaw.update(setpoint.z, s.angularVelocity.z, dt) : 0

    // 3. Мікшер (yaw-команду вертаємо в пілотську конвенцію: + = вправо)
    const throttle = armed ? clamp(input.throttle, 0, 1) : 0
    const m = mix(throttle, rollOut, pitchOut, -yawOut)
    this.telemetry.motorCommands = m.commands
    this.telemetry.saturation = m.saturation

    // 4. Мотори (просадка минулого кроку задає стелю обертів)
    stepMotors(s.motorRpm, m.commands, this.spec, this.battery.voltageRatio, dt)

    // 5. Сили та моменти в системі тіла
    const ground = this.env.groundHeight(s.position.x, s.position.y)
    const altitude = s.position.z - ground
    const ge = groundEffect(altitude, this.spec.propRadius)

    const L = this.spec.armLength
    let totalThrust = 0
    let tauX = 0
    let tauY = 0
    let tauZ = 0
    const thrusts = this.thrustScratch

    for (let i = 0; i < 4; i++) {
      const T = motorThrust(s.motorRpm[i], this.kT) * ge
      thrusts[i] = T
      totalThrust += T
      const lay = MOTOR_LAYOUT[i]
      // τ = r × F, r = (x·L, y·L, comShift), F = (0, 0, T).
      // Вертикальне плече в цьому добутку скорочується — маятник дає не тяга,
      // а опір, прикладений нижче ЦМ (див. нижче).
      tauX += lay.y * L * T
      tauY += -lay.x * L * T
      // реактивний момент гвинта: CW-мотор (spin=+1) закручує раму в +Z
      tauZ += lay.spin * this.kQ * s.motorRpm[i] * s.motorRpm[i]
    }
    this.telemetry.thrustN = totalThrust

    // 6. Батарея — від реальної тяги, а не від обертів
    this.battery.step(thrusts, dt)
    s.batteryMahUsed = this.battery.mahUsed
    s.batteryVoltage = this.battery.voltage
    this.telemetry.current = this.battery.current

    const forceBody = v3(0, 0, totalThrust)

    // 7. Аеродинаміка відносно повітря
    const wind = windAt(this.env, altitude, s.time)
    const airRel = vsub(s.velocity, wind)
    const velBody = qrotateInv(s.orientation, airRel)
    const drag = dragForceBody(velBody, this.dragXY, this.dragZ, this.env.airDensity)
    forceBody.x += drag.x
    forceBody.y += drag.y
    forceBody.z += drag.z

    // опір діє нижче ЦМ → маятник: r_cp × F, r_cp = (0, 0, −cpBelowCom)
    const zcp = -this.cpBelowCom
    tauX += -zcp * drag.y
    tauY += zcp * drag.x

    // 8. Пропвош на спуску
    const pw = propwashTorque(airRel.z, throttle, this.spec.tuneQuality, s.time)
    tauX += pw.x
    tauY += pw.y
    tauZ += pw.z

    // 9. Кутове прискорення (з гіроскопічним членом жорсткого тіла)
    const w = s.angularVelocity
    const I = this.inertia
    const alpha = v3(
      (tauX - (I.z - I.y) * w.y * w.z) / I.x,
      (tauY - (I.x - I.z) * w.z * w.x) / I.y,
      (tauZ - (I.y - I.x) * w.x * w.y) / I.z,
    )
    s.angularVelocity = vadd(w, vscale(alpha, dt))
    s.orientation = qIntegrate(s.orientation, s.angularVelocity, dt)

    // 10. Лінійна динаміка
    const forceWorld = qrotate(s.orientation, forceBody)
    const accel = vadd(vscale(forceWorld, 1 / this.totalMass), v3(0, 0, -this.env.gravity))
    s.velocity = vadd(s.velocity, vscale(accel, dt))
    s.position = vadd(s.position, vscale(s.velocity, dt))

    this.resolveGround(armed)

    this.telemetry.altitude = s.position.z - this.env.groundHeight(s.position.x, s.position.y)
    this.telemetry.speed = vlen(s.velocity)
    this.telemetry.verticalSpeed = s.velocity.z
    this.telemetry.armDistanceOk = this.distanceFromLaunch >= this.payload.armDistance
  }

  /** Земля: м'який контакт = стоїмо, жорсткий = краш. */
  private resolveGround(armed: boolean): void {
    const s = this.state
    const ground = this.env.groundHeight(s.position.x, s.position.y)
    const skid = this.spec.armLength * 0.5 + this.payload.comOffset
    if (s.position.z - skid > ground) {
      s.landed = false
      return
    }

    const impact = -s.velocity.z
    const lateral = Math.hypot(s.velocity.x, s.velocity.y)
    if (impact > CRASH_SPEED || lateral > CRASH_SPEED * 1.5) {
      s.crashed = true
      s.velocity = v3()
      s.angularVelocity = v3()
      return
    }

    s.position.z = ground + skid
    s.velocity.z = Math.max(0, s.velocity.z)
    // тертя об траву
    s.velocity.x *= 0.82
    s.velocity.y *= 0.82
    if (!armed) {
      s.angularVelocity = vscale(s.angularVelocity, 0.5)
    }
    s.landed = true
  }
}
