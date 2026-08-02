import { clamp, smoothing } from '../flight/math'
import type { ControlInput } from '../flight/types'

/**
 * Крок клавіатурного газу. Клавіатура не має аналогової осі, тому без асисту
 * газ «залипає» там, де його лишили: відпустив W на 100% — і дрон із запасом
 * тяги 4:1 просто йде в небо, а вперед майже не рухається.
 * Тому: W/S відхиляють газ, а без них він плавно повертається до газу зависання
 * (уже скомпенсованого нахилом). На геймпаді газ лишається справжнім абсолютним.
 */
/**
 * Крок клавіатурної осі крену/тангажу/рискання.
 * Клавіша — це не стік: натиснув і вже маєш повне відхилення, тобто максимальну
 * кутову швидкість від найлегшого дотику. Тому вводимо розгін стіка: натиснуте
 * тримання плавно виходить на край, а відпускання швидко вертає в центр.
 * Легкий тап = мале відхилення = точне доведення на ціль.
 */
export function stepKeyboardAxis(current: number, target: number, dt: number): number {
  // до краю ~0.28 с, назад у центр ~0.11 с — повертатись стік мусить швидше,
  // ніж відхилятись, інакше керування «пливе»
  const tau = target === 0 ? 0.11 : 0.28
  return clamp(current + (target - current) * smoothing(dt, tau), -1, 1)
}

export function stepKeyboardThrottle(
  current: number,
  up: number,
  down: number,
  hoverBias: number,
  dt: number,
  rate: number,
): number {
  if (up > 0 || down > 0) {
    return clamp(current + (up - down) * rate * dt, 0, 1)
  }
  return clamp(current + (clamp(hoverBias, 0, 1) - current) * smoothing(dt, 0.35), 0, 1)
}

/**
 * Вхід пілота: геймпад (mode 2) або клавіатура.
 * Газ на клавіатурі — накопичувальний: у дрона немає «автозависання»,
 * тому стік газу мусить мати стан, а не бути імпульсом.
 */
export class InputManager {
  private keys = new Set<string>()
  /** клавіші, натиснуті з моменту минулого кадру (фронт натискання) */
  private pressed = new Set<string>()
  private throttle = 0
  /** індекс підключеного геймпада, або -1 */
  gamepadIndex = -1
  armed = false
  private armLatch = false
  private restartLatch = false
  restartRequested = false

  /** Мертва зона стіків геймпада. */
  deadzone = 0.06
  /** Швидкість набору газу з клавіатури, частка за секунду. */
  throttleRate = 0.85
  /**
   * Газ, до якого повертається клавіатурний стік у нейтралі.
   * Головний цикл щокадру кладе сюди газ зависання з поправкою на нахил.
   */
  hoverBias = 0.5
  /** Загальний множник чутливості стіків, спільний для клавіатури й геймпада. */
  sensitivity = 1

  /** згладжені положення клавіатурних осей */
  private axes = { roll: 0, pitch: 0, yaw: 0 }

  constructor(private target: EventTarget = window) {
    this.target.addEventListener('keydown', this.onKeyDown as EventListener)
    this.target.addEventListener('keyup', this.onKeyUp as EventListener)
    window.addEventListener('gamepadconnected', this.onGamepad as EventListener)
    window.addEventListener('gamepaddisconnected', this.onGamepadLost as EventListener)
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown as EventListener)
    this.target.removeEventListener('keyup', this.onKeyUp as EventListener)
    window.removeEventListener('gamepadconnected', this.onGamepad as EventListener)
    window.removeEventListener('gamepaddisconnected', this.onGamepadLost as EventListener)
  }

  /**
   * Натискання ловимо подією, а не опитуванням: короткий тап між двома кадрами
   * інакше просто зникає — і арм не спрацьовує.
   */
  private onKeyDown = (e: KeyboardEvent): void => {
    if (!e.repeat) this.pressed.add(e.code)
    this.keys.add(e.code)
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault()
  }
  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code)
  }
  private onGamepad = (e: GamepadEvent): void => {
    this.gamepadIndex = e.gamepad.index
  }
  private onGamepadLost = (): void => {
    this.gamepadIndex = -1
  }

  private axis(v: number): number {
    return Math.abs(v) < this.deadzone ? 0 : clamp((v - Math.sign(v) * this.deadzone) / (1 - this.deadzone), -1, 1)
  }

  private pad(): Gamepad | null {
    if (this.gamepadIndex < 0 || !navigator.getGamepads) return null
    return navigator.getGamepads()[this.gamepadIndex] ?? null
  }

  reset(): void {
    this.throttle = 0
    this.armed = false
    this.restartRequested = false
    this.pressed.clear()
    this.axes.roll = 0
    this.axes.pitch = 0
    this.axes.yaw = 0
  }

  /** Зчитує стан за кадр. dt потрібен газу з клавіатури. */
  sample(dt: number): ControlInput {
    const pad = this.pad()

    let roll = 0
    let pitch = 0
    let yaw = 0
    let armPressed = false
    let restartPressed = false

    if (pad) {
      // mode 2: лівий стік — газ/рискання, правий — тангаж/крен
      this.throttle = clamp((-this.axis(pad.axes[1] ?? 0) + 1) / 2, 0, 1)
      yaw = this.axis(pad.axes[0] ?? 0)
      roll = this.axis(pad.axes[2] ?? 0)
      pitch = -this.axis(pad.axes[3] ?? 0)
      armPressed = !!pad.buttons[0]?.pressed
      restartPressed = !!pad.buttons[9]?.pressed
    } else {
      const k = (code: string) => (this.keys.has(code) ? 1 : 0)
      const up = k('KeyW') + k('ShiftLeft') * 0.6
      const down = k('KeyS')
      this.throttle = stepKeyboardThrottle(this.throttle, up, down, this.hoverBias, dt, this.throttleRate)
      this.axes.yaw = stepKeyboardAxis(this.axes.yaw, k('KeyD') - k('KeyA'), dt)
      this.axes.roll = stepKeyboardAxis(this.axes.roll, k('ArrowRight') - k('ArrowLeft'), dt)
      this.axes.pitch = stepKeyboardAxis(this.axes.pitch, k('ArrowUp') - k('ArrowDown'), dt)
      yaw = this.axes.yaw
      roll = this.axes.roll
      pitch = this.axes.pitch
      // клавіатура вже дає фронт подією — латчі потрібні тільки геймпаду
      if (this.pressed.has('Space')) this.armed = !this.armed
      restartPressed = this.pressed.has('KeyR')
      this.restartRequested = restartPressed
      this.pressed.clear()
    }

    if (pad) {
      if (armPressed && !this.armLatch) this.armed = !this.armed
      this.armLatch = armPressed
      this.restartRequested = restartPressed && !this.restartLatch
      this.restartLatch = restartPressed
    }

    if (!this.armed) this.throttle = pad ? this.throttle : 0

    const k = clamp(this.sensitivity, 0.1, 2)
    return {
      roll: clamp(roll * k, -1, 1),
      pitch: clamp(pitch * k, -1, 1),
      yaw: clamp(yaw * k, -1, 1),
      throttle: this.armed ? this.throttle : 0,
      armed: this.armed,
    }
  }

  get hasGamepad(): boolean {
    return this.pad() !== null
  }
}
