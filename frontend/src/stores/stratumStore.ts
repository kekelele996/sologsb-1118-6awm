import { createStore } from 'zustand/vanilla'
import type { Stratum, UnitType } from '@/types'
import { planMerge, planSplit, type SplitPart } from '@/domain/reorganize'
import { db, syncAll, syncDelete, syncPut } from '@/hooks/usePersistentStore'
import { artifactStore } from '@/stores/artifactStore'
import { uid } from '@/utils/id'

export interface StratumState {
  strata: Stratum[]
  loaded: boolean
  hydrate: () => Promise<void>
  save: (stratum: Stratum) => Promise<void>
  remove: (id: string) => Promise<void>
  bulkSetType: (ids: string[], type: UnitType) => Promise<void>
  /** 拆分单位：原单位转「已拆分」保留原编号，挂在底下的出土物退回待核；层位关系照旧不改 */
  split: (sourceId: string, parts: SplitPart[]) => Promise<{ returned: number }>
  /** 并掉单位：原单位转「已并掉」记录去向，挂在底下的出土物退回待核；层位关系照旧不改 */
  merge: (sourceId: string, targetId: string) => Promise<{ returned: number }>
}

export const stratumStore = createStore<StratumState>((set, get) => ({
  strata: [],
  loaded: false,
  hydrate: async () => {
    const strata = await syncAll<Stratum>(db.strata)
    strata.sort((a, b) => (a.topDepth === b.topDepth ? a.code.localeCompare(b.code, 'zh-Hans-CN') : a.topDepth - b.topDepth))
    set({ strata, loaded: true })
  },
  save: async (stratum) => {
    await syncPut<Stratum>(db.strata, stratum)
    await get().hydrate()
  },
  remove: async (id) => {
    await syncDelete<Stratum>(db.strata, id)
    await get().hydrate()
  },
  bulkSetType: async (ids, type) => {
    const targets = get().strata.filter((item) => ids.includes(item.id))
    await Promise.all(targets.map((item) => syncPut<Stratum>(db.strata, { ...item, type })))
    await get().hydrate()
  },
  split: async (sourceId, parts) => {
    const source = get().strata.find((item) => item.id === sourceId)
    if (!source || source.lifecycle !== 'active' || parts.length < 2) return { returned: 0 }
    const plan = planSplit(source, parts, () => uid('st'))
    await syncPut<Stratum>(db.strata, plan.archived)
    await Promise.all(plan.created.map((item) => syncPut<Stratum>(db.strata, item)))
    // 整理室挂在原单位底下的那批退回待核；层位关系按原编号保留，不做任何改写
    const returned = await artifactStore.getState().returnToPendingByStratum(sourceId, 'unit-split')
    await get().hydrate()
    return { returned }
  },
  merge: async (sourceId, targetId) => {
    const source = get().strata.find((item) => item.id === sourceId)
    const target = get().strata.find((item) => item.id === targetId)
    if (!source || !target || source.lifecycle !== 'active' || target.lifecycle !== 'active') return { returned: 0 }
    await syncPut<Stratum>(db.strata, planMerge(source, target))
    const returned = await artifactStore.getState().returnToPendingByStratum(sourceId, 'unit-merged')
    await get().hydrate()
    return { returned }
  }
}))
