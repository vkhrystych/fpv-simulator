import type { MissionResult } from '../game/mission'
import type { FailReason, LevelSpec } from '../level/types'

/** Суха таблиця. Без рахунку, комбо і героїчної музики. */
const REASONS: Record<FailReason, { title: string; note: string }> = {
  CRASHED: { title: 'AIRCRAFT LOST', note: 'Collision with terrain.' },
  BATTERY_EMPTY: { title: 'BATTERY EMPTY', note: 'The pack ran out before you reached the target.' },
  SIGNAL_LOST: { title: 'SIGNAL LOST', note: 'Too far out, or too low behind the terrain.' },
  TIMEOUT: { title: 'TIME EXPIRED', note: 'The target was not destroyed inside the window.' },
  MISIDENTIFIED: {
    title: 'MISIDENTIFIED',
    note: 'You struck a civilian vehicle. Read the silhouette, not the movement.',
  },
  DECOY: { title: 'DECOY', note: 'That was a mock-up. At 40 m the proportions differ from 100 m.' },
  NOT_ARMED: { title: 'PAYLOAD NOT ARMED', note: 'A strike inside the arming distance does not count.' },
  OUT_OF_BOUNDS: { title: 'LEFT THE AREA', note: 'The aircraft left its area of responsibility.' },
}

export class Debrief {
  readonly root: HTMLDivElement

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div')
    this.root.className = 'screen debrief hidden'
    parent.appendChild(this.root)
  }

  show(
    level: LevelSpec,
    result: MissionResult,
    onRetry: () => void,
    onNext?: () => void,
    sortie = { index: 0, total: 1 },
  ): void {
    const ok = result.outcome === 'success'
    const more = ok && sortie.index + 1 < sortie.total
    const head = ok
      ? more
        ? {
            title: `SORTIE ${sortie.index + 1} COMPLETE`,
            note: `Sorties remaining: ${sortie.total - sortie.index - 1}. The next aircraft is ready.`,
          }
        : { title: 'TARGET DESTROYED', note: `${level.title} — level complete.` }
      : {
          ...REASONS[result.reason ?? 'CRASHED'],
          note:
            REASONS[result.reason ?? 'CRASHED'].note +
            (sortie.total > 1 ? ' The level restarts from the first sortie.' : ''),
        }

    const s = result.stats
    this.root.innerHTML = `
      <div class="debrief-card ${ok ? 'ok' : 'fail'}">
        <div class="tag">LEVEL ${String(level.index).padStart(2, '0')}${
          sortie.total > 1 ? ` · SORTIE ${sortie.index + 1}/${sortie.total}` : ''
        }</div>
        <h1>${head.title}</h1>
        <p>${head.note}</p>
        <table>
          <tr><td>Time airborne</td><td>${Math.floor(s.timeS / 60)}:${String(Math.floor(s.timeS % 60)).padStart(2, '0')}</td></tr>
          <tr><td>Distance flown</td><td>${Math.round(s.distanceM)} m</td></tr>
          <tr><td>Top speed</td><td>${Math.round(s.topSpeed * 3.6)} km/h</td></tr>
          <tr><td>Consumed</td><td>${Math.round(s.mahUsed)} mAh</td></tr>
          <tr><td>Identified</td><td>${s.identified.length ? s.identified.join(', ') : '—'}</td></tr>
        </table>
      </div>
    `
    const row = document.createElement('div')
    row.className = 'buttons'

    const retry = document.createElement('button')
    retry.textContent = ok || sortie.total === 1 ? 'RETRY' : 'RESTART LEVEL'
    retry.onclick = () => {
      this.hide()
      onRetry()
    }
    row.appendChild(retry)

    if (ok && onNext) {
      const next = document.createElement('button')
      next.className = 'primary'
      next.textContent = more ? 'NEXT SORTIE' : 'NEXT LEVEL'
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
