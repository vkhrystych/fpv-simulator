import { describe, it, expect } from 'vitest'
import { Progress, memoryStore, emptyProgress, STORAGE_KEY, PROGRESS_VERSION } from '../src/game/progress'
import { LEVELS } from '../src/level/levels'

const L1 = LEVELS[0].id
const L2 = LEVELS[1].id
const L3 = LEVELS[2].id
/** рівень із трьома вильотами — на ньому перевіряємо проміжне збереження */
const MULTI = LEVELS.find((l) => l.sorties.length === 3)!

describe('прогрес: відкриття рівнів', () => {
  it('на старті відкритий лише перший рівень', () => {
    const p = new Progress(memoryStore())
    expect(p.isUnlocked(L1)).toBe(true)
    expect(p.isUnlocked(L2)).toBe(false)
    expect(p.unlockedLevels).toEqual([L1])
    expect(p.completedCount).toBe(0)
  })

  it('проходження рівня відкриває наступний, але не через один', () => {
    const p = new Progress(memoryStore())
    p.completeLevel(L1)
    expect(p.isCompleted(L1)).toBe(true)
    expect(p.isUnlocked(L2)).toBe(true)
    expect(p.isUnlocked(L3)).toBe(false)
  })

  it('пройдений рівень лишається відкритим для перепроходження', () => {
    const p = new Progress(memoryStore())
    p.completeLevel(L1)
    p.completeLevel(L2)
    expect(p.isUnlocked(L1)).toBe(true)
    expect(p.isUnlocked(L2)).toBe(true)
  })

  it('повторне проходження не дублює запис', () => {
    const p = new Progress(memoryStore())
    p.completeLevel(L1)
    p.completeLevel(L1)
    expect(p.completedCount).toBe(1)
  })

  it('невідомий рівень не відкривається', () => {
    const p = new Progress(memoryStore())
    expect(p.isUnlocked('немає-такого')).toBe(false)
  })
})

describe('прогрес: де продовжити', () => {
  it('без збережень — з першого рівня', () => {
    const p = new Progress(memoryStore())
    expect(p.resumeLevelId).toBe(L1)
    expect(p.resumeSortieIndex).toBe(0)
  })

  it('після проходження рівня — з наступного', () => {
    const p = new Progress(memoryStore())
    p.completeLevel(L1)
    expect(p.resumeLevelId).toBe(L2)
    expect(p.resumeSortieIndex).toBe(0)
  })

  /** відкриває шлях до рівня чесно — проходженням усіх попередніх */
  const unlockUpTo = (p: Progress, levelId: string) => {
    for (const l of LEVELS) {
      if (l.id === levelId) break
      p.completeLevel(l.id)
    }
  }

  it('виконаний виліт усередині рівня зсуває на наступний виліт', () => {
    const p = new Progress(memoryStore())
    unlockUpTo(p, MULTI.id)
    p.setCurrent(MULTI.id, 0)
    p.completeSortie(MULTI.id, 0)
    expect(p.resumeLevelId).toBe(MULTI.id)
    expect(p.resumeSortieIndex).toBe(1)
    expect(p.isCompleted(MULTI.id)).toBe(false)
  })

  it('останній виліт закриває весь рівень', () => {
    const p = new Progress(memoryStore())
    p.completeSortie(MULTI.id, MULTI.sorties.length - 1)
    expect(p.isCompleted(MULTI.id)).toBe(true)
  })

  it('провал відкидає на перший виліт, але рівень лишається відкритим', () => {
    const p = new Progress(memoryStore())
    unlockUpTo(p, MULTI.id)
    p.setCurrent(MULTI.id, 2)
    expect(p.resumeSortieIndex).toBe(2)
    p.failLevel(MULTI.id)
    expect(p.resumeLevelId).toBe(MULTI.id)
    expect(p.resumeSortieIndex).toBe(0)
    expect(p.isUnlocked(MULTI.id)).toBe(true)
    expect(p.isCompleted(MULTI.id)).toBe(false)
  })

  it('не можна опинитись «усередині» закритого рівня', () => {
    const p = new Progress(memoryStore())
    p.setCurrent(MULTI.id, 1) // рівень ще не відкритий
    expect(p.resumeLevelId).toBe(L1)
  })

  it('індекс вильоту не вилазить за межі рівня', () => {
    const store = memoryStore()
    store.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: PROGRESS_VERSION, completed: [], levelId: L1, sortieIndex: 99 }),
    )
    const p = new Progress(store)
    expect(p.resumeSortieIndex).toBe(LEVELS[0].sorties.length - 1)
  })
})

