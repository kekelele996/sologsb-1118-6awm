import { createStore } from 'zustand/vanilla'
import type { Stratum, UnitType } from '@/types'
import { PENDING_REASONS } from '@/types'
import { db, syncAll, syncDelete, syncPut } from '@/hooks/usePersistentStore'
import { artifactStore } from '@/stores/artifactStore'
import { uid } from '@/utils/id'

/** 拆分出的新单位草稿（类型、土质等继承原单位） */
export interface SplitPartDraft {
  code: string
  topDepth: number
  bottomDepth: number
}

/** 合并后的新单位草稿 */
export interface MergeDraft {
  code: string
  type: UnitType
  openLayer: string
  topDepth: number
  bottomDepth: number
}

export interface StratumState {
  strata: Stratum[]
  loaded: boolean
  hydrate: () => Promise<void>
  save: (stratum: Stratum) => Promise<void>
  remove: (id: string) => Promise<void>
  bulkSetType: (ids: string[], type: UnitType) => Promise<void>
  /** 记录员把单位拆开：原单位停用，挂在它底下的出土物退回待核；层位关系照旧按原编号留着 */
  splitUnit: (sourceId: string, parts: SplitPartDraft[]) => Promise<number>
  /** 记录员把单位并掉：原单位停用，挂在它们底下的出土物退回待核；层位关系照旧按原编号留着 */
  mergeUnits: (sourceIds: string[], draft: MergeDraft) => Promise<number>
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
  splitUnit: async (sourceId, parts) => {
    const source = get().strata.find((item) => item.id === sourceId)
    if (!source || parts.length < 2) return 0
    const rows: Stratum[] = parts.map((part) => ({
      id: uid('st'),
      trenchId: source.trenchId,
      code: part.code.trim().toUpperCase(),
      type: source.type,
      openLayer: source.openLayer,
      topDepth: part.topDepth,
      bottomDepth: part.bottomDepth,
      soil: source.soil,
      inclusions: [...source.inclusions],
      formation: source.formation,
      date: source.date,
      drawingNo: source.drawingNo,
      owner: 'site'
    }))
    await Promise.all(rows.map((row) => syncPut<Stratum>(db.strata, row)))
    await syncDelete<Stratum>(db.strata, sourceId)
    // 层位关系不改写：仍按原编号留着
    const suspended = await artifactStore.getState().suspendByStrata([sourceId], PENDING_REASONS.split)
    await get().hydrate()
    return suspended
  },
  mergeUnits: async (sourceIds, draft) => {
    const sources = get().strata.filter((item) => sourceIds.includes(item.id))
    if (sources.length < 2) return 0
    const first = [...sources].sort((a, b) => a.topDepth - b.topDepth)[0]
    const row: Stratum = {
      id: uid('st'),
      trenchId: first.trenchId,
      code: draft.code.trim().toUpperCase(),
      type: draft.type,
      openLayer: draft.openLayer.trim(),
      topDepth: draft.topDepth,
      bottomDepth: draft.bottomDepth,
      soil: first.soil,
      inclusions: [...first.inclusions],
      formation: first.formation,
      date: first.date,
      drawingNo: first.drawingNo,
      owner: 'site'
    }
    await syncPut<Stratum>(db.strata, row)
    await Promise.all(sourceIds.map((id) => syncDelete<Stratum>(db.strata, id)))
    // 层位关系不改写：仍按原编号留着
    const suspended = await artifactStore.getState().suspendByStrata(sourceIds, PENDING_REASONS.merge)
    await get().hydrate()
    return suspended
  }
}))
