import type { Artifact, Stratum } from '@/types'
import { judgeRegistration } from './registration'

/**
 * 旧数据迁移回填（schema v3）：旧记录没有归属字段。
 * 地层单位：归属回填为工地记录员，生命周期回填为在册，去向清单置空。
 * 原地修改（供 Dexie upgrade 的 modify 使用）。
 */
export function backfillStratum(stratum: Stratum): void {
  if (!stratum.owner) stratum.owner = 'field'
  if (!stratum.lifecycle) stratum.lifecycle = 'active'
  if (!Array.isArray(stratum.successorCodes)) stratum.successorCodes = []
}

/**
 * 旧数据迁移回填（schema v3）：旧出土物没有归属、单位号快照与状态。
 * 按现有单位回填——以 stratumId 找到当前单位：
 * - 认到单位：单位号快照取该单位现用编号，再按出土深度是否落在单位深度区间内回填状态；
 * - 认不到单位：单位号快照留空，挂起待核（unit-missing）。
 * 归属回填为整理室；件数与临时存放位置一律不动。
 * 原地修改（供 Dexie upgrade 的 modify 使用）。
 */
export function backfillArtifact(artifact: Artifact, strataById: Map<string, Stratum>): void {
  if (!artifact.owner) artifact.owner = 'lab'
  const unit = strataById.get(artifact.stratumId) ?? null
  if (unit) {
    if (!artifact.unitCode) artifact.unitCode = unit.code
  } else if (!artifact.unitCode) {
    artifact.unitCode = ''
  }
  if (!artifact.status) {
    const verdict = judgeRegistration(unit, artifact.z)
    artifact.status = verdict.status
    artifact.pendingReason = verdict.pendingReason
  }
  if (artifact.pendingReason === undefined) artifact.pendingReason = ''
}
