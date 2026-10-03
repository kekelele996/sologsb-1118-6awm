/** 数据归属侧：field = 工地记录员，lab = 整理室 */
export const OWNERS = ['field', 'lab'] as const
export type Owner = (typeof OWNERS)[number]

export const OWNER_LABELS: Record<Owner, string> = {
  field: '工地记录员',
  lab: '整理室'
}

/** 地层单位生命周期：在册 / 已拆分 / 已并掉 */
export const UNIT_LIFECYCLES = ['active', 'split', 'merged'] as const
export type UnitLifecycle = (typeof UNIT_LIFECYCLES)[number]

export const LIFECYCLE_LABELS: Record<UnitLifecycle, string> = {
  active: '在册',
  split: '已拆分',
  merged: '已并掉'
}

/** 出土物状态：已确认 / 待核（挂起等记录员核） */
export const ARTIFACT_STATUSES = ['confirmed', 'pending'] as const
export type ArtifactStatus = (typeof ARTIFACT_STATUSES)[number]

export const ARTIFACT_STATUS_LABELS: Record<ArtifactStatus, string> = {
  confirmed: '已确认',
  pending: '待核'
}

/** 待核原因：深度越界 / 单位被拆开 / 单位被并掉 / 单位号认不到 */
export const PENDING_REASONS = ['depth-out-of-range', 'unit-split', 'unit-merged', 'unit-missing'] as const
export type PendingReason = (typeof PENDING_REASONS)[number]

export const PENDING_REASON_LABELS: Record<PendingReason, string> = {
  'depth-out-of-range': '出土深度超出单位深度区间',
  'unit-split': '所属单位已被拆开',
  'unit-merged': '所属单位已被并掉',
  'unit-missing': '单位号在工地侧认不到'
}
