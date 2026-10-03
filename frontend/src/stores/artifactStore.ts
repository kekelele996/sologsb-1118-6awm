import { createStore } from 'zustand/vanilla'
import type { Artifact, Stratum } from '@/types'
import { isDepthInRange, PENDING_REASONS } from '@/types'
import { db, syncAll, syncDelete, syncPut } from '@/hooks/usePersistentStore'
import { computeLabRetry } from '@/utils/reconcile'

export interface ArtifactState {
  artifacts: Artifact[]
  loaded: boolean
  hydrate: () => Promise<void>
  save: (artifact: Artifact) => Promise<void>
  remove: (id: string) => Promise<void>
  removeByStratum: (stratumId: string) => Promise<void>
  /** 单位拆分/合并后，挂在原单位下的那批退回待核（只改状态与原因，件数与位置不挪） */
  suspendByStrata: (stratumIds: string[], reason: string) => Promise<number>
  /** 记录员核准：挂起的出土物确认入账 */
  approve: (id: string) => Promise<void>
  /** 改派单位：重新锁定地层单位并按其深度区间重新判定状态 */
  reassign: (id: string, unit: Stratum) => Promise<boolean>
  /** 整理室侧重试对账：只重算自己这份（出土物台账），工地那份不受影响 */
  retryLabSide: (strata: Stratum[]) => Promise<number>
}

export const artifactStore = createStore<ArtifactState>((set, get) => ({
  artifacts: [],
  loaded: false,
  hydrate: async () => {
    const artifacts = await syncAll<Artifact>(db.artifacts)
    artifacts.sort((a, b) => a.code.localeCompare(b.code, 'zh-Hans-CN', { numeric: true }))
    set({ artifacts, loaded: true })
  },
  save: async (artifact) => {
    await syncPut<Artifact>(db.artifacts, artifact)
    await get().hydrate()
  },
  remove: async (id) => {
    await syncDelete<Artifact>(db.artifacts, id)
    await get().hydrate()
  },
  removeByStratum: async (stratumId) => {
    const targets = get().artifacts.filter((item) => item.stratumId === stratumId)
    await Promise.all(targets.map((item) => syncDelete<Artifact>(db.artifacts, item.id)))
    await get().hydrate()
  },
  suspendByStrata: async (stratumIds, reason) => {
    const targets = get().artifacts.filter((item) => stratumIds.includes(item.stratumId))
    await Promise.all(
      targets.map((item) =>
        syncPut<Artifact>(db.artifacts, { ...item, status: 'pending', pendingReason: reason })
      )
    )
    await get().hydrate()
    return targets.length
  },
  approve: async (id) => {
    const target = get().artifacts.find((item) => item.id === id)
    if (!target) return
    await syncPut<Artifact>(db.artifacts, { ...target, status: 'registered', pendingReason: '' })
    await get().hydrate()
  },
  reassign: async (id, unit) => {
    const target = get().artifacts.find((item) => item.id === id)
    if (!target) return false
    const inRange = isDepthInRange(target.z, unit)
    await syncPut<Artifact>(db.artifacts, {
      ...target,
      stratumId: unit.id,
      trenchId: unit.trenchId,
      stratumCode: unit.code,
      status: inRange ? 'registered' : 'pending',
      pendingReason: inRange ? '' : PENDING_REASONS.depthOut
    })
    await get().hydrate()
    return inRange
  },
  retryLabSide: async (strata) => {
    const updates = computeLabRetry(get().artifacts, strata)
    await Promise.all(updates.map((item) => syncPut<Artifact>(db.artifacts, item)))
    await get().hydrate()
    return updates.length
  }
}))
