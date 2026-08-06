import { createSession, type Session } from '../src/game/session'
import { getLevel } from '../src/level/levels'
import { AngleController } from '../src/flight/angle'
import { PHYSICS_DT } from '../src/flight/drone'
import { clamp, quatToEuler, vsub, v3 } from '../src/flight/math'
import { radToDeg, stickForRate, maxRate } from '../src/flight/rates'
import type { ControlInput } from '../src/flight/types'
import type { Target } from '../src/game/targets'

/**
 * Автопілот-«гравець»: злітає, набирає висоту, рахує точку перехоплення
 * і заходить по глісаді. Не ідеальний пілот — саме тому він і доводить,
 * що рівень проходимо звичайним керуванням, а не читерським телепортом.
 *
 * Якщо автопілот не проходить рівень — це або баг рівня, або рівень
 * нечесно складний. Обидва варіанти треба чинити, а не послаблювати тест.
 */
export class Autopilot {
  private angle: AngleController
  private launched = false
  private prevGround = Infinity

  constructor(
    private session: Session,
    private cruiseAlt = 60,
  ) {
    this.angle = new AngleController(session.drone.spec, 40)
  }

  step(target: Target): ControlInput {
    const { drone, terrain, props } = this.session
    const s = drone.state
    const alt = s.position.z - terrain.height(s.position.x, s.position.y)
    const horizSpeed = Math.hypot(s.velocity.x, s.velocity.y)

    // Точка перехоплення: ітеративно розв'язуємо |P + V·t − D| = v·t.
    // Просте «упередження пропорційно дальності» не влучає в дрібні рухомі
    // цілі — мотоцикл 2.1 м на 11 м/с іде з-під носа.
    // швидкість для розв'язку — РЕАЛЬНА швидкість дрона: жорстка «підлога»
    // завищувала її, і точка перехоплення систематично лягала позаду цілі
    const closing = Math.max(6, horizSpeed)
    let lead = 0
    if (target.isMoving && target.speed > 0) {
      for (let i = 0; i < 4; i++) {
        const px = target.aimPoint.x + Math.sin(target.heading) * target.speed * lead
        const py = target.aimPoint.y + Math.cos(target.heading) * target.speed * lead
        lead = Math.hypot(px - s.position.x, py - s.position.y) / closing
      }
    }
    const aim = v3(
      target.aimPoint.x + Math.sin(target.heading) * target.speed * lead,
      target.aimPoint.y + Math.cos(target.heading) * target.speed * lead,
      target.aimPoint.z,
    )

    const delta = vsub(aim, s.position)
    const ground = Math.hypot(delta.x, delta.y)

    // курс: доводимо ніс на точку перехоплення (компасна конвенція)
    const wantYaw = Math.atan2(delta.x, delta.y)
    const yawErr = ((radToDeg(wantYaw - quatToEuler(s.orientation).yaw) + 540) % 360) - 180
    const yaw = stickForRate(
      clamp(yawErr * 3, -maxRate(drone.spec.rates.yaw), maxRate(drone.spec.rates.yaw)),
      drone.spec.rates.yaw,
    )

    if (alt > 12) this.launched = true
    const heightAbove = Math.max(1, s.position.z - aim.z)
    // Зниження починаємо так, щоб термінальна глісада була ПОЛОГОЮ (~15°).
    // Пікірування під 60° з крейсерської висоти гарантовано мажe по рухомій
    // цілі: вона встигає вийти з-під дрона, поки той падає.
    const dive = ground < Math.max(140, heightAbove * 3.6)
    // захист від землі: провалились ПІД глісаду — вирівнюємось і набираємо.
    // Прив'язка до глісади, а не до абсолютної висоти: біля цілі бути низько
    // якраз і треба, інакше в наземну машину не влучити.
    // ВАЖЛИВО: біля цілі захист вимикається. Наземна машина сидить на висоті
    // ~1 м, тож щоб у неї влучити, треба спуститись нижче за будь-який
    // «безпечний» поріг. Поки поріг діяв завжди, дрон стабільно проходив
    // на 3.5 м вище цілі — промах був чисто вертикальний.
    // Слідування рельєфу з упередженням: дивимось, що буде під нами через
    // 1.5 с, і не дозволяємо провалитись нижче за це. Просто «мінімальна
    // висота» тут не працює — ціль може сидіти в улоговині за пагорбом.
    // Біля самої цілі кліренс майже нульовий, інакше в наземну машину
    // не влучити взагалі.
    const aheadX = s.position.x + s.velocity.x * 1.5
    const aheadY = s.position.y + s.velocity.y * 1.5
    const clearance = ground > 25 ? 9 : 1.2
    let floorZ =
      Math.max(terrain.height(aheadX, aheadY), terrain.height(s.position.x, s.position.y)) + clearance

    // Перешкоди попереду: лісосмуги, ферми, ЛЕП. Живий пілот обходить їх
    // згори, і автопілот мусить робити так само — інакше кожна смуга дерев
    // на маршруті означає втрату борта.
    if (ground > 20) {
      for (const p of props.near(aheadX, aheadY, 30)) {
        const reach = (p.radius ?? Math.hypot(p.halfW ?? 0, p.halfL ?? 0)) + 14
        if (Math.hypot(p.x - aheadX, p.y - aheadY) > reach) continue
        floorZ = Math.max(floorZ, p.groundZ + p.height + 8)
      }
    }
    const receding = ground > this.prevGround + 0.02
    this.prevGround = ground
    const tooLow = s.position.z < floorZ || (receding && alt < 16 && ground > 20)

    let desiredVz: number
    let tilt: number

    if (!this.launched) {
      desiredVz = clamp((this.cruiseAlt - alt) * 0.6, -5, 7)
      tilt = 0
    } else if (tooLow) {
      desiredVz = 8
      tilt = 0
    } else if (dive) {
      // Глісада: приходимо на висоту цілі рівно тоді, коли приходимо горизонтально.
      const timeToGo = Math.max(ground / Math.max(horizSpeed, 6), 0.6)
      // швидкість зниження обмежена запасом висоти: інакше промах по цілі
      // перетворюється на зіткнення з землею
      desiredVz = clamp((aim.z - s.position.z) / timeToGo, -Math.max(4, alt * 0.8), 6)
      // Швидкість заходу обмежена крутизною глісади: якщо летіти швидше,
      // ніж дозволяє висота над ціллю, дрон просто проскакує над нею —
      // і так по колу, поки не закінчиться час. Від'ємний нахил = гальмування.
      // Нижня межа — швидше за саму ціль, інакше мотоцикл на 12 м/с
      // просто не наздогнати.
      const minSpeed = Math.max(9, target.speed + 8)
      const wantSpeed = clamp((ground * 14) / heightAbove, minSpeed, 30)
      tilt = clamp(0.1 + (wantSpeed - horizSpeed) * 0.06, -0.4, 0.7)
    } else {
      desiredVz = clamp((this.cruiseAlt - alt) * 0.6, -5, 7)
      tilt = clamp(ground / 260, 0, 1)
    }

    const e = quatToEuler(s.orientation)
    const up = Math.cos(e.roll) * Math.cos(e.pitch)
    const hover = drone.hoverThrottleNow / Math.max(up, 0.4)
    const throttle = clamp(hover + (desiredVz - s.velocity.z) * 0.09, 0, 1)
    // Кренове наведення. Без нього дрон виходив на 20 м від цілі й нескінченно
    // кружляв навколо: ніс дивився на ціль, але бічна швидкість не гасилась —
    // класична орбіта чистого переслідування. Гасимо знос і зводимо ціль
    // на поздовжню вісь.
    const yawNow = quatToEuler(s.orientation).yaw
    const rightX = Math.cos(yawNow)
    const rightY = -Math.sin(yawNow)
    const lateralPos = delta.x * rightX + delta.y * rightY
    const lateralVel = s.velocity.x * rightX + s.velocity.y * rightY
    // Поправку беремо від КУТОВОГО зміщення (lateralPos/ground), а не від
    // абсолютного: на дальності 1000 м абсолютний член насичував крен,
    // і дрон замість польоту на ціль ішов по спіралі вгору.
    const bank = clamp((lateralPos / Math.max(ground, 1)) * 1.2 - lateralVel * 0.14, -0.7, 0.7)

    // pitch+ = ніс угору, тому для руху вперед потрібен від'ємний нахил
    const a = this.angle.compute(drone, -tilt, this.launched ? bank : 0)

    return { roll: a.roll, pitch: a.pitch, yaw, throttle, armed: true }
  }
}

export interface FlightReport {
  outcome: string
  reason?: string
  hitTargetId?: string
  stats: { timeS: number; mahUsed: number; distanceM: number; topSpeed: number }
  session: Session
}

/** Проганяє один виліт рівня автопілотом. */
export function flySortie(levelId: string, sortieIndex = 0, maxSeconds = 300): FlightReport {
  const session = createSession(getLevel(levelId), sortieIndex)
  const ap = new Autopilot(session)
  const steps = Math.round(maxSeconds / PHYSICS_DT)

  for (let i = 0; i < steps; i++) {
    session.drone.step(ap.step(session.mission.primary), PHYSICS_DT)
    const r = session.mission.update(PHYSICS_DT)
    if (r.outcome !== 'flying') return { ...r, session }
  }
  return { ...session.mission.result, session }
}

/** Проганяє всі вильоти рівня поспіль, як це робить гравець. */
export function flyLevel(levelId: string, maxSeconds = 300): FlightReport[] {
  const level = getLevel(levelId)
  return level.sorties.map((_, i) => flySortie(levelId, i, maxSeconds))
}
