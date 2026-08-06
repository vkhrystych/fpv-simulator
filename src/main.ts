import * as THREE from 'three'
import { InputManager } from './core/input'
import { FlightAudio } from './core/audio'
import { createSession, type Session } from './game/session'
import { LEVELS } from './level/levels'
import { World } from './render/world'
import { FpvCamera } from './render/camera'
import { VideoFeed } from './render/video'
import { VehicleRenderer } from './render/vehicles'
import { ReplayRecorder } from './game/replay'
import { ReplayView } from './render/replay'
import { Osd } from './ui/osd'
import { Briefing } from './ui/briefing'
import { Debrief } from './ui/debrief'
import { LevelSelect } from './ui/levelselect'
import { Tutorial } from './ui/tutorial'
import { Progress } from './game/progress'
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
  recorder: ReplayRecorder
}

let runtime: Runtime | null = null

/**
 * Повтор ураження (§13): 0.7 с «сигнал втрачено», потім ~6 с ЧБ-картинки
 * з борта спостерігача — підліт і пил, — і аж тоді дебриф.
 * Будь-яка клавіша або клік пропускає.
 */
interface ReplayState {
  view: ReplayView
  /** пауза чорного снігу перед врубанням лінка спостерігача */
  delay: number
  onDone: () => void
}
let replay: ReplayState | null = null
let replaySkip = false

const recTag = document.createElement('div')
recTag.className = 'rec-tag hidden'
recTag.innerHTML = '<span>●</span> REC · OBS-2 <em>any key — skip</em>'
app.appendChild(recTag)
addEventListener('keydown', () => (replaySkip = true))
addEventListener('pointerdown', () => (replaySkip = true))

function endReplay(): void {
  if (!runtime || !replay) return
  replay.view.dispose()
  runtime.video.setMono(!!runtime.session.drone.spec.camera.monochrome)
  recTag.classList.add('hidden')
  const done = replay.onDone
  replay = null
  done()
}
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
  replay?.view.dispose()
  replay = null
  recTag.classList.add('hidden')
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
    recorder: new ReplayRecorder(),
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

  const { session, world, camera, video, vehicles, recorder } = runtime
  const { drone, mission } = session

  if (input.menuRequested) {
    replay?.view.dispose()
    replay = null
    recTag.classList.add('hidden')
    runtime = null
    showCampaign()
    return
  }

  if (input.restartRequested) {
    restartLevel()
    return
  }

  // Повтор ураження: світ уже завмер, малюємо тільки очима спостерігача
  if (replay) {
    const r = replay
    if (r.delay > 0) {
      // «сигнал втрачено» — той самий чорний сніг, що й раніше
      r.delay -= dt
      video.render(world.scene, camera.camera, dt, 0)
      if (r.delay <= 0) {
        video.setMono(true)
        recTag.classList.remove('hidden')
        // клавіші, натиснуті ще в польоті, не мусять пропускати повтор
        replaySkip = false
      }
      return
    }
    const alive = r.view.update(dt)
    video.render(world.scene, r.view.camera, dt, r.view.signal)
    if (!alive || replaySkip) endReplay()
    return
  }

  if (!finished) {
    // Газ, до якого повертається клавіатура в нейтралі: зависання з поправкою
    // на нахил (при крені вертикальна складова тяги падає як cos). На землі
    // асисту немає — зліт з трави пілот робить сам.
    const up = qrotate(drone.state.orientation, v3(0, 0, 1)).z
    input.hoverBias = drone.state.landed ? 0 : drone.hoverThrottleNow / Math.max(up, 0.5)

    // ACRO на всіх рівнях: стік — кутова швидкість, відпустив — нахил лишається
    const control = input.sample(dt)

    drone.update(control, dt)
    recorder.capture(now / 1000, drone.state.position, drone.state.orientation, mission.targets)
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

      const showDebrief = () => {
        debrief.show(session.level, result, restartLevel, onNext, { index: sortieIndex, total }, showCampaign)
        osd.root.classList.add('hidden')
      }

      // ураження заслуговує на повтор; провал — одразу сухий дебриф
      const target = mission.targets.find((t) => t.spec.id === result.hitTargetId)
      const clip = recorder.clip(3.4)
      if (result.outcome === 'success' && target && clip.length > 1) {
        osd.root.classList.add('hidden')
        replay = {
          view: new ReplayView(world.scene, vehicles, clip, target.aimPoint, target.spec.id, innerWidth / innerHeight),
          delay: 0.7,
          onDone: showDebrief,
        }
      } else {
        showDebrief()
      }
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
