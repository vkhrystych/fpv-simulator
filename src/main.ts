import * as THREE from 'three'
import { InputManager } from './core/input'
import { FlightAudio } from './core/audio'
import { createSession, type Session } from './game/session'
import { LEVELS } from './level/levels'
import { World } from './render/world'
import { FpvCamera } from './render/camera'
import { VideoFeed } from './render/video'
import { VehicleRenderer } from './render/vehicles'
import { Osd } from './ui/osd'
import { Briefing } from './ui/briefing'
import { Debrief } from './ui/debrief'
import { LevelSelect } from './ui/levelselect'
import { Tutorial } from './ui/tutorial'
import { Progress } from './game/progress'
import { AngleController } from './flight/angle'
import { qrotate, v3 } from './flight/math'
import type { MissionResult } from './game/mission'

const app = document.getElementById('app')!
const canvas = document.getElementById('view') as HTMLCanvasElement

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))

const input = new InputManager()
const audio = new FlightAudio()
const osd = new Osd(app)
const briefing = new Briefing(app)
const debrief = new Debrief(app)
const levelSelect = new LevelSelect(app)
const tutorial = new Tutorial(app)
const progress = new Progress()

interface Runtime {
  session: Session
  world: World
  camera: FpvCamera
  video: VideoFeed
  vehicles: VehicleRenderer
  angle?: AngleController
}

let runtime: Runtime | null = null
let levelIndex = 0
/** індекс поточного вильоту в межах рівня; провал відкидає на нуль */
let sortieIndex = 0
let finished: MissionResult | null = null
let lastTime = performance.now()

function sizeOf(): [number, number] {
  return [Math.max(1, innerWidth), Math.max(1, innerHeight)]
}

/** Екран кампанії: що пройдено, що відкрито, звідки продовжити. */
function showCampaign(): void {
  briefing.hide()
  debrief.hide()
  tutorial.hide()
  osd.root.classList.add('hidden')
  levelSelect.show(
    progress,
    (level) => loadSortie(LEVELS.indexOf(level), level.id === progress.resumeLevelId ? progress.resumeSortieIndex : 0),
    () => {
      progress.reset()
      showCampaign()
    },
    () => showTutorial(false),
  )
}

/** Пояснення керування: автоматично при першому запуску, далі — за кнопкою. */
function showTutorial(firstRun: boolean): void {
  levelSelect.hide()
  briefing.hide()
  debrief.hide()
  osd.root.classList.add('hidden')
  tutorial.show(() => {
    progress.markTutorialSeen()
    showCampaign()
  }, firstRun)
}

/** Показує брифінг конкретного вильоту рівня. */
function loadSortie(index: number, sortie = 0): void {
  levelSelect.hide()
  levelIndex = Math.min(Math.max(index, 0), LEVELS.length - 1)
  const level = LEVELS[levelIndex]
  sortieIndex = Math.min(Math.max(sortie, 0), level.sorties.length - 1)
  progress.setCurrent(level.id, sortieIndex)
  briefing.show(
    level,
    createSession(level, sortieIndex).terrain,
    () => startFlight(level),
    sortieIndex,
    showCampaign,
  )
  osd.root.classList.add('hidden')
}

function startFlight(level: (typeof LEVELS)[number]): void {
  runtime?.video.dispose()
  runtime?.vehicles.dispose()

  const session = createSession(level, sortieIndex)
  const [w, h] = sizeOf()
  renderer.setSize(w, h, false)

  const world = new World(session.terrain, level, session.props)
  const camera = new FpvCamera(session.drone, w / h)
  const video = new VideoFeed(renderer, w, h, !!session.drone.spec.camera.monochrome)
  const vehicles = new VehicleRenderer(world.scene, session.mission.targets)

  runtime = {
    session,
    world,
    camera,
    video,
    vehicles,
    angle: level.allowAngleMode ? new AngleController(session.drone.spec, 45) : undefined,
  }

  // dev-хук: дозволяє з консолі телепортувати дрон і оглядати сцену
  if (import.meta.env.DEV) {
    ;(window as unknown as Record<string, unknown>).fpv = { session, world, camera, input }
  }

  finished = null
  input.reset()
  audio.start()
  osd.root.classList.remove('hidden')
  lastTime = performance.now()
}

