import type { MissionResult } from '../game/mission'
import type { FailReason, LevelSpec } from '../level/types'

/** Суха таблиця. Без рахунку, комбо і героїчної музики. */
const REASONS: Record<FailReason, { title: string; note: string }> = {
  CRASHED: { title: 'ВТРАТА БОРТА', note: 'Зіткнення з рельєфом.' },
  BATTERY_EMPTY: { title: 'РОЗРЯД', note: 'Заряд вичерпано до виходу на ціль.' },
  SIGNAL_LOST: { title: 'ВТРАТА СИГНАЛУ', note: 'Занадто далеко або занадто низько за рельєфом.' },
  TIMEOUT: { title: 'ЧАС ВИЙШОВ', note: 'Ціль не уражено у відведене вікно.' },
  MISIDENTIFIED: {
    title: 'ПОМИЛКОВА ІДЕНТИФІКАЦІЯ',
    note: 'Уражено цивільний об’єкт. Дивись на силует, а не на рух.',
  },
  DECOY: { title: 'МАКЕТ', note: 'Це була приманка. З 40 м пропорції інші, ніж зі 100 м.' },
  NOT_ARMED: { title: 'БК НЕ ЗВЕДЕНО', note: 'Удар ближче за дистанцію зведення не зараховується.' },
  OUT_OF_BOUNDS: { title: 'ВИХІД ІЗ ЗОНИ', note: 'Борт покинув район відповідальності.' },
}

export class Debrief {
  readonly root: HTMLDivElement

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div')
    this.root.className = 'screen debrief hidden'
    parent.appendChild(this.root)
  }

  show(level: LevelSpec, result: MissionResult, onRetry: () => void, onNext?: () => void): void {
    const ok = result.outcome === 'success'
    const head = ok
      ? { title: 'ЦІЛЬ УРАЖЕНО', note: `${level.title} — виконано.` }
      : REASONS[result.reason ?? 'CRASHED']

    const s = result.stats
    this.root.innerHTML = `
      <div class="debrief-card ${ok ? 'ok' : 'fail'}">
        <div class="tag">ВИЛІТ ${String(level.index).padStart(2, '0')}</div>
        <h1>${head.title}</h1>
        <p>${head.note}</p>
        <table>
          <tr><td>Час у повітрі</td><td>${Math.floor(s.timeS / 60)}:${String(Math.floor(s.timeS % 60)).padStart(2, '0')}</td></tr>
          <tr><td>Пройдено</td><td>${Math.round(s.distanceM)} м</td></tr>
          <tr><td>Максимальна швидкість</td><td>${Math.round(s.topSpeed * 3.6)} км/год</td></tr>
          <tr><td>Витрата</td><td>${Math.round(s.mahUsed)} mAh</td></tr>
          <tr><td>Ідентифіковано</td><td>${s.identified.length ? s.identified.join(', ') : '—'}</td></tr>
        </table>
      </div>
    `
    const row = document.createElement('div')
    row.className = 'buttons'

    const retry = document.createElement('button')
    retry.textContent = 'ПОВТОРИТИ'
    retry.onclick = () => {
      this.hide()
      onRetry()
    }
    row.appendChild(retry)

    if (ok && onNext) {
      const next = document.createElement('button')
      next.className = 'primary'
      next.textContent = 'НАСТУПНИЙ ВИЛІТ'
      next.onclick = () => {
        this.hide()
        onNext()
      }
      row.appendChild(next)
    }
    this.root.querySelector('.debrief-card')!.appendChild(row)
    this.root.classList.remove('hidden')
  }

  hide(): void {
    this.root.classList.add('hidden')
  }
}
