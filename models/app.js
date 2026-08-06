import * as THREE from 'three'
import { CATALOG, GROUPS, MAX_VARIANTS } from './catalog.js'
import { Viewer } from './viewer.js'

/**
 * Галерея фактичних моделей гри: те, що бачиш тут, — це буквально виклики
 * buildVehicle() і білдерів пропсів з src/render/. Раніше сторінка була
 * пікером трьох вигаданих стилів і навмисно нічого не імпортувала з гри;
 * тепер її роль протилежна — бути дзеркалом гри, тому вона імпортує все.
 */

let index = 0
// спільний ракурс для всіх панелей — інакше порівнюєш не форму, а поворот
const cam = { yaw: 0.6, pitch: 0.42, zoom: 1, radius: 5, target: 1.5, fixedDist: null }
let spin = true
/** 'orbit' — вільна камера, 'fpv' — типовий бойовий ракурс: 60 м, кут ~15° */
let mode = 'orbit'

const el = {
  list: document.getElementById('list'),
  cards: document.getElementById('cards'),
  title: document.getElementById('title'),
  dims: document.getElementById('dims'),
  note: document.getElementById('note'),
  spin: document.getElementById('spin'),
  view: document.getElementById('view'),
  reset: document.getElementById('reset'),
}

// --- панелі: створюються один раз (WebGL-контексти), зайві ховаються --------

const viewers = Array.from({ length: MAX_VARIANTS }, () => {
  const card = document.createElement('div')
  card.className = 'card'
  card.innerHTML = `
    <canvas></canvas>
    <div class="bar"><b class="vlabel"></b></div>
    <div class="hint"></div>`
  el.cards.appendChild(card)
  return { card, viewer: new Viewer(card.querySelector('canvas')) }
})

// --- камера мишею -----------------------------------------------------------

const clamp = (v, a, b) => Math.min(Math.max(v, a), b)

let drag = null

el.cards.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, y: e.clientY }
})
addEventListener('pointermove', (e) => {
  if (!drag) return
  const dx = e.clientX - drag.x
  const dy = e.clientY - drag.y
  if (Math.abs(dx) + Math.abs(dy) > 3) {
    spin = false
    el.spin.classList.remove('on')
  }
  cam.yaw += dx * 0.008
  cam.pitch = clamp(cam.pitch - dy * 0.006, -0.2, 1.45)
  drag.x = e.clientX
  drag.y = e.clientY
})
addEventListener('pointerup', () => {
  drag = null
})
el.cards.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault()
    cam.zoom = clamp(cam.zoom * (1 + Math.sign(e.deltaY) * 0.1), 0.35, 4)
  },
  { passive: false },
)

// --- вибір об'єкта ----------------------------------------------------------

function select(i) {
  index = (i + CATALOG.length) % CATALOG.length
  const item = CATALOG[index]

  el.title.textContent = item.label
  el.dims.textContent = item.dims.radius
    ? `${item.dims.height} m tall · r ${item.dims.radius} m`
    : `${item.dims.length} × ${item.dims.width} × ${item.dims.height} m`
  el.note.textContent = item.note

  // понад 4 варіанти (будинки) — другий ряд, інакше картки стають смужками
  el.cards.style.gridTemplateColumns = `repeat(${Math.min(item.variants.length, 4)}, 1fr)`
  let maxR = 1
  let maxH = 1
  viewers.forEach((v, s) => {
    const variant = item.variants[s]
    v.card.style.display = variant ? '' : 'none'
    if (!variant) return
    const model = variant.build()
    const b = new THREE.Box3().setFromObject(model)
    const size = b.getSize(new THREE.Vector3())
    maxR = Math.max(maxR, Math.hypot(size.x, size.y, size.z) * 0.5)
    maxH = Math.max(maxH, size.z)
    v.viewer.setModel(model)
    v.card.querySelector('.vlabel').textContent = variant.label
    v.card.querySelector('.hint').textContent = variant.hint
  })

  applyView(maxR, maxH)
  renderList()
}

function applyView(radius = cam.radius, height = cam.target / 0.45) {
  cam.radius = radius
  cam.zoom = 1
  if (mode === 'fpv') {
    // бойовий ракурс: 60 м, пологий захід ~15° — саме так ціль видно в грі
    cam.fixedDist = 60
    cam.pitch = 0.26
    cam.target = height * 0.5
  } else {
    cam.fixedDist = null
    cam.pitch = 0.42
    cam.target = height * 0.45
  }
}

function renderList() {
  el.list.innerHTML = ''
  for (const group of GROUPS) {
    const head = document.createElement('div')
    head.className = 'grouphead'
    head.textContent = group.label
    el.list.appendChild(head)
    for (const item of CATALOG.filter((x) => x.group === group.id)) {
      const i = CATALOG.indexOf(item)
      const row = document.createElement('div')
      row.className = `item${i === index ? ' active' : ''}`
      row.innerHTML = `<span>${item.label}</span><span class="badge">${item.variants.length}</span>`
      row.addEventListener('click', () => select(i))
      el.list.appendChild(row)
    }
  }
}

// --- керування --------------------------------------------------------------

addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' || e.key === 'j') select(index + 1)
  else if (e.key === 'ArrowLeft' || e.key === 'k') select(index - 1)
  else if (e.key === 'r') el.reset.click()
  else if (e.key === 'f') el.view.click()
  else if (e.key === ' ') el.spin.click()
  else return
  e.preventDefault()
})

el.spin.addEventListener('click', () => {
  spin = !spin
  el.spin.classList.toggle('on', spin)
})
el.view.addEventListener('click', () => {
  mode = mode === 'orbit' ? 'fpv' : 'orbit'
  el.view.textContent = `View: ${mode}`
  el.view.classList.toggle('on', mode === 'fpv')
  select(index)
})
el.reset.addEventListener('click', () => select(index))

// --- цикл -------------------------------------------------------------------

let last = performance.now()
function frame(now) {
  requestAnimationFrame(frame)
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  if (spin) cam.yaw += dt * 0.35
  for (const v of viewers) {
    if (v.card.style.display !== 'none') v.viewer.render(cam)
  }
}

select(0)
requestAnimationFrame(frame)
