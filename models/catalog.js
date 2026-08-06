import { Target, VEHICLES } from '../src/game/targets'
import { buildVehicle } from '../src/render/vehicles'
import { BAKED_VEHICLES } from '../src/render/vehicle-data'
import { LEVELS } from '../src/level/levels'
import { PALETTES, makePropKit } from '../src/render/world'
import { BUILDING_RATIOS, BUILDING_TYPES } from '../src/render/building-data'
import { TREE_TYPES } from '../src/render/tree-data'
import {
  BUILDING_VARIANTS,
  BUSH_VARIANTS,
  BUSH_H,
  BUSH_R,
  HAY_VARIANTS,
  HAY_H,
  HAY_R,
  POLE_VARIANTS,
  POLE_H,
  TREE_VARIANTS,
  TREE_H,
  TREE_R,
} from '../src/render/props-models'

/**
 * Каталог ФАКТИЧНИХ моделей гри. Сторінка навмисно імпортує ігровий код:
 * тут немає своїх копій геометрії, тому розійтись із грою вона не може.
 *
 * Панелі техніки — це варіанти, які гра реально малює: види (target /
 * civilian / decoy) зібрані з рівнів кампанії, «під сіткою» — якщо хоч один
 * рівень ховає цей клас під маскувальну сітку. Пропси — ті самі 2–3 варіанти,
 * між якими світ обирає хешем координат.
 */

const STUB_TERRAIN = { height: () => 0 }

/** Що з техніки насправді зустрічається в кампанії і в яких видах. */
function vehicleUsage() {
  const usage = new Map()
  const specs = LEVELS.flatMap((level) => [
    ...(level.targets ?? []),
    ...(level.sorties ?? []).flatMap((s) => s.targets ?? []),
  ])
  for (const t of specs) {
    const u = usage.get(t.vehicle) ?? { kinds: new Set(), concealed: false }
    u.kinds.add(t.kind)
    if (t.concealed) u.concealed = true
    usage.set(t.vehicle, u)
  }
  return usage
}

const KIND_META = {
  target: { label: 'Target', hint: 'Ціль: військове фарбування' },
  civilian: { label: 'Civilian', hint: 'Цивільна: бежевий корпус' },
  decoy: { label: 'Decoy', hint: 'Макет: мертвий сіро-зелений, силует майже як у цілі' },
}

function vehicleVariant(cls, kind, concealed) {
  const meta = concealed
    ? { label: 'Camo net', hint: 'Під маскувальною сіткою — так стоїть у лісосмузі' }
    : KIND_META[kind]
  return {
    label: meta.label,
    hint: meta.hint,
    build: () =>
      buildVehicle(
        new Target(
          { id: `${cls}-${kind}${concealed ? '-net' : ''}`, kind, vehicle: cls, position: [0, 0], concealed },
          STUB_TERRAIN,
        ),
      ),
  }
}

const VEHICLE_NOTES = {
  motorcycle: 'Найменший силует у грі, рівні 3, 4, 8, 14',
  car: 'Цивільний трафік',
  pickup: 'Джип із відкритим кузовом',
  van: 'Санітарка — влучання в цивільну = провал',
  truck: 'Цивільна версія відрізняється кольором',
  apc: 'Гусенична, башта, часто під сіткою',
  tank: 'Найбільша ціль кампанії',
  emplacement: 'Статичне укриття, рівень 1',
}

function vehicleCatalog() {
  const usage = vehicleUsage()
  const order = ['target', 'civilian', 'decoy']
  return Object.keys(VEHICLES)
    .filter((cls) => usage.has(cls))
    .map((cls) => {
      const u = usage.get(cls)
      const p = VEHICLES[cls]
      const variants = order.filter((k) => u.kinds.has(k)).map((k) => vehicleVariant(cls, k, false))
      if (u.concealed) variants.push(vehicleVariant(cls, 'target', true))
      return {
        id: cls,
        group: 'vehicles',
        label: p.label,
        dims: { length: p.length, width: p.width, height: p.height },
        note: `${VEHICLE_NOTES[cls] ?? ''} · ${BAKED_VEHICLES[cls] ? 'GLB' : 'процедурна'}`,
        variants,
      }
    })
}

// --- наповнення карти: ті самі білдери й матеріали, що в World.buildProps ---

const kit = makePropKit(PALETTES.day)

function propCatalog() {
  const HASH_HINT = 'Варіант обирається хешем координат — карта однакова при кожному запуску'
  const prop = (id, label, dims, note, builders, names, hint = HASH_HINT) => ({
    id,
    group: 'props',
    label,
    dims,
    note,
    variants: builders.map((make, i) => ({
      label: names[i],
      hint,
      build: () => make(kit),
    })),
  })

  return [
    prop('tree', 'Tree', { height: TREE_H, radius: TREE_R }, 'Лісосмуги; тверде — зіткнення = провал',
      TREE_VARIANTS, TREE_TYPES.map((t) => t.replace('_', ' '))),
    prop('bush', 'Bush', { height: BUSH_H, radius: BUSH_R }, 'Чагарник, головне укриття цілей',
      BUSH_VARIANTS, ['Dome', 'Rock', 'Cluster']),
    prop('haystack', 'Haystack', { height: HAY_H, radius: HAY_R }, 'Круглий слід зіткнення',
      HAY_VARIANTS, ['Drum', 'Roll', 'Capped']),
    prop('pole', 'Power pole', { height: POLE_H, radius: 0.3 }, 'ЛЕП уздовж доріг; траверса теж тверда',
      POLE_VARIANTS, ['Braced', 'Steel', 'Block']),
    // кожен будинок — у власних пропорціях (фасад 10 м), як його кроїть props.ts
    prop('building', 'House', { height: '4–9', width: 'за моделлю', length: '7–14' },
      'Kenney City Kit Suburban; колайдер кроїться під модель · орієнтир висоти',
      BUILDING_VARIANTS.map((make, i) => (k) => {
        const r = BUILDING_RATIOS[i]
        return make(k, 10 * r.depthRatio, 10, 10 * r.heightRatio)
      }),
      BUILDING_TYPES.map((t) => `Type ${t.slice(1).toUpperCase()}`),
      'Тип обирає генератор карти (props.ts) — колайдер кроїться під модель'),
  ]
}

export const CATALOG = [...vehicleCatalog(), ...propCatalog()]

export const GROUPS = [
  { id: 'vehicles', label: 'Vehicles' },
  { id: 'props', label: 'World props' },
]

export const MAX_VARIANTS = Math.max(...CATALOG.map((i) => i.variants.length))
