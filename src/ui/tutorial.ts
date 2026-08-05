/**
 * Пояснення керування при першому запуску.
 *
 * Гра свідомо не має жодних підказок у польоті — ні стрілок на ціль, ні
 * мінімапи. Саме тому базові правила треба сказати один раз і прямо:
 * інакше гравець просто не зрозуміє, що дрон не зависає сам.
 */
export class Tutorial {
  readonly root: HTMLDivElement

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div')
    this.root.className = 'screen tutorial hidden'
    parent.appendChild(this.root)
  }

  show(onClose: () => void, firstRun: boolean): void {
    this.root.innerHTML = ''
    this.root.classList.remove('hidden')

    const wrap = document.createElement('div')
    wrap.className = 'tutorial-wrap'
    wrap.innerHTML = `
      <div class="tag">${firstRun ? 'WELCOME' : 'CONTROLS'}</div>
      <h1>Flying the drone</h1>
      <p class="brief">
        You are a first-person FPV pilot. There are no target markers, no minimap and no
        autopilot — a compass, a dirty analogue video feed and what you remember from the
        briefing are all you get.
      </p>

      <div class="tut-cols">
        <section>
          <h2>Keyboard</h2>
          <table>
            <tr><td><kbd>W</kbd> <kbd>S</kbd></td><td>Throttle up / down</td></tr>
            <tr><td><kbd>A</kbd> <kbd>D</kbd></td><td>Yaw left / right</td></tr>
            <tr><td><kbd>↑</kbd> <kbd>↓</kbd></td><td>Pitch — nose up / down</td></tr>
            <tr><td><kbd>←</kbd> <kbd>→</kbd></td><td>Roll left / right</td></tr>
            <tr><td><kbd>Space</kbd></td><td>Cut the motors</td></tr>
            <tr><td><kbd>R</kbd></td><td>Restart the level</td></tr>
            <tr><td><kbd>Esc</kbd></td><td>Back to the campaign</td></tr>
          </table>
          <p class="hint">
            A gamepad works too: left stick is throttle and yaw, right stick is pitch and roll.
          </p>
        </section>

        <section>
          <h2>Four things that will kill you</h2>
          <ol>
            <li>
              <b>The drone does not hover by itself.</b> You hold the throttle. Touch it and the
              motors spin up — there is no arming button.
            </li>
            <li>
              <b>Holding a stick in ACRO keeps rotating.</b> Tap it to set an attitude, then let
              go. Only the training level holds the horizon for you.
            </li>
            <li>
              <b>Treelines, farm buildings and power lines are solid.</b> Fly into one and the
              aircraft is lost.
            </li>
            <li>
              <b>Civilian vehicles use the same roads.</b> Read the silhouette before you strike —
              hitting one fails the mission.
            </li>
          </ol>
        </section>
      </div>

      <p class="brief">
        Fly high to search a square, drop low to identify. Watch the battery and the signal
        bar — both run out, and both end the sortie.
      </p>
    `

    const start = document.createElement('button')
    start.className = 'primary'
    start.textContent = firstRun ? 'GOT IT' : 'CLOSE'
    start.onclick = () => {
      this.hide()
      onClose()
    }
    wrap.appendChild(start)

    this.root.appendChild(wrap)
  }

  hide(): void {
    this.root.classList.add('hidden')
  }
}
