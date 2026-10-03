import { createStore } from 'zustand/vanilla'
import type { Artifact, ArtifactCategory, Completeness, PendingReason, Stratum } from '@/types'
import { judgeRegistration, markConfirmed, markPending } from '@/domain/registration'
import { artifactsToReturn } from '@/domain/reorganize'
import type { RegistrationVerdict } from '@/domain/registration'
import { db, syncAll, syncDelete, syncPut } from '@/hooks/usePersistentStore'
import { uid } from '@/utils/id'

/** 整理室登记入参（只含整理室持有的字段：器物编号、件数、临时存放等） */
export interface RegisterInput {
  id?: string
  stratumId: string
  code: string
  category: ArtifactCategory
  count: number
  completeness: Completeness
  x: number
  y: number
  z: number
  date: string
  collector: string
  tempLocation: string
}

export interface ArtifactState {
  artifacts: Artifact[]
  loaded: boolean
  hydrate: () => Promise<void>
  save: (artifact: Artifact) => Promise<void>
  remove: (id: string) => Promise<void>
  removeByStratum: (stratumId: string) => Promise<void>
  /** 登记：先认单位号再核深度，越界挂起等记录员核；件数与位置按填写保存，流程不改动 */
  register: (input: RegisterInput, unit: Stratum | null) => Promise<{ row: Artifact; verdict: RegistrationVerdict }>
  /** 记录员核定通过：仅状态转已确认 */
  confirm: (id: string) => Promise<void>
  /** 单位拆并后退回待核：只改状态字段，件数与临时存放不挪；返回退回条数 */
  returnToPendingByStratum: (stratumId: string, reason: PendingReason) => Promise<number>
  /** 对账裁定改挂：把认某单位号的出土物改挂到指定在册单位，按深度重新判定状态 */
  reassignUnit: (unitCode: string, target: Stratum) => Promise<number>
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
  register: async (input, unit) => {
    const verdict = judgeRegistration(unit, input.z)
    const row: Artifact = {
      ...input,
      id: input.id ?? uid('af'),
      owner: 'lab',
      unitCode: unit?.code ?? '',
      status: verdict.status,
      pendingReason: verdict.pendingReason
    }
    await syncPut<Artifact>(db.artifacts, row)
    await get().hydrate()
    return { row, verdict }
  },
  confirm: async (id) => {
    const target = get().artifacts.find((item) => item.id === id)
    if (!target) return
    await syncPut<Artifact>(db.artifacts, markConfirmed(target))
    await get().hydrate()
  },
  returnToPendingByStratum: async (stratumId, reason) => {
    const targets = artifactsToReturn(get().artifacts, stratumId)
    await Promise.all(targets.map((item) => syncPut<Artifact>(db.artifacts, markPending(item, reason))))
    await get().hydrate()
    return targets.length
  },
  reassignUnit: async (unitCode, target) => {
    const targets = get().artifacts.filter((item) => item.unitCode === unitCode)
    await Promise.all(
      targets.map((item) => {
        const verdict = judgeRegistration(target, item.z)
        return syncPut<Artifact>(db.artifacts, {
          ...item,
          stratumId: target.id,
          unitCode: target.code,
          status: verdict.status,
          pendingReason: verdict.pendingReason
        })
      })
    )
    await get().hydrate()
    return targets.length
  }
}))
