import type { Artifact, ArtifactStatus, PendingReason, Stratum } from '@/types'

/** 登记判定结果 */
export interface RegistrationVerdict {
  status: ArtifactStatus
  pendingReason: PendingReason | ''
}

/**
 * 整理室登记判定：先认单位号，再核出土深度。
 * - 单位号在工地侧认不到 → 待核（unit-missing），由调用方决定拒收还是挂起；
 * - 单位已被拆开/并掉 → 待核（unit-split / unit-merged）；
 * - 出土深度掉到单位深度区间外 → 待核（depth-out-of-range），挂起等记录员核；
 * - 其余 → 已确认。
 * 判定只决定状态字段，件数与临时存放位置一律不动。
 */
export function judgeRegistration(unit: Pick<Stratum, 'lifecycle' | 'topDepth' | 'bottomDepth'> | null, z: number): RegistrationVerdict {
  if (!unit) {
    return { status: 'pending', pendingReason: 'unit-missing' }
  }
  if (unit.lifecycle === 'split') {
    return { status: 'pending', pendingReason: 'unit-split' }
  }
  if (unit.lifecycle === 'merged') {
    return { status: 'pending', pendingReason: 'unit-merged' }
  }
  if (z < unit.topDepth || z > unit.bottomDepth) {
    return { status: 'pending', pendingReason: 'depth-out-of-range' }
  }
  return { status: 'confirmed', pendingReason: '' }
}

/**
 * 把出土物标记为待核（挂起/退回）。
 * 只改 status 与 pendingReason 两个状态字段：件数、临时存放位置及其余登记内容原样保留，不挪不动。
 */
export function markPending(artifact: Artifact, reason: PendingReason): Artifact {
  return { ...artifact, status: 'pending', pendingReason: reason }
}

/** 记录员核定通过：状态转已确认，登记内容不变 */
export function markConfirmed(artifact: Artifact): Artifact {
  return { ...artifact, status: 'confirmed', pendingReason: '' }
}
