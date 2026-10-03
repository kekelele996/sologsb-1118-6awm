import 'fake-indexeddb/auto'
import { beforeAll, describe, expect, it } from 'vitest'
import Dexie from 'dexie'
import type { Artifact, Stratum } from '@/types'

/**
 * 端到端验证 schema v2 → v3 升级：
 * 旧数据没记归属（没有 owner / unitCode / status 字段），
 * 升级时按现有单位回填（单位号快照 + 状态），回填完成再启用。
 */

const today = '2026-10-03'

function legacyStratumRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    trenchId: 'tr_1',
    type: '地层',
    openLayer: '第①层',
    soil: '灰褐色黏土',
    inclusions: ['陶片'],
    formation: '文化层',
    date: today,
    drawingNo: '',
    ...overrides
  }
}

function legacyArtifactRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    category: '陶器',
    count: 3,
    completeness: '残片',
    x: 1,
    y: 1,
    date: today,
    collector: '祁野',
    tempLocation: '整理室周转箱 B-1',
    ...overrides
  }
}

let strata: Stratum[]
let artifacts: Artifact[]
let ownershipBackfilled: number | undefined

beforeAll(async () => {
  // 1. 以 v2 结构建库并写入旧数据（无归属字段）
  const legacy = new Dexie('gbtrenchlog')
  legacy.version(1).stores({
    trenches: 'id, code, area',
    strata: 'id, trenchId, code, type',
    artifacts: 'id, stratumId, code, category',
    relations: 'id, unitAId, unitBId, type',
    meta: 'key'
  })
  legacy.version(2).stores({
    trenches: 'id, code, area, backfilled',
    strata: 'id, trenchId, code, type, topDepth',
    artifacts: 'id, stratumId, code, category, date',
    relations: 'id, unitAId, unitBId, type, basis',
    meta: 'key'
  })
  await legacy.table('strata').bulkPut([
    legacyStratumRow({ id: 'st_l2', code: 'L02', topDepth: 0.25, bottomDepth: 0.6 }),
    legacyStratumRow({ id: 'st_h12', code: 'H12', topDepth: 0.6, bottomDepth: 1.4 })
  ])
  await legacy.table('artifacts').bulkPut([
    legacyArtifactRow({ id: 'af_in', stratumId: 'st_l2', code: 'T01②:1', z: 0.4 }),
    legacyArtifactRow({ id: 'af_out', stratumId: 'st_h12', code: 'T01H12:1', z: 1.9, count: 5, tempLocation: '工地临时柜 A-3' }),
    legacyArtifactRow({ id: 'af_orphan', stratumId: 'st_gone', code: 'T01?:1', z: 0.4 })
  ])
  await legacy.close()

  // 2. 打开应用库（v3），触发升级迁移
  const { db } = await import('@/hooks/usePersistentStore')
  strata = await db.strata.toArray()
  artifacts = await db.artifacts.toArray()
  ownershipBackfilled = (await db.meta.get('ownershipBackfilled'))?.value
}, 20000)

describe('v2 → v3 升级：旧数据按现有单位回填再启用', () => {
  it('地层单位回填归属与生命周期', () => {
    expect(strata).toHaveLength(2)
    strata.forEach((row) => {
      expect(row.owner).toBe('field')
      expect(row.lifecycle).toBe('active')
      expect(row.successorCodes).toEqual([])
    })
  })

  it('深度在现有单位区间内的旧出土物 → 已确认，单位号快照回填', () => {
    const row = artifacts.find((item) => item.id === 'af_in')
    expect(row?.owner).toBe('lab')
    expect(row?.unitCode).toBe('L02')
    expect(row?.status).toBe('confirmed')
    expect(row?.pendingReason).toBe('')
  })

  it('深度掉到区间外的旧出土物 → 挂起待核，件数与位置不动', () => {
    const row = artifacts.find((item) => item.id === 'af_out')
    expect(row?.unitCode).toBe('H12')
    expect(row?.status).toBe('pending')
    expect(row?.pendingReason).toBe('depth-out-of-range')
    expect(row?.count).toBe(5)
    expect(row?.tempLocation).toBe('工地临时柜 A-3')
  })

  it('所属单位已不存在的旧出土物 → 挂起待核 unit-missing', () => {
    const row = artifacts.find((item) => item.id === 'af_orphan')
    expect(row?.status).toBe('pending')
    expect(row?.pendingReason).toBe('unit-missing')
  })

  it('回填完成标记已写入（归属机制启用）', () => {
    expect(ownershipBackfilled).toBe(1)
  })
})
