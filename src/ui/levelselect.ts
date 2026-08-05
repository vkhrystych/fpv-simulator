import { LEVELS } from '../level/levels'
import type { LevelSpec } from '../level/types'
import { DRONES } from '../drones'
import type { Progress } from '../game/progress'

/**
 * Вибір рівня. Він же — єдине місце, де видно збережений прогрес:
 * що пройдено, що відкрито, звідки продовжити.
 *
 * Рівні відкриваються по черзі: кампанія побудована як прогресія навичок,
 * і стрибок із першого рівня одразу на нічний фінал нічого, крім фрустрації,
 * не дає.
 */
export class LevelSelect {
  readonly root: HTMLDivElement

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div')
    this.root.className = 'screen levelselect hidden'
    parent.appendChild(this.root)
  }

  show(
    progress: Progress,
    onPick: (level: LevelSpec) => void,
    onReset: () => void,
    onControls?: () => void,
  ): void {
    this.root.innerHTML = ''
    this.root.classList.remove('hidden')

    const wrap = document.createElement('div')
    wrap.className = 'select-wrap'

    const done = progress.completedCount
    const resumeId = progress.resumeLevelId
    wrap.innerHTML = `
      <div class="tag">FPVSIM</div>
      <h1>Campaign</h1>
      <p class="brief">
        ${done} of ${LEVELS.length} levels complete. Progress is stored in this browser.
      </p>
    `

    const grid = document.createElement('div')
    grid.className = 'level-grid'

    for (const level of LEVELS) {
      const unlocked = progress.isUnlocked(level.id)
      const completed = progress.isCompleted(level.id)
      const isResume = level.id === resumeId && !completed

      const card = document.createElement('button')
      card.className = `level-card${completed ? ' done' : ''}${unlocked ? '' : ' locked'}${
        isResume ? ' resume' : ''
      }`
      card.disabled = !unlocked
      card.innerHTML = `
        <span class="num">${String(level.index).padStart(2, '0')}</span>
        <span class="name">${unlocked ? level.title : 'Locked'}</span>
        <span class="meta">${
          unlocked
            ? `${DRONES[level.droneId].label} · ${level.sorties.length} sortie${
                level.sorties.length > 1 ? 's' : ''
              }`
            : `Complete level ${level.index - 1}`
        }</span>
        <span class="state">${completed ? '✓' : isResume ? '▸' : unlocked ? '' : '🔒'}</span>
      `
      if (unlocked) card.onclick = () => onPick(level)
      grid.appendChild(card)
    }

    wrap.appendChild(grid)

    const row = document.createElement('div')
    row.className = 'buttons'

    const resume = document.createElement('button')
    resume.className = 'primary'
    const resumeLevel = LEVELS.find((l) => l.id === resumeId)!
    resume.textContent = done === 0 ? 'START CAMPAIGN' : `CONTINUE — ${resumeLevel.title}`
    resume.onclick = () => onPick(resumeLevel)
    row.appendChild(resume)

    if (onControls) {
      const help = document.createElement('button')
      help.textContent = 'CONTROLS'
      help.onclick = onControls
      row.appendChild(help)
    }

    if (done > 0) {
      const reset = document.createElement('button')
      reset.textContent = 'RESET PROGRESS'
      reset.onclick = () => {
        // знищення прогресу — рідкісна незворотна дія, тому питаємо явно
        if (confirm('Erase all campaign progress?')) onReset()
      }
      row.appendChild(reset)
    }

    wrap.appendChild(row)
    this.root.appendChild(wrap)
  }

  hide(): void {
    this.root.classList.add('hidden')
  }
}
