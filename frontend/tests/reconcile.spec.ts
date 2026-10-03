import { describe, expect, it } from 'vitest'
import { applyLabReport, diffByUnitCode, snapshotFieldUnits } from '@/domain/reconcile'
import type { ReconcileRun } from '@/types'
import { makeArtifact, makeStratum } from './fixtures'

describe('按单位号对账', () => {
  const strata = [
    makeStratum({ code: 'L01', lifecycle: 'active' }),
    makeStratum({ code: 'H12', lifecycle: 'split', successorCodes: ['H12-1', 'H12-2'] }),
    makeStratum({ code: 'L02', lifecycle: 'active' })
  ]
  const fieldUnits = snapshotFieldUnits(strata)

  it('工地侧快照带单位号与生命周期', () => {
    expect(fieldUnits).toHaveLength(3)
    expect(fieldUnits.find((item) => item.code === 'H12')?.lifecycle).toBe('split')
  })

  it('整理室认的单位号工地侧没有 → lab-unknown-unit', () => {
    const mismatches = diffByUnitCode(fieldUnits, [makeArtifact({ code: 'T01:9', unitCode: 'H99', count: 2 })])
    const hit = mismatches.find((item) => item.kind === 'lab-unknown-unit')
    expect(hit?.unitCode).toBe('H99')
    expect(hit?.side).toBe('lab')
    expect(hit?.detail).toContain('T01:9')
  })

  it('单位号已拆分仍挂出土物 → lab-stale-unit', () => {
    const mismatches = diffByUnitCode(fieldUnits, [makeArtifact({ code: 'T01:3', unitCode: 'H12' })])
    const hit = mismatches.find((item) => item.kind === 'lab-stale-unit')
    expect(hit?.unitCode).toBe('H12')
    expect(hit?.detail).toContain('已拆分')
  })

  it('工地侧在册单位整理室无记录 → field-unit-unmatched', () => {
    const mismatches = diffByUnitCode(fieldUnits, [makeArtifact({ unitCode: 'L01' })])
    const hits = mismatches.filter((item) => item.kind === 'field-unit-unmatched')
    expect(hits.map((item) => item.unitCode)).toEqual(['L02'])
    expect(hits[0].side).toBe('field')
  })

  it('两边对得上 → 无差异', () => {
    const artifacts = [makeArtifact({ unitCode: 'L01' }), makeArtifact({ unitCode: 'L02' })]
    expect(diffByUnitCode(fieldUnits, artifacts)).toHaveLength(0)
  })

  it('已拆并单位不算「整理室无记录」', () => {
    // H12 已拆分，即使无人认它也不应产生 field 侧差异
    const mismatches = diffByUnitCode(fieldUnits, [makeArtifact({ unitCode: 'L01' }), makeArtifact({ unitCode: 'L02' })])
    expect(mismatches.find((item) => item.unitCode === 'H12')).toBeUndefined()
  })
})

describe('整理室侧失败重试，工地那份不受影响', () => {
  const run: ReconcileRun = {
    id: 'rc_1',
    startedAt: '2026-10-03T08:00:00.000Z',
    fieldUnits: snapshotFieldUnits([makeStratum({ code: 'L01' })]),
    fieldSnapshotAt: '2026-10-03T08:00:00.000Z',
    labStatus: 'ok',
    labFinishedAt: '2026-10-03T08:00:01.000Z',
    labError: ''
  }

  it('整理室侧失败：只标记本侧状态，工地快照原样保留', () => {
    const next = applyLabReport(run, { ok: false, error: '整理室台账读取失败', finishedAt: '2026-10-03T08:05:00.000Z' })
    expect(next.labStatus).toBe('failed')
    expect(next.labError).toBe('整理室台账读取失败')
    expect(next.fieldUnits).toBe(run.fieldUnits)
    expect(next.fieldSnapshotAt).toBe(run.fieldSnapshotAt)
  })

  it('整理室侧重试成功：只刷新本侧结果，工地快照不动', () => {
    const failed = applyLabReport(run, { ok: false, error: 'x', finishedAt: '2026-10-03T08:05:00.000Z' })
    const retried = applyLabReport(failed, { ok: true, finishedAt: '2026-10-03T08:06:00.000Z' })
    expect(retried.labStatus).toBe('ok')
    expect(retried.labError).toBe('')
    expect(retried.labFinishedAt).toBe('2026-10-03T08:06:00.000Z')
    expect(retried.fieldUnits).toBe(run.fieldUnits)
    expect(retried.fieldSnapshotAt).toBe(run.fieldSnapshotAt)
    expect(retried.startedAt).toBe(run.startedAt)
  })
})
