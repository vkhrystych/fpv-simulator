import { LEVELS } from '../level/levels'

/**
 * Прогрес кампанії в localStorage.
 *
 * Сховище навмисно за інтерфейсом: у тестах воно в пам'яті, у браузері —
 * localStorage, і жоден із них не є обов'язковим. Приватний режим,
 * заблоковані куки чи переповнена квота не повинні ламати гру —
 * у найгіршому випадку прогрес просто не переживе перезавантаження.
 */
export const STORAGE_KEY = 'fpvsim.progress'
/** Підняти при несумісній зміні формату — старі збереження тоді відкидаються. */
export const PROGRESS_VERSION = 1

export interface ProgressStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface ProgressData {
  version: number
  /** id пройдених рівнів */
  completed: string[]
  /** де гравець зупинився */
  levelId: string | null
  sortieIndex: number
  /** чи бачив пояснення керування */
  seenTutorial: boolean
}

export const emptyProgress = (): ProgressData => ({
  version: PROGRESS_VERSION,
  completed: [],
  levelId: null,
  sortieIndex: 0,
  seenTutorial: false,
})

/** Сховище в пам'яті — для тестів і як запасний варіант у браузері. */
export function memoryStore(): ProgressStore {
  const map = new Map<string, string>()
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  }
}

/** localStorage, якщо він реально працює; інакше пам'ять. */
export function defaultStore(): ProgressStore {
  try {
    const probe = '__fpvsim_probe__'
    localStorage.setItem(probe, '1')
    localStorage.removeItem(probe)
    return localStorage
  } catch {
    return memoryStore()
  }
}

export class Progress {
  private data: ProgressData

  constructor(private store: ProgressStore = defaultStore()) {
    this.data = this.read()
  }

  /** Читання ніколи не кидає: будь-яке сміття в сховищі = чистий прогрес. */
  private read(): ProgressData {
    try {
      const raw = this.store.getItem(STORAGE_KEY)
      if (!raw) return emptyProgress()
      const parsed = JSON.parse(raw) as Partial<ProgressData>
      if (parsed?.version !== PROGRESS_VERSION) return emptyProgress()

      const known = new Set(LEVELS.map((l) => l.id))
      const completed = Array.isArray(parsed.completed)
        ? [...new Set(parsed.completed.filter((id) => known.has(id)))]
        : []
      const levelId = typeof parsed.levelId === 'string' && known.has(parsed.levelId) ? parsed.levelId : null
      const sortieIndex = Number.isInteger(parsed.sortieIndex) ? Math.max(0, parsed.sortieIndex as number) : 0

      return { version: PROGRESS_VERSION, completed, levelId, sortieIndex, seenTutorial: parsed.seenTutorial === true }
    } catch {
      return emptyProgress()
    }
  }

  /** Запис теж ніколи не кидає: переповнена квота не має ламати політ. */
  private write(): void {
    try {
      this.store.setItem(STORAGE_KEY, JSON.stringify(this.data))
    } catch {
      /* прогрес не збережеться — гра працює далі */
    }
  }

  get snapshot(): ProgressData {
    return { ...this.data, completed: [...this.data.completed] }
  }

  isCompleted(levelId: string): boolean {
    return this.data.completed.includes(levelId)
  }

  /**
   * Рівень відкритий, якщо він перший, уже пройдений, або пройдений попередній.
   * Пропускати рівні не можна — кампанія побудована як прогресія навичок.
   */
  isUnlocked(levelId: string): boolean {
    const index = LEVELS.findIndex((l) => l.id === levelId)
    if (index < 0) return false
    if (index === 0 || this.isCompleted(levelId)) return true
    return this.isCompleted(LEVELS[index - 1].id)
  }

  get unlockedLevels(): string[] {
    return LEVELS.filter((l) => this.isUnlocked(l.id)).map((l) => l.id)
  }

  /** Рівень, з якого логічно продовжити. */
  get resumeLevelId(): string {
    if (this.data.levelId && this.isUnlocked(this.data.levelId)) return this.data.levelId
    const next = LEVELS.find((l) => !this.isCompleted(l.id))
    return (next ?? LEVELS[LEVELS.length - 1]).id
  }

  get resumeSortieIndex(): number {
    const level = LEVELS.find((l) => l.id === this.resumeLevelId)
    if (!level) return 0
    return Math.min(this.data.sortieIndex, level.sorties.length - 1)
  }

  /** Запам'ятати, де гравець зараз. */
  setCurrent(levelId: string, sortieIndex: number): void {
    this.data.levelId = levelId
    this.data.sortieIndex = Math.max(0, sortieIndex)
    this.write()
  }

  /** Виліт виконано — рухаємось далі всередині рівня. */
  completeSortie(levelId: string, sortieIndex: number): void {
    const level = LEVELS.find((l) => l.id === levelId)
    if (!level) return
    if (sortieIndex + 1 < level.sorties.length) {
      this.setCurrent(levelId, sortieIndex + 1)
    } else {
      this.completeLevel(levelId)
    }
  }

  /**
   * Рівень пройдено повністю: відкриваємо наступний.
   *
   * Курсор «продовжити» ставимо на перший НЕпройдений рівень, а не просто
   * на наступний за списком. Інакше перепроходження першого рівня заради
   * розваги відкидало б гравця з дванадцятого назад на другий.
   */
  completeLevel(levelId: string): void {
    if (!this.data.completed.includes(levelId)) this.data.completed.push(levelId)
    const firstUnfinished = LEVELS.find((l) => !this.isCompleted(l.id))
    this.data.levelId = firstUnfinished ? firstUnfinished.id : levelId
    this.data.sortieIndex = 0
    this.write()
  }

  /** Провал вильоту відкидає рівень на початок — але сам рівень лишається відкритим. */
  failLevel(levelId: string): void {
    this.setCurrent(levelId, 0)
  }

  reset(): void {
    this.data = emptyProgress()
    try {
      this.store.removeItem(STORAGE_KEY)
    } catch {
      /* нічого страшного */
    }
  }

  get completedCount(): number {
    return this.data.completed.length
  }

  /** Пояснення керування показуємо один раз — далі лише за запитом. */
  get seenTutorial(): boolean {
    return this.data.seenTutorial
  }

  markTutorialSeen(): void {
    if (this.data.seenTutorial) return
    this.data.seenTutorial = true
    this.write()
  }
}
