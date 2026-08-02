import { Drone, PHYSICS_DT } from '../src/flight/drone'
import { getDrone, getPayload } from '../src/drones'
import { defaultEnvironment, neutralInput, type ControlInput, type Environment } from '../src/flight/types'
import { radToDeg } from '../src/flight/rates'
import { qrotate, v3 } from '../src/flight/math'
import { AngleController } from '../src/flight/angle'

export function makeDrone(droneId = 'trainer-7', payloadId = 'none', env?: Partial<Environment>): Drone {
  const d = new Drone(getDrone(droneId), getPayload(payloadId), { ...defaultEnvironment(), ...env })
  d.reset(v3(0, 0, 50))
  return d
}

export const hoverInput = (drone: Drone, over: Partial<ControlInput> = {}): ControlInput => ({
  ...neutralInput(),
  armed: true,
  throttle: drone.hoverThrottle,
  ...over,
})

/** Проганяє N секунд фізики фіксованим кроком. Повертає кількість кроків. */
export function simulate(
  drone: Drone,
  seconds: number,
  input: ControlInput | ((t: number, d: Drone) => ControlInput),
  onStep?: (d: Drone) => void,
): number {
  const steps = Math.round(seconds / PHYSICS_DT)
  for (let i = 0; i < steps; i++) {
    const inp = typeof input === 'function' ? input(i * PHYSICS_DT, drone) : input
    drone.step(inp, PHYSICS_DT)
    onStep?.(drone)
  }
  return steps
}

/** Крен/тангаж/рискання у град/с — зручніше читати в тестах. */
export const ratesDeg = (drone: Drone) => ({
  pitch: radToDeg(drone.state.angularVelocity.x),
  roll: radToDeg(drone.state.angularVelocity.y),
  yaw: radToDeg(-drone.state.angularVelocity.z),
})

/**
 * Автоматичне утримання висоти простим P-регулятором по вертикальній швидкості.
 * Потрібне, щоб тестувати горизонтальну поведінку, не воюючи з газом вручну.
 */
export function altitudeHold(drone: Drone, targetAlt: number, over: Partial<ControlInput> = {}): ControlInput {
  const err = targetAlt - drone.state.position.z
  const desiredVz = Math.max(-4, Math.min(4, err * 1.2))
  const vzErr = desiredVz - drone.state.velocity.z
  // компенсуємо і просадку акумулятора, і нахил (при крені вертикальна складова падає)
  const up = qrotate(drone.state.orientation, v3(0, 0, 1)).z
  const tiltComp = 1 / Math.max(up, 0.35)
  const base = drone.hoverThrottle * tiltComp * Math.min(1.6, 1 / Math.max(drone.battery.voltageRatio, 0.6))
  return {
    ...neutralInput(),
    armed: true,
    throttle: Math.max(0, Math.min(1, base + vzErr * 0.12)),
    ...over,
  }
}

/**
 * Політ із заданим нахилом (ANGLE) + утримання висоти.
 * Так тестуємо горизонтальну динаміку: у ACRO утримання стіка — це безперервне обертання.
 */
export function tiltFlight(
  drone: Drone,
  ctrl: AngleController,
  targetAlt: number,
  tiltPitch: number,
  tiltRoll = 0,
): ControlInput {
  return ctrl.apply(drone, altitudeHold(drone, targetAlt), tiltPitch, tiltRoll)
}

export const angleCtrl = (drone: Drone, maxTilt = 35): AngleController =>
  new AngleController(drone.spec, maxTilt)