describe('прогрес: збереження між сесіями', () => {
  it('переживає перестворення на тому самому сховищі', () => {
    const store = memoryStore()
    const a = new Progress(store)
    a.completeLevel(L1)
    a.setCurrent(L2, 0)

    const b = new Progress(store)
    expect(b.isCompleted(L1)).toBe(true)
    expect(b.resumeLevelId).toBe(L2)
  })

  it('reset стирає все', () => {
    const store = memoryStore()
    const p = new Progress(store)
    p.completeLevel(L1)
    p.reset()
    expect(p.completedCount).toBe(0)
    expect(p.resumeLevelId).toBe(L1)
    expect(new Progress(store).completedCount).toBe(0)
  })

  it('битий JSON у сховищі не ламає гру', () => {
    const store = memoryStore()
    store.setItem(STORAGE_KEY, '{ це не json')
    const p = new Progress(store)
    expect(p.snapshot).toEqual(emptyProgress())
  })

  it('чужа версія формату відкидається', () => {
    const store = memoryStore()
    store.setItem(STORAGE_KEY, JSON.stringify({ version: 999, completed: [L1, L2, L3] }))
    expect(new Progress(store).completedCount).toBe(0)
  })

  it('неіснуючі рівні у збереженні відсіюються', () => {
    const store = memoryStore()
    store.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: PROGRESS_VERSION, completed: [L1, 'привид', L1], levelId: 'привид', sortieIndex: 0 }),
    )
    const p = new Progress(store)
    expect(p.snapshot.completed).toEqual([L1])
    expect(p.resumeLevelId).toBe(L2)
  })

  it('сховище, що кидає помилки, не валить гру', () => {
    const broken = {
      getItem: () => {
        throw new Error('заблоковано')
      },
      setItem: () => {
        throw new Error('квота')
      },
      removeItem: () => {
        throw new Error('ні')
      },
    }
    const p = new Progress(broken)
    expect(p.completedCount).toBe(0)
    expect(() => p.completeLevel(L1)).not.toThrow()
    expect(() => p.reset()).not.toThrow()
    // у пам'яті прогрес усе одно рухається — просто не переживе перезавантаження
    expect(p.resumeLevelId).toBe(L1)
  })

  it('snapshot — копія, а не внутрішній стан', () => {
    const p = new Progress(memoryStore())
    p.completeLevel(L1)
    p.snapshot.completed.push('підробка')
    expect(p.completedCount).toBe(1)
  })
})

describe('прогрес: проходження всієї кампанії', () => {
  it('послідовне проходження відкриває всі 15 рівнів', () => {
    const p = new Progress(memoryStore())
    for (const level of LEVELS) {
      expect(p.isUnlocked(level.id), `рівень ${level.index} мав бути відкритий`).toBe(true)
      for (let i = 0; i < level.sorties.length; i++) p.completeSortie(level.id, i)
    }
    expect(p.completedCount).toBe(LEVELS.length)
    expect(p.unlockedLevels.length).toBe(LEVELS.length)
  })

  it('після фіналу продовжувати нема куди — лишаємось на останньому', () => {
    const p = new Progress(memoryStore())
    for (const level of LEVELS) p.completeLevel(level.id)
    expect(p.resumeLevelId).toBe(LEVELS[LEVELS.length - 1].id)
  })
})

describe('UI англійською', () => {
  it('назви рівнів, цілей і бортів — латиниця', () => {
    const cyrillic = /[а-яіїєґА-ЯІЇЄҐ]/
    for (const l of LEVELS) {
      expect(cyrillic.test(l.title), `title: ${l.title}`).toBe(false)
      expect(cyrillic.test(l.brief), `brief рівня ${l.index}`).toBe(false)
      for (const o of l.objectives) expect(cyrillic.test(o), o).toBe(false)
      for (const s of l.sorties) expect(cyrillic.test(s.note), s.note).toBe(false)
      for (const t of l.targets) {
        if (t.label) expect(cyrillic.test(t.label), t.label).toBe(false)
      }
    }
  })
})

describe('перепроходження пройдених рівнів', () => {
  const completeAll = (p: Progress, upTo: number) => {
    for (let i = 0; i < upTo; i++) p.completeLevel(LEVELS[i].id)
  }

  it('пройдений рівень лишається доступним для повторного заходу', () => {
    const p = new Progress(memoryStore())
    completeAll(p, 5)
    expect(p.isUnlocked(L1)).toBe(true)
    expect(p.isCompleted(L1)).toBe(true)
  })

  it('перепроходження старого рівня НЕ відкидає курсор «продовжити» назад', () => {
    const p = new Progress(memoryStore())
    completeAll(p, 12)
    const resumeBefore = p.resumeLevelId
    expect(resumeBefore).toBe(LEVELS[12].id)

    // граємо перший рівень заново
    p.setCurrent(L1, 0)
    p.completeSortie(L1, 0)

    expect(p.resumeLevelId, 'курсор мав лишитись на першому непройденому').toBe(LEVELS[12].id)
    expect(p.completedCount).toBe(12)
  })

  it('провал під час перепроходження не забирає вже здобутий прогрес', () => {
    const p = new Progress(memoryStore())
    completeAll(p, 6)
    p.setCurrent(L2, 0)
    p.failLevel(L2)
    expect(p.completedCount).toBe(6)
    expect(p.isCompleted(L2)).toBe(true)
    expect(p.isUnlocked(LEVELS[6].id)).toBe(true)
  })

  it('коли непройдених не лишилось, курсор іде на щойно зіграний рівень', () => {
    // правило одне: «перший непройдений, а якщо таких немає — той, що щойно грав».
    // Після 100% кампанії це і є найкорисніша поведінка: продовжити звідти, де ти був.
    const p = new Progress(memoryStore())
    completeAll(p, LEVELS.length)
    expect(p.resumeLevelId).toBe(LEVELS[LEVELS.length - 1].id)
    p.completeLevel(L1)
    expect(p.resumeLevelId).toBe(L1)
    expect(p.completedCount).toBe(LEVELS.length)
  })
})
