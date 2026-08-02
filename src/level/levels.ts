import type { LevelSpec } from './types'

/**
 * Рівень — це дані. Новий рівень не потребує коду: рельєф із seed,
 * цілі з маршрутами, погода, дрон і БК.
 */
export const LEVELS: LevelSpec[] = [
  {
    id: 'l1-first-flight',
    index: 1,
    title: 'Перший виліт',
    brief:
      'Тренувальний майданчик. Злети з трави, пройди три ворота на ґрунтівці ' +
      'та влучи в навчальний макет у квадраті D4. Навантаження немає — дрон легкий і прощає.',
    droneId: 'trainer-7',
    payloadId: 'none',
    terrain: { seed: 20260801, size: 1000, amplitude: 9, featureSize: 900 },
    weather: {
      windFromDeg: 0,
      windSpeed: 0.6,
      gustStrength: 0,
      turbulence: 0.1,
      timeOfDay: 'day',
      visibility: 2200,
      fogDensity: 0.00012,
    },
    launch: { x: -60, y: -420, headingDeg: 0 },
    timeLimitS: 360,
    primaryTargetId: 'mock-hull',
    searchCells: ['D4'],
    allowAngleMode: true,
    objectives: [
      'Злетіти з трави та набрати 30 м',
      'Знайти макет у квадраті D4',
      'Утримати ціль у кадрі 1.5 с з дистанції < 80 м',
      'Уразити макет',
    ],
    targets: [
      {
        id: 'mock-hull',
        kind: 'target',
        label: 'навчальний макет',
        position: [-90, 130],
        headingDeg: 35,
        hitRadius: 4,
        height: 2.4,
        length: 6,
      },
    ],
  },

  {
    id: 'l2-convoy-road',
    index: 2,
    title: 'Ґрунтівка',
    brief:
      'Розвідка ділянки між C3 і F6. По ґрунтівці рухається ворожа вантажівка — ' +
      'тентована, довга, без причепа. Тими ж дорогами їздить цивільний транспорт: ' +
      'коротший корпус, світлий колір, часто з причепом. Дрон з легким БК: важчий за тренувальний, ' +
      'сильніше несе вітром. Зведення — після 60 м від точки зльоту.',
    droneId: 'light-7',
    payloadId: 'light',
    terrain: { seed: 776041, size: 1000, amplitude: 16, featureSize: 650 },
    weather: {
      windFromDeg: 250,
      windSpeed: 4.5,
      gustStrength: 1.8,
      turbulence: 0.5,
      timeOfDay: 'day',
      visibility: 1600,
      fogDensity: 0.00035,
    },
    launch: { x: -720, y: -640, headingDeg: 40 },
    timeLimitS: 420,
    primaryTargetId: 'truck-green',
    searchCells: ['C3', 'D3', 'D4', 'E4', 'E5', 'F5', 'F6'],
    allowAngleMode: false,
    objectives: [
      'Обшукати квадрати C3–F6',
      'Відрізнити ворожу вантажівку від цивільної',
      'Ідентифікувати ціль перед ударом',
      'Уразити ворожу вантажівку',
    ],
    targets: [
      {
        id: 'truck-green',
        kind: 'target',
        label: 'вантажівка (тентована, 8 м)',
        hitRadius: 4.5,
        height: 3.2,
        length: 8,
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
        label: 'цивільна вантажівка з причепом',
        hitRadius: 4.5,
        height: 3,
        length: 5.5,
        route: {
          points: [
            [520, 420],
            [180, 260],
            [-100, 90],
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
        label: 'легковий автомобіль',
        hitRadius: 3,
        height: 1.6,
        length: 4.4,
        route: {
          points: [
            [-300, 320],
            [60, 380],
            [380, 300],
          ],
          speed: 16,
          loop: true,
        },
      },
      {
        id: 'decoy-hull',
        kind: 'decoy',
        label: 'макет під сіткою',
        position: [210, -60],
        headingDeg: 100,
        hitRadius: 4,
        height: 2.8,
        length: 7.4,
        concealed: true,
      },
    ],
  },
]

export function getLevel(id: string): LevelSpec {
  const l = LEVELS.find((x) => x.id === id)
  if (!l) throw new Error(`unknown level: ${id}`)
  return l
}
