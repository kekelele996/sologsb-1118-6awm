import { createStore } from 'zustand/vanilla'
import type { Artifact, Mismatch, ReconcileRun } from '@/types'
import { applyLabReport, diffByUnitCode, snapshotFieldUnits, toMismatchRows } from '@/domain/reconcile'
import { db, syncAll, syncDelete, syncPut } from '@/hooks/usePersistentStore'
import { stratumStore } from '@/stores/stratumStore'
import { uid } from '@/utils/id'

export interface ReconcileState {
  runs: ReconcileRun[]
  mismatches: Mismatch[]
  loaded: boolean
  hydrate: () => Promise<void>
  /** 发起对账：取一次工地侧快照，再跑整理室侧比对 */
  run: () => Promise<void>
  /** 只重试整理室侧：复用最近一次运行的工地快照，工地那份不重取、不受影响 */
  retryLab: () => Promise<void>
  /** 人工裁定一条差异 */
  resolve: (id: string, resolution: string) => Promise<void>
}

export const reconcileStore = createStore<ReconcileState>((set, get) => {
  /** 整理室侧比对（可独立重试）：读取整理室那份数据，按单位号与工地快照对账 */
  async function runLabSide(run: ReconcileRun): Promise<void> {
    try {
      const artifacts = await syncAll<Artifact>(db.artifacts)
      const raw = diffByUnitCode(run.fieldUnits, artifacts)
      // 重试时只替换未裁定的差异；人已裁定过的结论保留
      const stale = await db.mismatches.where('runId').equals(run.id).and((item) => item.status === 'open').toArray()
      await Promise.all(stale.map((item) => syncDelete<Mismatch>(db.mismatches, item.id)))
      const rows = toMismatchRows(run.id, raw, () => uid('mm'))
      await Promise.all(rows.map((item) => syncPut<Mismatch>(db.mismatches, item)))
      await syncPut<ReconcileRun>(db.reconcileRuns, applyLabReport(run, { ok: true, finishedAt: new Date().toISOString() }))
    } catch (error) {
      // 整理室侧失败：只标记本侧状态，工地快照原样保留
      await syncPut<ReconcileRun>(
        db.reconcileRuns,
        applyLabReport(run, { ok: false, error: error instanceof Error ? error.message : String(error), finishedAt: new Date().toISOString() })
      )
    }
  }

  return {
    runs: [],
    mismatches: [],
    loaded: false,
    hydrate: async () => {
      const runs = await syncAll<ReconcileRun>(db.reconcileRuns)
      runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      const mismatches = await syncAll<Mismatch>(db.mismatches)
      mismatches.sort((a, b) => a.unitCode.localeCompare(b.unitCode, 'zh-Hans-CN'))
      set({ runs, mismatches, loaded: true })
    },
    run: async () => {
      const now = new Date().toISOString()
      const run: ReconcileRun = {
        id: uid('rc'),
        startedAt: now,
        fieldUnits: snapshotFieldUnits(stratumStore.getState().strata),
        fieldSnapshotAt: now,
        labStatus: 'ok',
        labFinishedAt: null,
        labError: ''
      }
      await syncPut<ReconcileRun>(db.reconcileRuns, run)
      await runLabSide(run)
      await get().hydrate()
    },
    retryLab: async () => {
      const latest = get().runs[0]
      if (!latest) return
      // 只重跑整理室侧比对：fieldUnits / fieldSnapshotAt 沿用最近一次的工地快照
      await runLabSide(latest)
      await get().hydrate()
    },
    resolve: async (id, resolution) => {
      const target = get().mismatches.find((item) => item.id === id)
      if (!target) return
      await syncPut<Mismatch>(db.mismatches, { ...target, status: 'resolved', resolution })
      await get().hydrate()
    }
  }
})
