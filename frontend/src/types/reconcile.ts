import type { Owner, UnitLifecycle } from './ownership'

/** 工地侧单位号快照（对账基准；整理室侧重试时原样保留，不重取） */
export interface FieldUnitSnapshot {
  /** 单位号 */
  code: string
  trenchId: string
  /** 快照时的生命周期 */
  lifecycle: UnitLifecycle
}

/** 对账运行记录：一次对账 = 一次工地侧快照 + 一次（可重试的）整理室侧比对 */
export interface ReconcileRun {
  id: string
  startedAt: string
  /** 工地侧快照（工地那份，整理室侧失败重试时不受影响） */
  fieldUnits: FieldUnitSnapshot[]
  fieldSnapshotAt: string
  /** 整理室侧比对状态 */
  labStatus: 'ok' | 'failed'
  labFinishedAt: string | null
  labError: string
}

/** 差异类型 */
export const MISMATCH_KINDS = ['lab-unknown-unit', 'lab-stale-unit', 'field-unit-unmatched'] as const
export type MismatchKind = (typeof MISMATCH_KINDS)[number]

export const MISMATCH_KIND_LABELS: Record<MismatchKind, string> = {
  'lab-unknown-unit': '整理室认的单位号工地侧没有',
  'lab-stale-unit': '单位号已拆分/已并掉仍挂出土物',
  'field-unit-unmatched': '工地侧在册单位整理室无记录'
}

/** 对账差异：对不上的摆出来等人定 */
export interface Mismatch {
  id: string
  runId: string
  /** 对账键：单位号 */
  unitCode: string
  /** 差异出自哪一侧 */
  side: Owner
  kind: MismatchKind
  detail: string
  status: 'open' | 'resolved'
  /** 人工裁定结论 */
  resolution: string
}
