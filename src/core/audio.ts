import { clamp } from '../flight/math'

/**
 * Звук цілком синтетичний: тон моторів від обертів, свист повітря від швидкості,
 * статика радіо синхронна з шумом картинки. Музики в польоті немає.
 */
export class FlightAudio {
  private ctx?: AudioContext
  private motorOsc: OscillatorNode[] = []
  private motorGain: GainNode[] = []
  private windGain?: GainNode
  private staticGain?: GainNode
  private master?: GainNode
  started = false

  /** Запуск лише з жесту користувача — інакше браузер заблокує звук. */
  start(): void {
    if (this.started) return
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    this.ctx = new Ctx()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.35
    this.master.connect(this.ctx.destination)

    // чотири злегка розстроєні пилки — биття між ними і дає «рій»
    for (let i = 0; i < 4; i++) {
      const osc = this.ctx.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.value = 120
      const gain = this.ctx.createGain()
      gain.gain.value = 0
      const filter = this.ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 2600
      osc.connect(gain).connect(filter).connect(this.master)
      osc.start()
      this.motorOsc.push(osc)
      this.motorGain.push(gain)
    }

    this.windGain = this.ctx.createGain()
    this.windGain.gain.value = 0
    const windFilter = this.ctx.createBiquadFilter()
    windFilter.type = 'bandpass'
    windFilter.frequency.value = 900
    this.noise().connect(this.windGain).connect(windFilter).connect(this.master)

    this.staticGain = this.ctx.createGain()
    this.staticGain.gain.value = 0
    this.noise().connect(this.staticGain).connect(this.master)

    this.started = true
  }

  private noise(): AudioBufferSourceNode {
    const ctx = this.ctx!
    const len = ctx.sampleRate * 2
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    let seed = 1
    for (let i = 0; i < len; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      data[i] = (seed / 0x3fffffff - 1) * 0.5
    }
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    src.start()
    return src
  }

  update(rpm: number[], speed: number, signal: number, armed: boolean): void {
    if (!this.ctx || !this.started) return
    const now = this.ctx.currentTime

    for (let i = 0; i < 4; i++) {
      const r = rpm[i] ?? 0
      const norm = clamp(r / 30000, 0, 1.1)
      // 2 лопаті → основний тон удвічі вищий за оберти
      const hz = 45 + norm * 520 + i * 3.5
      this.motorOsc[i].frequency.setTargetAtTime(hz, now, 0.02)
      this.motorGain[i].gain.setTargetAtTime(armed ? norm * 0.12 : 0, now, 0.05)
    }

    this.windGain?.gain.setTargetAtTime(clamp(speed / 45, 0, 1) * 0.22, now, 0.08)
    this.staticGain?.gain.setTargetAtTime((1 - clamp(signal, 0, 1)) ** 2 * 0.3, now, 0.05)
  }

  /** Влучання: короткий різкий зріз і тиша — жодних кіношних вибухів. */
  impact(): void {
    if (!this.ctx || !this.master) return
    const now = this.ctx.currentTime
    for (const g of this.motorGain) g.gain.setTargetAtTime(0, now, 0.01)
    this.staticGain?.gain.setValueAtTime(0.5, now)
    this.staticGain?.gain.setTargetAtTime(0, now + 0.25, 0.15)
  }

  dispose(): void {
    this.ctx?.close()
    this.started = false
  }
}