/** Провал будь-якого вильоту повертає рівень до першого. */
function restartLevel(): void {
  sortieIndex = 0
  startFlight(LEVELS[levelIndex])
}

function onResize(): void {
  if (!runtime) return
  const [w, h] = sizeOf()
  renderer.setSize(w, h, false)
  runtime.camera.setAspect(w / h)
  runtime.video.setSize(w, h)
}
addEventListener('resize', onResize)

function frame(now: number): void {
  requestAnimationFrame(frame)
  const dt = Math.min(0.05, (now - lastTime) / 1000)
  lastTime = now
  if (!runtime) return

  const { session, world, camera, video, vehicles } = runtime
  const { drone, mission } = session

  if (input.menuRequested) {
    runtime = null
    showCampaign()
    return
  }

  if (input.restartRequested) {
    restartLevel()
    return
  }

  if (!finished) {
    // Газ, до якого повертається клавіатура в нейтралі: зависання з поправкою
    // на нахил (при крені вертикальна складова тяги падає як cos). На землі
    // асисту немає — зліт з трави пілот робить сам.
    const up = qrotate(drone.state.orientation, v3(0, 0, 1)).z
    input.hoverBias = drone.state.landed ? 0 : drone.hoverThrottleNow / Math.max(up, 0.5)

    let control = input.sample(dt)
    // тренувальний рівень: ANGLE тримає горизонт, стіки задають кут нахилу
    if (runtime.angle) {
      const a = runtime.angle.compute(drone, control.pitch, control.roll)
      control = { ...control, pitch: a.pitch, roll: a.roll }
    }

    drone.update(control, dt)
    const result = mission.update(dt)
    if (result.outcome !== 'flying') {
      finished = result
      audio.impact()

      const total = session.level.sorties.length
      // прогрес пишемо одразу: закрив вкладку після вдалого вильоту —
      // повернешся на наступний, а не на початок рівня
      if (result.outcome === 'success') progress.completeSortie(session.level.id, sortieIndex)
      else progress.failLevel(session.level.id)

      const moreSorties = result.outcome === 'success' && sortieIndex + 1 < total
      const moreLevels = result.outcome === 'success' && !moreSorties && levelIndex + 1 < LEVELS.length
      const onNext = moreSorties
        ? () => loadSortie(levelIndex, sortieIndex + 1)
        : moreLevels
          ? () => loadSortie(levelIndex + 1, 0)
          : showCampaign

      debrief.show(session.level, result, restartLevel, onNext, { index: sortieIndex, total }, showCampaign)
      osd.root.classList.add('hidden')
    }
  }

  vehicles.update(mission.targets)
  world.updateGrass(drone.state.position.x, drone.state.position.y)
  camera.update(dt)
  video.render(world.scene, camera.camera, dt, finished ? 0 : mission.signal)

  if (!finished) {
    osd.update(drone, mission)
    audio.update(drone.state.motorRpm, drone.telemetry.speed, mission.signal, input.armed)
  }
}

// ?level=2 — стрибок одразу на потрібний виліт (зручно для тестів і налагодження)
// ?sens=0.6 — множник чутливості стіків, щоб підібрати відчуття без перезбирання
const params = new URLSearchParams(location.search)
const sens = Number(params.get('sens'))
if (Number.isFinite(sens) && sens > 0) input.sensitivity = sens
const requested = Number(params.get('level'))
if (Number.isFinite(requested) && requested > 0) loadSortie(requested - 1, 0)
else if (!progress.seenTutorial) showTutorial(true)
else showCampaign()
requestAnimationFrame(frame)
