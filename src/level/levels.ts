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
    title: 'Перший виліт',
    brief:
      'Тренувальний майданчик. Злети з трави, набери висоту й уражай навчальне укриття ' +
      'у квадраті D4. Навантаження немає — дрон легкий і прощає. Режим ANGLE: ' +
      'дрон сам тримає горизонт, стіки задають кут нахилу.',
    droneId: 'trainer-7',
    payloadId: 'none',
    terrain: { seed: 20260801, ...MAP, amplitude: 9, featureSize: 900 },
    weather: CALM,
    launch: { x: -60, y: -420, headingDeg: 0 },
    timeLimitS: 360,
    searchCells: ['D4'],
    allowAngleMode: true,
    objectives: [
      'Злетіти з трави та набрати 30 м',
      'Знайти укриття у квадраті D4',
      'Утримати ціль у кадрі 1.5 с з дистанції < 80 м',
      'Уразити ціль',
    ],
    sorties: [{ targetId: 'mock-hull', note: 'Навчальне укриття, квадрат D4' }],
    targets: [
      {
        id: 'mock-hull',
        kind: 'target',
        vehicle: 'emplacement',
        label: 'навчальне укриття',
        position: [-90, 130],
        headingDeg: 35,
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
      'коротший корпус, світлий колір, часто з причепом. Дрон з легким БК: важчий за ' +
      'тренувальний, сильніше несе вітром. Зведення — після 60 м від точки зльоту.',
    droneId: 'light-7',
    payloadId: 'light',
    terrain: { seed: 776041, ...MAP },
    weather: BREEZE,
    launch: { x: -720, y: -640, headingDeg: 40 },
    timeLimitS: 420,
    searchCells: ['C3', 'D3', 'D4', 'E4', 'E5', 'F5', 'F6'],
    allowAngleMode: false,
    objectives: [
      'Обшукати квадрати C3–F6',
      'Відрізнити ворожу вантажівку від цивільної',
      'Ідентифікувати ціль перед ударом',
      'Уразити ворожу вантажівку',
    ],
    sorties: [{ targetId: 'truck-green', note: 'Вантажівка на ґрунтівці, квадрати C3–F6' }],
    targets: [
      {
        id: 'truck-green',
        kind: 'target',
        vehicle: 'truck',
        label: 'вантажівка (тентована)',
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
        label: 'цивільний мікроавтобус',
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
        label: 'макет під сіткою',
        position: [210, -60],
        headingDeg: 100,
        concealed: true,
      },
    ],
  },

  {
    id: 'l3-quad-track',
    index: 3,
    title: 'Квадроцикл',
    brief:
      'Ворожий квадроцикл возить боєкомплект польовою дорогою на північному сході. ' +
      'Він удвічі менший за вантажівку і вдвічі швидший — з висоти 100 м ти його просто ' +
      'не побачиш. Доведеться спускатись і вести ціль по дорозі. ' +
      'Тією ж дорогою їздить цивільний пікап.',
    droneId: 'light-7',
    payloadId: 'light',
    terrain: { seed: 481207, ...MAP },
    weather: CALM,
    launch: { x: -640, y: 240, headingDeg: 70 },
    timeLimitS: 420,
    searchCells: ['F2', 'G2', 'F3', 'G3', 'H3'],
    allowAngleMode: false,
    objectives: [
      'Обшукати квадрати F2–H3',
      'Знайти квадроцикл — корпус 2.5 м',
      'Вести ціль і врахувати упередження',
      'Уразити квадроцикл',
    ],
    sorties: [{ targetId: 'quad-supply', note: 'Квадроцикл на польовій дорозі, F2–H3' }],
    targets: [
      {
        id: 'quad-supply',
        kind: 'target',
        vehicle: 'quad',
        label: 'квадроцикл із БК',
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
    title: 'Мотоцикл',
    brief:
      'Найменша ціль кампанії: корпус 2.1 м, радіус ураження менше двох метрів. ' +
      'Мотоцикл-зв’язківець курсує на південному заході. Вітер помітний — на заході ' +
      'тебе зноситиме, закладай поправку ще на підході.',
    droneId: 'light-7',
    payloadId: 'light',
    terrain: { seed: 903311, ...MAP },
    weather: BREEZE,
    launch: { x: 520, y: -180, headingDeg: 230 },
    timeLimitS: 420,
    searchCells: ['B6', 'C6', 'B7', 'C7', 'D7'],
    allowAngleMode: false,
    objectives: [
      'Обшукати квадрати B6–D7',
      'Знайти мотоцикл — найменший силует у грі',
      'Зайти по вітру, а не проти нього',
      'Уразити мотоцикл',
    ],
    sorties: [{ targetId: 'moto-courier', note: 'Мотоцикл-зв’язківець, B6–D7' }],
    targets: [
      {
        id: 'moto-courier',
        kind: 'target',
        vehicle: 'motorcycle',
        label: 'мотоцикл зв’язку',
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
    title: 'Два вильоти',
    brief:
      'Перший рівень із двома вильотами. Спочатку вантажівка на півночі, потім пікап ' +
      'на півдні — з іншої точки зльоту. Провалиш будь-який виліт — рівень починається ' +
      'з першого. Дрон 8": помітно в’ялий, гальмувати треба планувати заздалегідь.',
    droneId: 'mid-8',
    payloadId: 'medium',
    terrain: { seed: 55217, ...MAP },
    weather: CALM,
    launch: { x: -780, y: 60, headingDeg: 60 },
    timeLimitS: 420,
    searchCells: ['D2', 'E2', 'E3', 'D6', 'E6', 'E7'],
    allowAngleMode: false,
    objectives: [
      'Виліт 1: вантажівка в квадратах D2–E3',
      'Виліт 2: пікап у квадратах D6–E7',
      'Обидва вильоти поспіль, без провалів',
    ],
    sorties: [
      { targetId: 'truck-north', note: 'Виліт 1 — вантажівка, північ (D2–E3)' },
      {
        targetId: 'pickup-south',
        note: 'Виліт 2 — пікап, південь (D6–E7)',
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
    title: 'БМП у лісосмузі',
    brief:
      'БМП стоїть під маскувальною сіткою біля лісосмуги. Сітка ріже дистанцію ' +
      'виявлення більш ніж удвічі: зверху це просто пляма, впізнати можна лише збоку ' +
      'і зблизька. Поруч — макет, який здалеку виглядає так само.',
    droneId: 'mid-8',
    payloadId: 'medium',
    terrain: { seed: 620145, ...MAP },
    weather: BREEZE,
    launch: { x: 640, y: 620, headingDeg: 210 },
    timeLimitS: 450,
    searchCells: ['C4', 'D4', 'C5', 'D5'],
    allowAngleMode: false,
    objectives: [
      'Обшукати квадрати C4–D5',
      'Розрізнити БМП і макет',
      'Ідентифікувати ціль з дистанції < 80 м',
      'Уразити БМП',
    ],
    sorties: [{ targetId: 'apc-hidden', note: 'БМП під сіткою, C4–D5' }],
    targets: [
      {
        id: 'apc-hidden',
        kind: 'target',
        vehicle: 'apc',
        label: 'БМП під сіткою',
        position: [-380, 90],
        headingDeg: 145,
        concealed: true,
      },
      {
        id: 'decoy-apc',
        kind: 'decoy',
        vehicle: 'emplacement',
        label: 'макет БМП',
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
    title: 'Танк',
    brief:
      'Танк на позиції в центрі карти. Ціль велика й помітна, але тобі дали 10" ' +
      'з важким БК: запас тяги мінімальний, розворот радіусом як у баржі, а на ' +
      'різкому нахилі дрон просто тоне. Плануй захід за 300 м.',
    droneId: 'heavy-10',
    payloadId: 'heavy',
    terrain: { seed: 118844, ...MAP },
    weather: CALM,
    launch: { x: -700, y: -720, headingDeg: 45 },
    timeLimitS: 480,
    searchCells: ['D4', 'E4', 'D5', 'E5'],
    allowAngleMode: false,
    objectives: [
      'Обшукати центр карти',
      'Відчути інерцію важкого борта',
      'Зайти по прямій, без різких поправок',
      'Уразити танк',
    ],
    sorties: [{ targetId: 'tank-center', note: 'Танк на позиції, центр карти' }],
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
    title: 'Три вильоти',
    brief:
      'Три цілі в трьох кутах карти, три вильоти поспіль: квадроцикл, вантажівка, БМП. ' +
      'Кожен виліт — свіжий борт і своя точка зльоту. Один провал — і все спочатку, ' +
      'з квадроцикла.',
    droneId: 'mid-8',
    payloadId: 'medium',
    terrain: { seed: 730992, ...MAP },
    weather: BREEZE,
    launch: { x: -760, y: -760, headingDeg: 45 },
    timeLimitS: 400,
    searchCells: ['B2', 'C2', 'F3', 'G3', 'E6', 'F6'],
    allowAngleMode: false,
    objectives: [
      'Виліт 1: квадроцикл, північний захід',
      'Виліт 2: вантажівка, північний схід',
      'Виліт 3: БМП, південний схід',
      'Три вильоти поспіль без провалів',
    ],
    sorties: [
      { targetId: 'quad-nw', note: 'Виліт 1 — квадроцикл, північний захід (B2–C2)' },
      {
        targetId: 'truck-ne',
        note: 'Виліт 2 — вантажівка, північний схід (F3–G3)',
        launch: { x: -60, y: 780, headingDeg: 120 },
      },
      {
        targetId: 'apc-se',
        note: 'Виліт 3 — БМП, південний схід (E6–F6)',
        launch: { x: 760, y: 760, headingDeg: 200 },
      },
    ],
    targets: [
      {
        id: 'quad-nw',
        kind: 'target',
        vehicle: 'quad',
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
    title: 'Вітер 8 м/с',
    brief:
      'Об’ємний БК: маса помірна, а от площа величезна. Вітер 8.5 м/с із поривами ' +
      'зноситиме тебе весь політ, максималка просяде на чверть. Ціль — вантажівка ' +
      'на відкритій ділянці, де ховатись від вітру нема за чим.',
    droneId: 'light-7',
    payloadId: 'bulky',
    terrain: { seed: 344870, ...MAP, amplitude: 11 },
    weather: GUSTY,
    launch: { x: 700, y: -560, headingDeg: 300 },
    timeLimitS: 450,
    searchCells: ['C3', 'D3', 'C4', 'D4'],
    allowAngleMode: false,
    objectives: [
      'Обшукати квадрати C3–D4',
      'Врахувати знос — заходити треба з поправкою',
      'Уразити вантажівку',
    ],
    sorties: [{ targetId: 'truck-open', note: 'Вантажівка на відкритій ділянці, C3–D4' }],
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
    title: 'Сутінки',
    brief:
      'Вечірнє світло, довгі тіні, контраст падає. У квадратах E4–F5 стоять три ' +
      'схожі об’єкти: один — справжня БМП, два — макети. З 100 м вони однакові. ' +
      'З 40 м у макетів інші пропорції корпуса.',
    droneId: 'mid-8',
    payloadId: 'medium',
    terrain: { seed: 209663, ...MAP },
    weather: DUSK,
    launch: { x: -720, y: 700, headingDeg: 140 },
    timeLimitS: 480,
    searchCells: ['E4', 'F4', 'E5', 'F5'],
    allowAngleMode: false,
    objectives: [
      'Оглянути всі три об’єкти',
      'Знайти той, що має башту й гусениці',
      'Ідентифікувати ціль перед ударом',
      'Уразити БМП',
    ],
    sorties: [{ targetId: 'apc-real', note: 'Справжня БМП серед макетів, E4–F5' }],
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
        label: 'макет №1',
        position: [300, 170],
        headingDeg: 60,
      },
      {
        id: 'decoy-b',
        kind: 'decoy',
        vehicle: 'emplacement',
        label: 'макет №2',
        position: [200, -80],
        headingDeg: 110,
        concealed: true,
      },
    ],
  },

  {
    id: 'l11-long-range',
    index: 11,
    title: 'Далекий рейд',
    brief:
      'Карта вчетверо більша, ціль за 2.5 км. Борт — 13" далекобійний: 12 000 mAh ' +
      'і потужний передавач, але керування «через кисіль» — лаг мотора 110 мс, ' +
      'затримка відео 140 мс. Усе робиться плавно й заздалегідь.',
    droneId: 'longrange-13',
    payloadId: 'medium',
    terrain: { seed: 887301, ...BIG_MAP },
    weather: CALM,
    launch: { x: -1500, y: -1400, headingDeg: 45 },
    timeLimitS: 600,
    searchCells: ['F3', 'G3', 'F4', 'G4'],
    allowAngleMode: false,
    objectives: [
      'Пройти 2.5 км до району цілі',
      'Стежити за рівнем сигналу — він падає з дистанцією',
      'Уразити танк',
    ],
    sorties: [{ targetId: 'tank-far', note: 'Танк за 2.5 км, північний схід' }],
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
    title: 'Ніч',
    brief:
      'Нічний борт: камера чорно-біла, видимість 120 м, шум утричі більший. ' +
      'Рельєф ти радше вгадуєш, ніж бачиш. Вантажівка йде дорогою на південь — ' +
      'знайти її можна лише низько й повільно.',
    droneId: 'night-8',
    payloadId: 'medium',
    terrain: { seed: 471028, ...MAP, amplitude: 13 },
    weather: NIGHT,
    launch: { x: 120, y: 780, headingDeg: 180 },
    timeLimitS: 480,
    searchCells: ['D6', 'E6', 'D7', 'E7'],
    allowAngleMode: false,
    objectives: [
      'Пройти на південь у квадрати D6–E7',
      'Літати низько — інакше нічого не побачиш',
      'Уразити вантажівку',
    ],
    sorties: [{ targetId: 'truck-night', note: 'Вантажівка вночі, D6–E7' }],
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
    title: 'Пара',
    brief:
      'Два вильоти по бронетехніці. Спершу танк, потім БМП — обидві машини рухаються, ' +
      'обидві під важким БК на 10". Запас тяги мінімальний: на розвороті ти тонеш, ' +
      'на набір висоти йде половина заряду.',
    droneId: 'heavy-10',
    payloadId: 'heavy',
    terrain: { seed: 662119, ...MAP },
    weather: BREEZE,
    launch: { x: -740, y: 720, headingDeg: 135 },
    timeLimitS: 480,
    searchCells: ['E3', 'F3', 'D6', 'E6'],
    allowAngleMode: false,
    objectives: [
      'Виліт 1: танк у квадратах E3–F3',
      'Виліт 2: БМП у квадратах D6–E6',
      'Обидва вильоти поспіль',
    ],
    sorties: [
      { targetId: 'tank-move', note: 'Виліт 1 — танк, E3–F3' },
      {
        targetId: 'apc-move',
        note: 'Виліт 2 — БМП, D6–E6',
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
    title: 'Туман',
    brief:
      'Світанок, видимість 700 м, туман з’їдає горизонт. Два вильоти: вантажівка ' +
      'і квадроцикл. У тумані орієнтуватись можна лише по дорогах і лісосмугах — ' +
      'компас і пам’ять про брифінг важать більше, ніж очі.',
    droneId: 'mid-8',
    payloadId: 'medium',
    terrain: { seed: 158427, ...MAP },
    weather: FOG,
    launch: { x: -700, y: -200, headingDeg: 70 },
    timeLimitS: 450,
    searchCells: ['E3', 'F3', 'F5', 'G5'],
    allowAngleMode: false,
    objectives: [
      'Виліт 1: вантажівка в квадратах E3–F3',
      'Виліт 2: квадроцикл у квадратах F5–G5',
      'Тримати висоту — у тумані рельєф видно пізно',
    ],
    sorties: [
      { targetId: 'truck-fog', note: 'Виліт 1 — вантажівка, E3–F3' },
      {
        targetId: 'quad-fog',
        note: 'Виліт 2 — квадроцикл, F5–G5',
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
        id: 'quad-fog',
        kind: 'target',
        vehicle: 'quad',
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
    title: 'Все разом',
    brief:
      'Фінал. Ніч, вітер, об’ємний БК на 10" і три вильоти поспіль: БМП, танк, ' +
      'вантажівка. Найважчий борт кампанії у найгірших умовах. Один провал — ' +
      'і всі три вильоти спочатку.',
    droneId: 'heavy-10',
    payloadId: 'bulky',
    terrain: { seed: 995003, ...MAP, amplitude: 19 },
    weather: NIGHT,
    launch: { x: -780, y: -780, headingDeg: 40 },
    timeLimitS: 420,
    searchCells: ['C3', 'D3', 'E5', 'F5', 'F7', 'G7'],
    allowAngleMode: false,
    objectives: [
      'Виліт 1: БМП, квадрати C3–D3',
      'Виліт 2: танк, квадрати E5–F5',
      'Виліт 3: вантажівка, квадрати F7–G7',
      'Три вильоти поспіль, вночі, з вітром',
    ],
    sorties: [
      { targetId: 'apc-final', note: 'Виліт 1 — БМП, C3–D3' },
      {
        targetId: 'tank-final',
        note: 'Виліт 2 — танк, E5–F5',
        launch: { x: 760, y: 700, headingDeg: 215 },
      },
      {
        targetId: 'truck-final',
        note: 'Виліт 3 — вантажівка, F7–G7',
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
