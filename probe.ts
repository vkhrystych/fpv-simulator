/**
 * Тимчасова сторінка для огляду моделей у реальному світі рівня, без польоту:
 * ставить камеру куди скажуть і малює один кадр. Використовується скріншотами
 * з Playwright під час зміни геометрії.
 */
import * as THREE from 'three'
import { createSession } from './src/game/session'
import type { ReplayFrame } from './src/game/replay'
import { getLevel } from './src/level/levels'
import { World } from './src/render/world'
import { ReplayView } from './src/render/replay'
import { VehicleRenderer } from './src/render/vehicles'
import { VideoFeed } from './src/render/video'
import type { PropKind } from './src/level/props'

const params = new URLSearchParams(location.search)
const level = getLevel(params.get('level') ?? 'l1-first-flight')
const session = createSession(level, 0)
const world = new World(session.terrain, level, session.props)
const vehicles = new VehicleRenderer(world.scene, session.mission.targets)
vehicles.update(session.mission.targets)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(1280, 720, false)
renderer.domElement.width = 1280
renderer.domElement.height = 720
document.body.appendChild(renderer.domElement)

const camera = new THREE.PerspectiveCamera(70, 1280 / 720, 0.1, 4000)
camera.up.set(0, 0, 1)

type Triple = [number, number, number]

const api = {
  look(from: Triple, at: Triple) {
    camera.position.set(from[0], from[1], from[2])
    camera.lookAt(at[0], at[1], at[2])
    renderer.render(world.scene, camera)
  },
  /** Облетіти об'єкт: dist — по горизонталі, up — перевищення. */
  orbit(at: Triple, dist: number, up: number, yaw = 0.6) {
    api.look([at[0] + Math.sin(yaw) * dist, at[1] - Math.cos(yaw) * dist, at[2] + up], at)
  },
  targets: session.mission.targets.map((t) => ({
    id: t.spec.id,
    kind: t.spec.kind,
    vehicle: t.spec.vehicle,
    at: [t.position.x, t.position.y, t.position.z] as Triple,
  })),
  prop(kind: PropKind, index = 0) {
    const p = session.props.ofKind(kind)[index]
    return { at: [p.x, p.y, p.groundZ] as Triple, height: p.height, halfW: p.halfW, halfL: p.halfL }
  },
  drawCalls: () => renderer.info.render.calls,

  /**
   * Повтор ураження на синтетичному заході: перемотує до моменту t (с)
   * і малює один кадр через ЧБ-тракт. Підліт ~3.4 с, далі вибух і дим.
   */
  replayDemo(t: number) {
    replayView?.dispose()
    const target = session.mission.targets[0]
    const impact = target.aimPoint
    const az = 0.9
    const frames: ReplayFrame[] = []
    for (let ft = 0; ft <= 3.4; ft += 1 / 30) {
      const k = ft / 3.4
      frames.push({
        t: ft,
        drone: {
          p: {
            x: impact.x - Math.sin(az) * 95 * (1 - k),
            y: impact.y - Math.cos(az) * 95 * (1 - k),
            z: impact.z + 1 + 30 * (1 - k) ** 1.3,
          },
          q: { x: 0, y: 0, z: 0, w: 1 },
        },
        targets: session.mission.targets.map((tg) => ({
          id: tg.spec.id,
          x: tg.position.x,
          y: tg.position.y,
          z: tg.position.z,
          heading: tg.heading,
          destroyed: false,
        })),
      })
    }
    replayView = new ReplayView(world.scene, vehicles, frames, impact, target.spec.id, 1280 / 720)
    replayVideo ??= new VideoFeed(renderer, 1280, 720, true)
    for (let time = 0; time < t; time += 1 / 60) replayView.update(1 / 60)
    replayVideo.render(world.scene, replayView.camera, 1 / 60, replayView.signal)
  },
}

let replayView: ReplayView | null = null
let replayVideo: VideoFeed | null = null

;(window as unknown as { probe: typeof api }).probe = api
api.orbit(api.targets[0].at, 22, 7)
