import type { LevelSpec, WeatherSpec } from './types'

/**
 * Рівень — це дані. Новий рівень не потребує коду: рельєф із seed,
 * цілі з класів техніки й маршрутів, погода, дрон, БК і список вильотів.
 *
 * Прогресія: спершу літати → потім шукати → потім розрізняти → потім усе під тиском.
 * Розмір цілі і є складністю: мотоцикл треба знайти впритул і влучити в 1.8 м,
 * танк видно здалеку, але він під сіткою і його везуть у лісосмугу.
 */

const CALM: WeatherSpec = {
  windFromDeg: 0,
  windSpeed: 0.6,
  gustStrength: 0,
  turbulence: 0.1,
  timeOfDay: 'day',
  visibility: 2200,
  fogDensity: 0.00012,
}

const BREEZE: WeatherSpec = {
  windFromDeg: 250,
  windSpeed: 4.5,
  gustStrength: 1.8,
  turbulence: 0.5,
  timeOfDay: 'day',
  visibility: 1600,
  fogDensity: 0.00035,
}

const GUSTY: WeatherSpec = {
  windFromDeg: 300,
  windSpeed: 8.5,
  gustStrength: 3.4,
  turbulence: 1.1,
  timeOfDay: 'day',
  visibility: 1500,
  fogDensity: 0.0004,
}

const FOG: WeatherSpec = {
  windFromDeg: 120,
  windSpeed: 2.2,
  gustStrength: 0.8,
  turbulence: 0.4,
  timeOfDay: 'dawn',
  visibility: 700,
  fogDensity: 0.0013,
}

const DUSK: WeatherSpec = {
  windFromDeg: 200,
  windSpeed: 3.4,
  gustStrength: 1.4,
  turbulence: 0.5,
  timeOfDay: 'dusk',
  visibility: 1100,
  fogDensity: 0.0007,
}

const NIGHT: WeatherSpec = {
  windFromDeg: 40,
  windSpeed: 2.6,
  gustStrength: 1,
  turbulence: 0.35,
  timeOfDay: 'night',
  visibility: 600,
  fogDensity: 0.0011,
}

const MAP = { size: 1000, amplitude: 16, featureSize: 650 }
const BIG_MAP = { size: 2000, amplitude: 26, featureSize: 900 }

