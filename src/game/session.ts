import { Drone } from '../flight/drone'
import { v3, type Vec3 } from '../flight/math'
import { degToRad } from '../flight/rates'
import { defaultEnvironment, type Environment } from '../flight/types'
import { getDrone, getPayload } from '../drones'
import { Terrain } from '../level/terrain'
import type { LevelSpec, WeatherSpec } from '../level/types'
import { Mission } from './mission'

/** Вітер дме З напрямку windFromDeg (0 = з півночі), тому вектор протилежний. */
export function windVector(weather: WeatherSpec): Vec3 {
  const a = degToRad(weather.windFromDeg)
  return v3(-Math.sin(a) * weather.windSpeed, -Math.cos(a) * weather.windSpeed, 0)
}

export interface Session {
  level: LevelSpec
  terrain: Terrain
  drone: Drone
  mission: Mission
  env: Environment
}

/** Збирає повний виліт із самих даних рівня. */
export function createSession(level: LevelSpec): Session {
  const terrain = new Terrain(level.terrain)
  const env: Environment = {
    ...defaultEnvironment(),
    wind: windVector(level.weather),
    gustStrength: level.weather.gustStrength,
    turbulence: level.weather.turbulence,
    groundHeight: (x, y) => terrain.height(x, y),
  }

  const drone = new Drone(getDrone(level.droneId), getPayload(level.payloadId), env)
  const { x, y, headingDeg } = level.launch
  const skid = drone.spec.armLength * 0.5 + drone.payload.comOffset
  drone.reset(v3(x, y, terrain.height(x, y) + skid), degToRad(headingDeg))

  return { level, terrain, drone, mission: new Mission(level, terrain, drone), env }
}
