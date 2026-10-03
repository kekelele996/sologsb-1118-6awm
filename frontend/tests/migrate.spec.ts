import { describe, expect, it } from 'vitest'
import { backfillArtifact, backfillStratum } from '@/domain/migrate'
import type { Artifact, Stratum } from '@/types'
import { makeArtifact, makeStratum } from './fixtures'

/** 造一条 v2 时代的旧记录（没有归属、单位号快照、状态字段） */
function legacyStratum(overrides: Partial<Stratum> = {}): Stratum {
  const row = makeStratum(overrides)
  // 模拟旧数据：这些字段历史上不存在
  // @ts-expect-error 故意删除归属字段
  delete row.owner
  // @ts-expect-error 故意删除生命周期字段
  delete row.lifecycle
  // @ts-expect-error 故意删除去向字段
  delete row.successorCodes
  return row
}

function legacyArtifact(overrides: Partial<Artifact> = {}): Artifact {
  const row = makeArtifact(overrides)
  // @ts-expect-error 故意删除归属字段
  delete row.owner
  // @ts-expect-error 故意删除单位号快照
  delete row.unitCode
  // @ts-expect-error 故意删除状态字段
  delete row.status
  // @ts-expect-error 故意删除待核原因
  delete row.pendingReason
  return row
}

describe('旧数据升级回填（没记归属，按现有单位回填再启用）', () => {
  it('地层单位：归属回填工地记录员，生命周期回填在册', () => {
    const row = legacyStratum()
    backfillStratum(row)
    expect(row.owner).toBe('field')
    expect(row.lifecycle).toBe('active')
    expect(row.successorCodes).toEqual([])
  })

  it('出土物：按现有单位回填单位号快照，深度在区间内 → 已确认', () => {
    const unit = makeStratum({ id: 'st_1', code: 'L02', topDepth: 0.5, bottomDepth: 1.0 })
    const row = legacyArtifact({ stratumId: 'st_1', z: 0.7 })
    backfillArtifact(row, new Map([[unit.id, unit]]))
    expect(row.owner).toBe('lab')
    expect(row.unitCode).toBe('L02')
    expect(row.status).toBe('confirmed')
    expect(row.pendingReason).toBe('')
  })

  it('出土物：深度掉到现有单位区间外 → 挂起待核', () => {
    const unit = makeStratum({ id: 'st_1', code: 'L02', topDepth: 0.5, bottomDepth: 1.0 })
    const row = legacyArtifact({ stratumId: 'st_1', z: 1.8 })
    backfillArtifact(row, new Map([[unit.id, unit]]))
    expect(row.status).toBe('pending')
    expect(row.pendingReason).toBe('depth-out-of-range')
    expect(row.unitCode).toBe('L02')
  })

  it('出土物：所属单位已不存在 → 挂起待核 unit-missing', () => {
    const row = legacyArtifact({ stratumId: 'st_gone' })
    backfillArtifact(row, new Map())
    expect(row.status).toBe('pending')
    expect(row.pendingReason).toBe('unit-missing')
    expect(row.unitCode).toBe('')
  })

  it('回填不动件数与临时存放位置', () => {
    const unit = makeStratum({ id: 'st_1', code: 'L02' })
    const row = legacyArtifact({ stratumId: 'st_1', count: 7, tempLocation: '整理室周转箱 B-9' })
    backfillArtifact(row, new Map([[unit.id, unit]]))
    expect(row.count).toBe(7)
    expect(row.tempLocation).toBe('整理室周转箱 B-9')
  })
})
