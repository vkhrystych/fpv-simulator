import { Drone } from '../flight/drone'
import { v3, type Vec3 } from '../flight/math'
import { degToRad } from '../flight/rates'
import { defaultEnvironment, type Environment } from '../flight/types'
import { getDrone, getPayload } from '../drones'
import { Terrain } from '../level/terrain'
import { PropField, type Exclusion } from '../level/props'
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
  props: PropField
  drone: Drone
  mission: Mission
  env: Environment
}

/**
 * Місця, де ставити перешкоди не можна: точки зльоту й уся смуга маршрутів.
 * Інакше ціль може опинитись усередині ферми, а дрон — злетіти в кущ,
 * і рівень стане непроходимим не з вини пілота.
 */
export function clearZones(level: LevelSpec): Exclusion[] {
  const zones: Exclusion[] = [{ x: level.launch.x, y: level.launch.y, radius: 45 }]

  for (const sortie of level.sorties) {
    if (sortie.launch) zones.push({ x: sortie.launch.x, y: sortie.launch.y, radius: 45 })
  }

  for (const t of level.targets) {
    if (t.position) zones.push({ x: t.position[0], y: t.position[1], radius: 26 })
    if (!t.route) continue
    const pts = t.route.points
    for (let i = 0; i < pts.length; i++) {
      zones.push({ x: pts[i][0], y: pts[i][1], radius: 26 })
      // проміжні точки вздовж відрізка — коридор має бути чистим цілком
      const next = pts[(i + 1) % pts.length]
      if (!t.route.loop && i === pts.length - 1) break
      const steps = Math.ceil(Math.hypot(next[0] - pts[i][0], next[1] - pts[i][1]) / 30)
      for (let s = 1; s < steps; s++) {
        zones.push({
          x: pts[i][0] + ((next[0] - pts[i][0]) * s) / steps,
          y: pts[i][1] + ((next[1] - pts[i][1]) * s) / steps,
          radius: 20,
        })
      }
    }
  }
  return zones
}

/** Збирає повний виліт із самих даних рівня. */
export function createSession(level: LevelSpec, sortieIndex = 0): Session {
  const terrain = new Terrain(level.terrain)
  const env: Environment = {
    ...defaultEnvironment(),
    wind: windVector(level.weather),
    gustStrength: level.weather.gustStrength,
    turbulence: level.weather.turbulence,
    groundHeight: (x, y) => terrain.height(x, y),
  }

  const props = new PropField(terrain, { exclusions: clearZones(level) })
  const drone = new Drone(getDrone(level.droneId), getPayload(level.payloadId), env)
  // виліт може стартувати з іншої точки — так цілі рознесені по різних кутах карти
  const { x, y, headingDeg } = level.sorties[sortieIndex]?.launch ?? level.launch
  const skid = drone.spec.armLength * 0.5 + drone.payload.comOffset
  drone.reset(v3(x, y, terrain.height(x, y) + skid), degToRad(headingDeg))

  return {
    level,
    terrain,
    props,
    drone,
    mission: new Mission(level, terrain, drone, sortieIndex, props),
    env,
  }
}
