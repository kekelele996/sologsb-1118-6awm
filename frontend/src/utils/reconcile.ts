import type { Artifact, Stratum } from '@/types'
import { isDepthInRange, PENDING_REASONS } from '@/types'

/** 对不上的类型 */
export type MismatchKind = 'unit-missing' | 'depth-out' | 'code-changed'

export const MISMATCH_KIND_LABELS: Record<MismatchKind, string> = {
  'unit-missing': '单位号对不上',
  'depth-out': '深度超区间',
  'code-changed': '单位号已变更'
}

/** 对账时对不上的条目：摆出来等人定，不自动改 */
export interface ReconcileMismatch {
  artifactId: string
  artifactCode: string
  /** 所属探方快照 */
  trenchId: string
  /** 整理室台账持有的单位号（快照） */
  stratumCode: string
  kind: MismatchKind
  detail: string
}

/**
 * 两边按单位号对账：整理室台账（出土物）逐条对照工地台账（地层单位）。
 * 只读比对，不写任何数据；对不上的摆出来等人定。
 */
export function reconcileByUnitCode(artifacts: Artifact[], strata: Stratum[]): ReconcileMismatch[] {
  const mismatches: ReconcileMismatch[] = []
  artifacts.forEach((artifact) => {
    const unit = strata.find((item) => item.id === artifact.stratumId)
    if (!unit) {
      mismatches.push({
        artifactId: artifact.id,
        artifactCode: artifact.code,
        trenchId: artifact.trenchId,
        stratumCode: artifact.stratumCode,
        kind: 'unit-missing',
        detail: `整理室登记在「${artifact.stratumCode || '未知单位'}」下，工地台账没有该单位号（可能已拆分或并掉）`
      })
      return
    }
    if (unit.code !== artifact.stratumCode) {
      mismatches.push({
        artifactId: artifact.id,
        artifactCode: artifact.code,
        trenchId: artifact.trenchId,
        stratumCode: artifact.stratumCode,
        kind: 'code-changed',
        detail: `单位号已由「${artifact.stratumCode}」改为「${unit.code}」，整理室台账尚未跟进`
      })
      return
    }
    if (!isDepthInRange(artifact.z, unit)) {
      mismatches.push({
        artifactId: artifact.id,
        artifactCode: artifact.code,
        trenchId: artifact.trenchId,
        stratumCode: artifact.stratumCode,
        kind: 'depth-out',
        detail: `出土深度 ${artifact.z} m 不在「${unit.code}」深度区间 ${unit.topDepth}–${unit.bottomDepth} m 内`
      })
    }
  })
  return mismatches
}

/**
 * 整理室侧重试对账：按当前工地台账重新校验自己持有的出土物，
 * 返回需要回写的行（只动状态、原因与单位号快照；件数与临时存放位置一律不挪）。
 * 工地那份（地层单位、层位关系）不受影响。
 */
export function computeLabRetry(artifacts: Artifact[], strata: Stratum[]): Artifact[] {
  const updates: Artifact[] = []
  artifacts.forEach((artifact) => {
    const unit = strata.find((item) => item.id === artifact.stratumId)
    // 单位号对不上的维持待核，摆出来等人定，不自动处理
    if (!unit) return
    const inRange = isDepthInRange(artifact.z, unit)
    const next: Artifact = {
      ...artifact,
      trenchId: unit.trenchId,
      stratumCode: unit.code,
      status: inRange ? 'registered' : 'pending',
      pendingReason: inRange ? '' : PENDING_REASONS.depthOut
    }
    if (
      next.status !== artifact.status ||
      next.pendingReason !== artifact.pendingReason ||
      next.stratumCode !== artifact.stratumCode ||
      next.trenchId !== artifact.trenchId
    ) {
      updates.push(next)
    }
  })
  return updates
}