export const LEVELS: LevelSpec[] = [
  {
    id: 'l1-first-flight',
    index: 1,
    title: 'First Flight',
    brief:
      'Training range. Lift off from the grass, gain altitude and destroy the practice ' +
      'emplacement in square D4. No payload — the drone is light and forgiving. ' +
      'ACRO, like every flight: the sticks set rotation rate, release and the bank stays.',
    droneId: 'trainer-7',
    payloadId: 'none',
    terrain: { seed: 20260801, ...MAP, amplitude: 9, featureSize: 900 },
    weather: CALM,
    launch: { x: -60, y: -420, headingDeg: 0 },
    timeLimitS: 360,
    searchCells: ['D4'],
    training: true,
    objectives: [
      'Lift off from the grass and climb to 30 m',
      'Find the emplacement in square D4',
      'Hold the target in frame for 1.5 s from under 80 m',
      'Destroy the target',
    ],
    sorties: [{ targetId: 'mock-hull', note: 'Practice emplacement, square D4' }],
    targets: [
      {
        id: 'mock-hull',
        kind: 'target',
        vehicle: 'emplacement',
        label: 'practice emplacement',
        position: [-90, 130],
        headingDeg: 35,
      },
    ],
  },

  {
    id: 'l2-convoy-road',
    index: 2,
    title: 'Dirt Road',
    brief:
      'Sweep the ground between C3 and F6. A hostile truck is moving along the dirt ' +
      'road — long body, dark military paint. Civilian traffic uses the same roads: ' +
      'shorter body, lighter paint. Light payload aboard: heavier than ' +
      'the trainer and pushed harder by wind. Arms 60 m from the launch point.',
    droneId: 'light-7',
    payloadId: 'light',
    terrain: { seed: 776041, ...MAP },
    weather: BREEZE,
    launch: { x: -720, y: -640, headingDeg: 40 },
    timeLimitS: 420,
    searchCells: ['C3', 'D3', 'D4', 'E4', 'E5', 'F5', 'F6'],
    training: false,
    objectives: [
      'Search squares C3–F6',
      'Tell the hostile truck from the civilian one',
      'Identify the target before striking',
      'Destroy the hostile truck',
    ],
    sorties: [{ targetId: 'truck-green', note: 'Truck on the dirt road, squares C3–F6' }],
    targets: [
      {
        id: 'truck-green',
        kind: 'target',
        vehicle: 'truck',
        label: 'truck (tarpaulin bed)',
        route: {
          points: [
            [-380, -120],
            [-120, 40],
            [140, 150],
            [420, 210],
            [520, 420],
          ],
          speed: 9,
          loop: false,
          waitAtPoint: 4,
        },
      },
      {
        id: 'civ-truck',
        kind: 'civilian',
        vehicle: 'van',
        label: 'civilian van',
        route: {
          points: [
            [560, 360],
            [210, 205],
            [-70, 35],
            [-420, -60],
          ],
          speed: 11,
          loop: true,
          waitAtPoint: 2,
        },
      },
      {
        id: 'civ-car',
        kind: 'civilian',
        vehicle: 'car',
        route: {
          points: [
            [-330, 355],
            [30, 415],
            [350, 335],
          ],
          speed: 16,
          loop: true,
        },
      },
      {
        id: 'decoy-hull',
        kind: 'decoy',
        vehicle: 'emplacement',
        label: 'mock-up under netting',
        position: [210, -60],
        headingDeg: 100,
        concealed: true,
      },
    ],
  },

  {
    // id лишився «quad» з часів, коли ціллю був квадроцикл: перейменування
    // рівня обнулило б збережений прогрес і замкнуло послідовне відкриття
    id: 'l3-quad-track',
    index: 3,
    title: 'Ammo Runner',
    brief:
      'A hostile motorcycle is hauling ammunition along a field track in the north-east. ' +
      'It is a fraction of the size of a truck and twice as fast — from 100 m you simply ' +
      'will not see it. You will have to descend and track it along the road. ' +
      'A civilian pickup uses the same track.',
    droneId: 'light-7',
    payloadId: 'light',
    terrain: { seed: 481207, ...MAP },
    weather: CALM,
    launch: { x: -640, y: 240, headingDeg: 70 },
    timeLimitS: 420,
    searchCells: ['F2', 'G2', 'F3', 'G3', 'H3'],
    training: false,
    objectives: [
      'Search squares F2–H3',
      'Find the motorcycle — 2.1 m body',
      'Track it and lead the target',
      'Destroy the motorcycle',
    ],
    sorties: [{ targetId: 'moto-supply', note: 'Motorcycle on the field track, F2–H3' }],
    targets: [
      {
        id: 'moto-supply',
        kind: 'target',
        vehicle: 'motorcycle',
        label: 'ammunition motorcycle',
        route: {
          points: [
            [320, 620],
            [560, 560],
            [780, 430],
            [620, 330],
            [360, 400],
          ],
          speed: 11,
          loop: true,
          // дрібна ціль мусить мати вікно, коли вона стоїть: інакше влучити
          // в корпус 2.5 м на ходу — лотерея, а не навичка
          waitAtPoint: 9,
        },
      },
      {
        id: 'civ-pickup',
        kind: 'civilian',
        vehicle: 'pickup',
        route: {
          points: [
            [820, 375],
            [560, 425],
            [320, 505],
          ],
          speed: 13,
          loop: true,
          waitAtPoint: 2,
        },
      },
    ],
  },

  {
    id: 'l4-motorcycle',
    index: 4,
    title: 'Motorcycle',
    brief:
      'The smallest target in the campaign: a 2.1 m body with a kill radius under two ' +
      'metres. A courier motorcycle runs a loop in the south-west. The wind is noticeable — ' +
      'it will push you east, so build the correction in on the way there.',
    droneId: 'light-7',
    payloadId: 'light',
    terrain: { seed: 903311, ...MAP },
    weather: BREEZE,
    launch: { x: 520, y: -180, headingDeg: 230 },
    timeLimitS: 420,
    searchCells: ['B6', 'C6', 'B7', 'C7', 'D7'],
    training: false,
    objectives: [
      'Search squares B6–D7',
      'Find the motorcycle — the smallest silhouette in the game',
      'Run the attack downwind, not into it',
      'Destroy the motorcycle',
    ],
    sorties: [{ targetId: 'moto-courier', note: 'Courier motorcycle, B6–D7' }],
    targets: [
      {
        id: 'moto-courier',
        kind: 'target',
        vehicle: 'motorcycle',
        label: 'courier motorcycle',
        route: {
          points: [
            [-620, -380],
            [-420, -480],
            [-260, -620],
            [-480, -680],
            [-680, -540],
          ],
          speed: 12,
          loop: true,
          waitAtPoint: 10,
        },
      },
      {
        id: 'civ-moto',
        kind: 'civilian',
        vehicle: 'car',
        route: {
          points: [
            [-215, -675],
            [-455, -615],
            [-655, -485],
          ],
          speed: 14,
          loop: true,
        },
      },
    ],
  },

  {
    id: 'l5-two-sorties',
    index: 5,
    title: 'Two Sorties',
    brief:
      'The first level with two sorties. Truck in the north first, then a pickup in the ' +
      'south — from a different launch point. Fail either sortie and the level restarts ' +
      'from the first. The 8" airframe is noticeably sluggish: plan your braking early.',
    droneId: 'mid-8',
    payloadId: 'medium',
    terrain: { seed: 55217, ...MAP },
    weather: CALM,
    launch: { x: -780, y: 60, headingDeg: 60 },
    timeLimitS: 420,
    searchCells: ['D2', 'E2', 'E3', 'D6', 'E6', 'E7'],
    training: false,
    objectives: [
      'Sortie 1: truck in squares D2–E3',
      'Sortie 2: pickup in squares D6–E7',
      'Both sorties back to back, no failures',
    ],
    sorties: [
      { targetId: 'truck-north', note: 'Sortie 1 — truck, north (D2–E3)' },
      {
        targetId: 'pickup-south',
        note: 'Sortie 2 — pickup, south (D6–E7)',
        launch: { x: -760, y: -700, headingDeg: 40 },
      },
    ],
    targets: [
      {
        id: 'truck-north',
        kind: 'target',
        vehicle: 'truck',
        route: {
          points: [
            [-180, 620],
            [60, 700],
            [220, 560],
            [-40, 480],
          ],
          speed: 8,
          loop: true,
          waitAtPoint: 4,
        },
      },
      {
        id: 'pickup-south',
        kind: 'target',
        vehicle: 'pickup',
        route: {
          points: [
            [-200, -420],
            [40, -520],
            [180, -680],
            [-80, -720],
          ],
          speed: 12,
          loop: true,
          waitAtPoint: 3,
        },
      },
      {
        id: 'civ-van-5',
        kind: 'civilian',
        vehicle: 'van',
        route: {
          points: [
            [285, 465],
            [-35, 425],
            [-315, 505],
          ],
          speed: 12,
          loop: true,
        },
      },
    ],
  },

  {
    id: 'l6-apc-treeline',
    index: 6,
    title: 'APC in the Treeline',
    brief:
      'An APC sits under camouflage netting beside a treeline. Netting cuts detection ' +
      'range by more than half: from above it is just a smudge, and it can only be ' +
      'recognised from the side and up close. A mock-up nearby looks identical at range.',
    droneId: 'mid-8',
    payloadId: 'medium',
    terrain: { seed: 620145, ...MAP },
    weather: BREEZE,
    launch: { x: 640, y: 620, headingDeg: 210 },
    timeLimitS: 450,
    searchCells: ['C4', 'D4', 'C5', 'D5'],
    training: false,
    objectives: [
      'Search squares C4–D5',
      'Tell the APC from the mock-up',
      'Identify the target from under 80 m',
      'Destroy the APC',
    ],
    sorties: [{ targetId: 'apc-hidden', note: 'APC under netting, C4–D5' }],
    targets: [
      {
        id: 'apc-hidden',
        kind: 'target',
        vehicle: 'apc',
        label: 'APC under netting',
        position: [-380, 90],
        headingDeg: 145,
        concealed: true,
      },
      {
        id: 'decoy-apc',
        kind: 'decoy',
        vehicle: 'emplacement',
        label: 'APC mock-up',
        position: [-210, -60],
        headingDeg: 30,
        concealed: true,
      },
      {
        id: 'civ-truck-6',
        kind: 'civilian',
        vehicle: 'truck',
        route: {
          points: [
            [-600, 300],
            [-300, 180],
            [0, 60],
          ],
          speed: 10,
          loop: true,
        },
      },
    ],
  },

  {
    id: 'l7-tank',
    index: 7,
    title: 'Tank',
    brief:
      'A tank dug in at the centre of the map. The target is large and easy to see, but ' +
      'you are flying a 10" with a heavy payload: minimal thrust margin, a turning radius ' +
      'like a barge, and it simply sinks in a hard bank. Plan the run-in 300 m out.',
    droneId: 'heavy-10',
    payloadId: 'heavy',
    terrain: { seed: 118844, ...MAP },
    weather: CALM,
    launch: { x: -700, y: -720, headingDeg: 45 },
    timeLimitS: 480,
    searchCells: ['D4', 'E4', 'D5', 'E5'],
    training: false,
    objectives: [
      'Search the centre of the map',
      'Feel the inertia of a heavy airframe',
      'Run in straight, without sharp corrections',
      'Destroy the tank',
    ],
    sorties: [{ targetId: 'tank-center', note: 'Tank dug in, centre of the map' }],
    targets: [
      {
        id: 'tank-center',
        kind: 'target',
        vehicle: 'tank',
        position: [-60, 40],
        headingDeg: 260,
      },
      {
        id: 'civ-van-7',
        kind: 'civilian',
        vehicle: 'van',
        route: {
          points: [
            [-420, 240],
            [-120, 300],
            [200, 240],
          ],
          speed: 13,
          loop: true,
        },
      },
    ],
  },

  {
    id: 'l8-three-sorties',
    index: 8,
    title: 'Three Sorties',
    brief:
      'Three targets in three corners of the map, three sorties back to back: motorcycle, ' +
      'truck, APC. Every sortie is a fresh airframe from its own launch point. ' +
      'One failure and it all starts again from the motorcycle.',
    droneId: 'mid-8',
    payloadId: 'medium',
    terrain: { seed: 730992, ...MAP },
    weather: BREEZE,
    launch: { x: -760, y: -760, headingDeg: 45 },
    timeLimitS: 400,
    searchCells: ['B2', 'C2', 'F3', 'G3', 'E6', 'F6'],
    training: false,
    objectives: [
      'Sortie 1: motorcycle, north-west',
      'Sortie 2: truck, north-east',
      'Sortie 3: APC, south-east',
      'Three sorties back to back, no failures',
    ],
    sorties: [
      { targetId: 'moto-nw', note: 'Sortie 1 — motorcycle, north-west (B2–C2)' },
      {
        targetId: 'truck-ne',
        note: 'Sortie 2 — truck, north-east (F3–G3)',
        launch: { x: -60, y: 780, headingDeg: 120 },
      },
      {
        targetId: 'apc-se',
        note: 'Sortie 3 — APC, south-east (E6–F6)',
        launch: { x: 760, y: 760, headingDeg: 200 },
      },
    ],
    targets: [
      {
        id: 'moto-nw',
        kind: 'target',
        vehicle: 'motorcycle',
        route: {
          points: [
            [-620, 620],
            [-420, 700],
            [-300, 560],
            [-540, 500],
          ],
          speed: 11,
          loop: true,
          waitAtPoint: 8,
        },
      },
      {
        id: 'truck-ne',
        kind: 'target',
        vehicle: 'truck',
        route: {
          points: [
            [340, 380],
            [560, 460],
            [720, 340],
            [480, 260],
          ],
          speed: 8,
          loop: true,
          waitAtPoint: 4,
        },
      },
      {
        id: 'apc-se',
        kind: 'target',
        vehicle: 'apc',
        route: {
          points: [
            [120, -420],
            [340, -500],
            [420, -320],
            [180, -260],
          ],
          speed: 7,
          loop: true,
          waitAtPoint: 5,
        },
      },
      {
        id: 'civ-car-8',
        kind: 'civilian',
        vehicle: 'car',
        route: {
          points: [
            [-255, 505],
            [85, 425],
            [385, 325],
          ],
          speed: 15,
          loop: true,
        },
      },
    ],
  },

  {
    id: 'l9-wind',
    index: 9,
    title: 'Wind 8 m/s',
    brief:
      'Bulky payload: moderate mass, enormous frontal area. A gusting 8.5 m/s wind will ' +
      'push you the whole flight and your top speed drops by a quarter. The target is a ' +
      'truck in the open, where there is nothing to shelter behind.',
    droneId: 'light-7',
    payloadId: 'bulky',
    terrain: { seed: 344870, ...MAP, amplitude: 11 },
    weather: GUSTY,
    launch: { x: 700, y: -560, headingDeg: 300 },
    timeLimitS: 450,
    searchCells: ['C3', 'D3', 'C4', 'D4'],
    training: false,
    objectives: [
      'Search squares C3–D4',
      'Account for drift — run in with a correction',
      'Destroy the truck',
    ],
    sorties: [{ targetId: 'truck-open', note: 'Truck in the open, C3–D4' }],
    targets: [
      {
        id: 'truck-open',
        kind: 'target',
        vehicle: 'truck',
        route: {
          points: [
            [-420, 380],
            [-180, 300],
            [-120, 120],
            [-380, 180],
          ],
          speed: 8,
          loop: true,
          waitAtPoint: 4,
        },
      },
      {
        id: 'civ-pickup-9',
        kind: 'civilian',
        vehicle: 'pickup',
        route: {
          points: [
            [-75, 65],
            [-355, 5],
            [-595, 145],
          ],
          speed: 13,
          loop: true,
        },
      },
    ],
  },

  {
    id: 'l10-dusk-decoys',
    index: 10,
    title: 'Dusk',
    brief:
      'Evening light, long shadows, contrast falling away. Three similar objects sit in ' +
      'squares E4–F5: one real APC and two mock-ups. At 100 m they are identical. ' +
      'At 40 m the mock-ups have different body proportions.',
    droneId: 'mid-8',
    payloadId: 'medium',
    terrain: { seed: 209663, ...MAP },
    weather: DUSK,
    launch: { x: -720, y: 700, headingDeg: 140 },
    timeLimitS: 480,
    searchCells: ['E4', 'F4', 'E5', 'F5'],
    training: false,
    objectives: [
      'Inspect all three objects',
      'Find the one with a turret and tracks',
      'Identify the target before striking',
      'Destroy the APC',
    ],
    sorties: [{ targetId: 'apc-real', note: 'The real APC among mock-ups, E4–F5' }],
    targets: [
      {
        id: 'apc-real',
        kind: 'target',
        vehicle: 'apc',
        position: [140, 90],
        headingDeg: 75,
      },
      {
        id: 'decoy-a',
        kind: 'decoy',
        vehicle: 'emplacement',
        label: 'mock-up #1',
        position: [300, 170],
        headingDeg: 60,
      },
      {
        id: 'decoy-b',
        kind: 'decoy',
        vehicle: 'emplacement',
        label: 'mock-up #2',
        position: [200, -80],
        headingDeg: 110,
        concealed: true,
      },
    ],
  },

  {
    id: 'l11-long-range',
    index: 11,
    title: 'Long Range',
    brief:
      'The map is four times larger and the target is 2.5 km out. You are on the 13" ' +
      'long-range airframe: 12,000 mAh and a strong transmitter, but the controls feel ' +
      'like porridge — 110 ms motor lag, 140 ms video delay. Everything smooth and early.',
    droneId: 'longrange-13',
    payloadId: 'medium',
    terrain: { seed: 887301, ...BIG_MAP },
    weather: CALM,
    launch: { x: -1500, y: -1400, headingDeg: 45 },
    timeLimitS: 600,
    searchCells: ['F3', 'G3', 'F4', 'G4'],
    training: false,
    objectives: [
      'Cover 2.5 km to the target area',
      'Watch the signal bar — it falls off with distance',
      'Destroy the tank',
    ],
    sorties: [{ targetId: 'tank-far', note: 'Tank 2.5 km out, north-east' }],
    targets: [
      {
        id: 'tank-far',
        kind: 'target',
        vehicle: 'tank',
        route: {
          points: [
            [700, 500],
            [980, 420],
            [1100, 180],
            [820, 240],
          ],
          speed: 6,
          loop: true,
          waitAtPoint: 6,
        },
      },
      {
        id: 'civ-truck-11',
        kind: 'civilian',
        vehicle: 'truck',
        route: {
          points: [
            [1150, 115],
            [650, 235],
            [150, 435],
          ],
          speed: 11,
          loop: true,
        },
      },
    ],
  },

  {
    id: 'l12-night',
    index: 12,
    title: 'Night',
    brief:
      'Night airframe: monochrome camera, 120 m of visibility, three times the noise. ' +
      'You guess the terrain more than you see it. A truck is running the southern road — ' +
      'the only way to find it is low and slow.',
    droneId: 'night-8',
    payloadId: 'medium',
    terrain: { seed: 471028, ...MAP, amplitude: 13 },
    weather: NIGHT,
    launch: { x: 120, y: 780, headingDeg: 180 },
    timeLimitS: 480,
    searchCells: ['D6', 'E6', 'D7', 'E7'],
    training: false,
    objectives: [
      'Push south into squares D6–E7',
      'Fly low — otherwise you will see nothing',
      'Destroy the truck',
    ],
    sorties: [{ targetId: 'truck-night', note: 'Truck at night, D6–E7' }],
    targets: [
      {
        id: 'truck-night',
        kind: 'target',
        vehicle: 'truck',
        route: {
          points: [
            [-140, -400],
            [60, -480],
            [180, -640],
            [-80, -700],
          ],
          speed: 7,
          loop: true,
          waitAtPoint: 5,
        },
      },
      {
        id: 'civ-van-12',
        kind: 'civilian',
        vehicle: 'van',
        route: {
          points: [
            [225, -695],
            [-155, -615],
            [-475, -475],
          ],
          speed: 12,
          loop: true,
        },
      },
    ],
  },

  {
    id: 'l13-pair',
    index: 13,
    title: 'The Pair',
    brief:
      'Two sorties against armour. Tank first, then the APC — both are moving, both from ' +
      'the 10" with a heavy payload. Thrust margin is minimal: you sink in every turn, ' +
      'and half the pack goes on the climb.',
    droneId: 'heavy-10',
    payloadId: 'heavy',
    terrain: { seed: 662119, ...MAP },
    weather: BREEZE,
    launch: { x: -740, y: 720, headingDeg: 135 },
    timeLimitS: 480,
    searchCells: ['E3', 'F3', 'D6', 'E6'],
    training: false,
    objectives: [
      'Sortie 1: tank in squares E3–F3',
      'Sortie 2: APC in squares D6–E6',
      'Both sorties back to back',
    ],
    sorties: [
      { targetId: 'tank-move', note: 'Sortie 1 — tank, E3–F3' },
      {
        targetId: 'apc-move',
        note: 'Sortie 2 — APC, D6–E6',
        launch: { x: 720, y: -740, headingDeg: 315 },
      },
    ],
    targets: [
      {
        id: 'tank-move',
        kind: 'target',
        vehicle: 'tank',
        route: {
          points: [
            [120, 380],
            [340, 440],
            [420, 290],
            [180, 260],
          ],
          speed: 6,
          loop: true,
          waitAtPoint: 6,
        },
      },
      {
        id: 'apc-move',
        kind: 'target',
        vehicle: 'apc',
        route: {
          points: [
            [-180, -380],
            [40, -460],
            [120, -300],
            [-120, -260],
          ],
          speed: 7,
          loop: true,
          waitAtPoint: 5,
        },
      },
      {
        id: 'civ-truck-13',
        kind: 'civilian',
        vehicle: 'truck',
        route: {
          points: [
            [465, 225],
            [165, 135],
            [-155, 195],
          ],
          speed: 10,
          loop: true,
        },
      },
    ],
  },

  {
    id: 'l14-fog-convoy',
    index: 14,
    title: 'Fog',
    brief:
      'Dawn, 700 m of visibility, fog eating the horizon. Two sorties: a truck and a ' +
      'motorcycle. In fog the only references are roads and treelines — the compass and ' +
      'what you remember from the briefing matter more than your eyes.',
    droneId: 'mid-8',
    payloadId: 'medium',
    terrain: { seed: 158427, ...MAP },
    weather: FOG,
    launch: { x: -700, y: -200, headingDeg: 70 },
    timeLimitS: 450,
    searchCells: ['E3', 'F3', 'F5', 'G5'],
    training: false,
    objectives: [
      'Sortie 1: truck in squares E3–F3',
      'Sortie 2: motorcycle in squares F5–G5',
      'Keep your altitude — in fog the terrain shows up late',
    ],
    sorties: [
      { targetId: 'truck-fog', note: 'Sortie 1 — truck, E3–F3' },
      {
        targetId: 'moto-fog',
        note: 'Sortie 2 — motorcycle, F5–G5',
        launch: { x: -180, y: -760, headingDeg: 20 },
      },
    ],
    targets: [
      {
        id: 'truck-fog',
        kind: 'target',
        vehicle: 'truck',
        route: {
          points: [
            [80, 340],
            [300, 420],
            [420, 300],
            [180, 250],
          ],
          speed: 8,
          loop: true,
          waitAtPoint: 4,
        },
      },
      {
        id: 'moto-fog',
        kind: 'target',
        vehicle: 'motorcycle',
        route: {
          points: [
            [300, -120],
            [520, -60],
            [640, -180],
            [400, -240],
          ],
          speed: 10,
          loop: true,
          waitAtPoint: 8,
        },
      },
      {
        id: 'civ-car-14',
        kind: 'civilian',
        vehicle: 'car',
        route: {
          points: [
            [475, 245],
            [475, -55],
            [455, -295],
          ],
          speed: 14,
          loop: true,
        },
      },
    ],
  },

  {
    id: 'l15-final',
    index: 15,
    title: 'Everything at Once',
    brief:
      'The finale. Night, wind, a bulky payload on the 10" and three sorties back to ' +
      'back: APC, tank, truck. The heaviest airframe of the campaign in the worst ' +
      'conditions. One failure and all three sorties start again.',
    droneId: 'heavy-10',
    payloadId: 'bulky',
    terrain: { seed: 995003, ...MAP, amplitude: 19 },
    weather: NIGHT,
    launch: { x: -780, y: -780, headingDeg: 40 },
    timeLimitS: 420,
    searchCells: ['C3', 'D3', 'E5', 'F5', 'F7', 'G7'],
    training: false,
    objectives: [
      'Sortie 1: APC, squares C3–D3',
      'Sortie 2: tank, squares E5–F5',
      'Sortie 3: truck, squares F7–G7',
      'Three sorties back to back, at night, in wind',
    ],
    sorties: [
      { targetId: 'apc-final', note: 'Sortie 1 — APC, C3–D3' },
      {
        targetId: 'tank-final',
        note: 'Sortie 2 — tank, E5–F5',
        launch: { x: 760, y: 700, headingDeg: 215 },
      },
      {
        targetId: 'truck-final',
        note: 'Sortie 3 — truck, F7–G7',
        launch: { x: -760, y: 720, headingDeg: 135 },
      },
    ],
    targets: [
      {
        id: 'apc-final',
        kind: 'target',
        vehicle: 'apc',
        route: {
          points: [
            [-420, 380],
            [-220, 440],
            [-140, 290],
            [-380, 260],
          ],
          speed: 7,
          loop: true,
          waitAtPoint: 5,
        },
      },
      {
        id: 'tank-final',
        kind: 'target',
        vehicle: 'tank',
        route: {
          points: [
            [80, -120],
            [300, -60],
            [400, -200],
            [160, -260],
          ],
          speed: 6,
          loop: true,
          waitAtPoint: 6,
        },
      },
      {
        id: 'truck-final',
        kind: 'target',
        vehicle: 'truck',
        route: {
          points: [
            [320, -620],
            [540, -560],
            [660, -700],
            [400, -760],
          ],
          speed: 8,
          loop: true,
          waitAtPoint: 4,
        },
      },
      {
        id: 'civ-van-15',
        kind: 'civilian',
        vehicle: 'van',
        route: {
          points: [
            [-85, 235],
            [135, -175],
            [375, -675],
          ],
          speed: 12,
          loop: true,
        },
      },
    ],
  },
]

export function getLevel(id: string): LevelSpec {
  const l = LEVELS.find((x) => x.id === id)
  if (!l) throw new Error(`unknown level: ${id}`)
  return l
}
