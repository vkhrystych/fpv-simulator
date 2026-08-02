import { GRID_COLS, GRID_ROWS, Terrain, gridCellSize } from '../level/terrain'
import type { LevelSpec } from '../level/types'
import { DRONES, PAYLOADS } from '../drones'

/**
 * Брифінг: топографічна мапа з сіткою і зоною ймовірної цілі.
 * Вивчати можна скільки завгодно — але після зльоту вона недоступна.
 * Тут гравець єдиний раз бачить, ДЕ приблизно шукати.
 */
const MAP_PX = 520
/** висота плашки з компасом, вітром і масштабом — під мапою, а не поверх неї */
const PLATE_H = 42

export class Briefing {
  readonly root: HTMLDivElement
  private onStart?: () => void

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div')
    this.root.className = 'screen briefing hidden'
    parent.appendChild(this.root)
  }

  show(level: LevelSpec, terrain: Terrain, onStart: () => void): void {
    this.onStart = onStart
    this.root.innerHTML = ''
    this.root.classList.remove('hidden')

    const left = document.createElement('div')
    left.className = 'briefing-map'
    left.appendChild(this.drawMap(level, terrain))
    left.appendChild(this.legend(level))

    const right = document.createElement('div')
    right.className = 'briefing-text'
    right.innerHTML = `
      <div class="tag">ВИЛІТ ${String(level.index).padStart(2, '0')}</div>
      <h1>${level.title}</h1>
      <p class="brief">${level.brief}</p>
      <h2>Завдання</h2>
      <ol>${level.objectives.map((o) => `<li>${o}</li>`).join('')}</ol>
      <h2>Борт</h2>
      <table>
        <tr><td>Дрон</td><td>${DRONES[level.droneId].label}</td></tr>
        <tr><td>Навантаження</td><td>${PAYLOADS[level.payloadId].label}</td></tr>
        <tr><td>Зведення</td><td>${PAYLOADS[level.payloadId].armDistance} м від зльоту</td></tr>
        <tr><td>Вітер</td><td>${level.weather.windSpeed.toFixed(1)} м/с з ${Math.round(level.weather.windFromDeg)}°</td></tr>
        <tr><td>Час</td><td>${Math.floor(level.timeLimitS / 60)} хв</td></tr>
        <tr><td>Режим</td><td>${level.allowAngleMode ? 'ANGLE дозволено' : 'ACRO'}</td></tr>
      </table>
      <p class="warn">Після зльоту мапа недоступна. Запам'ятай квадрати.</p>
    `

    const start = document.createElement('button')
    start.textContent = 'ЗЛІТ'
    start.className = 'primary'
    start.onclick = () => {
      this.hide()
      this.onStart?.()
    }
    right.appendChild(start)

    const help = document.createElement('p')
    help.className = 'help'
    help.textContent =
      'Геймпад: лівий стік — газ/рискання, правий — тангаж/крен, A — арм. ' +
      'Клавіатура: W/S — газ, A/D — рискання, стрілки — тангаж/крен, Space — арм, R — рестарт.'
    right.appendChild(help)

    this.root.append(left, right)
  }

  hide(): void {
    this.root.classList.add('hidden')
  }

  /** Мапа малюється з тієї самої функції рельєфу, що й фізика — брехати нічим. */
  private drawMap(level: LevelSpec, terrain: Terrain): HTMLCanvasElement {
    const canvas = document.createElement('canvas')
    canvas.width = MAP_PX
    canvas.height = MAP_PX + PLATE_H
    const ctx = canvas.getContext('2d')!
    const size = terrain.config.size
    const toPx = (x: number, y: number) => [
      ((x + size) / (size * 2)) * MAP_PX,
      ((size - y) / (size * 2)) * MAP_PX,
    ]

    // рельєф відмивкою
    const img = ctx.createImageData(MAP_PX, MAP_PX)
    for (let py = 0; py < MAP_PX; py++) {
      for (let px = 0; px < MAP_PX; px++) {
        const x = (px / MAP_PX) * size * 2 - size
        const y = size - (py / MAP_PX) * size * 2
        const h = terrain.height(x, y)
        // відмивка: освітлення з північного заходу + тон за висотою
        const shade = terrain.height(x + 10, y + 10) - h
        const t = h / terrain.config.amplitude
        const v = 172 + t * 30 - shade * 26
        const i = (py * MAP_PX + px) * 4
        img.data[i] = v * 0.93
        img.data[i + 1] = v * 0.95
        img.data[i + 2] = v * 0.84
        img.data[i + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)

    // дороги
    ctx.strokeStyle = 'rgba(120,100,70,0.85)'
    ctx.lineWidth = 2.5
    for (const t of level.targets) {
      if (!t.route) continue
      ctx.beginPath()
      t.route.points.forEach(([x, y], i) => {
        const [px, py] = toPx(x, y)
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      })
      ctx.stroke()
    }

    // зона ймовірної цілі — заштрихована, НЕ точка
    const cell = (gridCellSize(terrain) / (size * 2)) * MAP_PX
    ctx.save()
    ctx.fillStyle = 'rgba(190,60,50,0.16)'
    ctx.strokeStyle = 'rgba(190,60,50,0.55)'
    ctx.lineWidth = 1
    for (const label of level.searchCells) {
      const col = 'ABCDEFGH'.indexOf(label[0])
      const row = Number(label[1]) - 1
      const x = col * cell
      const y = row * cell
      ctx.fillRect(x, y, cell, cell)
      ctx.beginPath()
      for (let d = -cell; d < cell; d += 7) {
        ctx.moveTo(x + d, y + cell)
        ctx.lineTo(x + d + cell, y)
      }
      ctx.save()
      ctx.beginPath()
      ctx.rect(x, y, cell, cell)
      ctx.clip()
      ctx.stroke()
      ctx.restore()
    }
    ctx.restore()

    // сітка й підписи
    ctx.strokeStyle = 'rgba(40,45,40,0.45)'
    ctx.lineWidth = 1
    ctx.font = '11px ui-monospace, monospace'
    ctx.fillStyle = 'rgba(30,35,30,0.8)'
    for (let c = 0; c <= GRID_COLS; c++) {
      const x = c * cell
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, MAP_PX)
      ctx.stroke()
      if (c < GRID_COLS) ctx.fillText('ABCDEFGH'[c], x + cell / 2 - 3, 12)
    }
    for (let r = 0; r <= GRID_ROWS; r++) {
      const y = r * cell
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(MAP_PX, y)
      ctx.stroke()
      if (r < GRID_ROWS) ctx.fillText(String(r + 1), 3, y + cell / 2 + 4)
    }

    // точка зльоту
    const [lx, ly] = toPx(level.launch.x, level.launch.y)
    ctx.strokeStyle = '#1d5c2a'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(lx, ly, 6, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(lx, ly)
    const hdg = (level.launch.headingDeg * Math.PI) / 180
    ctx.lineTo(lx + Math.sin(hdg) * 18, ly - Math.cos(hdg) * 18)
    ctx.stroke()

    // північ, вітер і масштаб — на окремій плашці ПІД мапою, щоб не з'їдати сітку
    ctx.fillStyle = '#e7e3d8'
    ctx.fillRect(0, MAP_PX, MAP_PX, PLATE_H)
    ctx.strokeStyle = 'rgba(40,45,40,0.45)'
    ctx.strokeRect(0.5, MAP_PX + 0.5, MAP_PX - 1, PLATE_H - 1)

    const baseY = MAP_PX + PLATE_H / 2
    ctx.fillStyle = 'rgba(30,35,30,0.95)'
    ctx.font = '12px ui-monospace, monospace'

    // стрілка на північ
    ctx.strokeStyle = 'rgba(30,35,30,0.95)'
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.moveTo(24, baseY + 11)
    ctx.lineTo(24, baseY - 11)
    ctx.moveTo(20, baseY - 6)
    ctx.lineTo(24, baseY - 11)
    ctx.lineTo(28, baseY - 6)
    ctx.stroke()
    ctx.fillText('Пн', 34, baseY + 4)

    // вітер: стрілка показує, КУДИ дме
    const wa = (level.weather.windFromDeg * Math.PI) / 180
    const wx = 130
    // напрямок, КУДИ дме — протилежний до windFromDeg (той самий вектор, що у windVector)
    const dx = -Math.sin(wa)
    const dy = -Math.cos(wa)
    ctx.strokeStyle = 'rgba(40,70,140,0.95)'
    ctx.beginPath()
    ctx.moveTo(wx - dx * 13, baseY + dy * 13)
    ctx.lineTo(wx + dx * 13, baseY - dy * 13)
    ctx.moveTo(wx + dx * 13, baseY - dy * 13)
    ctx.lineTo(wx + dx * 13 - dx * 6 - dy * 4, baseY - dy * 13 + dy * 6 - dx * 4)
    ctx.moveTo(wx + dx * 13, baseY - dy * 13)
    ctx.lineTo(wx + dx * 13 - dx * 6 + dy * 4, baseY - dy * 13 + dy * 6 + dx * 4)
    ctx.stroke()
    ctx.fillStyle = 'rgba(30,35,30,0.95)'
    ctx.fillText(`вітер ${level.weather.windSpeed.toFixed(1)} м/с`, wx + 22, baseY + 4)

    // масштаб
    const barM = 500
    const barPx = (barM / (size * 2)) * MAP_PX
    const sx = MAP_PX - barPx - 16
    ctx.strokeStyle = 'rgba(30,35,30,0.95)'
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(sx, baseY + 6)
    ctx.lineTo(sx + barPx, baseY + 6)
    ctx.moveTo(sx, baseY + 2)
    ctx.lineTo(sx, baseY + 10)
    ctx.moveTo(sx + barPx, baseY + 2)
    ctx.lineTo(sx + barPx, baseY + 10)
    ctx.stroke()
    ctx.fillText(`${barM} м`, sx + barPx / 2 - 18, baseY - 4)

    return canvas
  }

  private legend(level: LevelSpec): HTMLDivElement {
    const d = document.createElement('div')
    d.className = 'legend'
    d.innerHTML = `
      <span><i class="sq search"></i> зона ймовірної цілі: ${level.searchCells.join(', ')}</span>
      <span><i class="sq launch"></i> точка зльоту</span>
      <span><i class="sq road"></i> ґрунтівка</span>
    `
    return d
  }
}
