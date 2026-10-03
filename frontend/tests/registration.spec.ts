import { describe, expect, it } from 'vitest'
import { judgeRegistration, markConfirmed, markPending } from '@/domain/registration'
import { makeArtifact, makeStratum } from './fixtures'

describe('整理室登记判定（先认单位号，再核深度）', () => {
  it('单位号认不到 → 待核 unit-missing', () => {
    expect(judgeRegistration(null, 0.7)).toEqual({ status: 'pending', pendingReason: 'unit-missing' })
  })

  it('单位已拆分 → 待核 unit-split', () => {
    const unit = makeStratum({ lifecycle: 'split' })
    expect(judgeRegistration(unit, 0.7)).toEqual({ status: 'pending', pendingReason: 'unit-split' })
  })

  it('单位已并掉 → 待核 unit-merged', () => {
    const unit = makeStratum({ lifecycle: 'merged' })
    expect(judgeRegistration(unit, 0.7)).toEqual({ status: 'pending', pendingReason: 'unit-merged' })
  })

  it('出土深度掉到区间外 → 待核 depth-out-of-range', () => {
    const unit = makeStratum({ topDepth: 0.5, bottomDepth: 1.0 })
    expect(judgeRegistration(unit, 1.6)).toEqual({ status: 'pending', pendingReason: 'depth-out-of-range' })
    expect(judgeRegistration(unit, 0.4)).toEqual({ status: 'pending', pendingReason: 'depth-out-of-range' })
  })

  it('出土深度落在区间内（含边界）→ 已确认', () => {
    const unit = makeStratum({ topDepth: 0.5, bottomDepth: 1.0 })
    expect(judgeRegistration(unit, 0.5)).toEqual({ status: 'confirmed', pendingReason: '' })
    expect(judgeRegistration(unit, 0.75)).toEqual({ status: 'confirmed', pendingReason: '' })
    expect(judgeRegistration(unit, 1.0)).toEqual({ status: 'confirmed', pendingReason: '' })
  })
})

describe('挂起与核定只动状态字段', () => {
  it('退回待核：件数与临时存放位置原样保留，不挪不动', () => {
    const artifact = makeArtifact({ count: 5, tempLocation: '工地临时柜 A-2' })
    const pending = markPending(artifact, 'unit-split')
    expect(pending.status).toBe('pending')
    expect(pending.pendingReason).toBe('unit-split')
    expect(pending.count).toBe(5)
    expect(pending.tempLocation).toBe('工地临时柜 A-2')
    // 其余登记字段逐项不变
    expect(pending.code).toBe(artifact.code)
    expect(pending.stratumId).toBe(artifact.stratumId)
    expect(pending.unitCode).toBe(artifact.unitCode)
    expect(pending.z).toBe(artifact.z)
  })

  it('核定通过：状态转已确认，登记内容不变', () => {
    const artifact = markPending(makeArtifact(), 'depth-out-of-range')
    const confirmed = markConfirmed(artifact)
    expect(confirmed.status).toBe('confirmed')
    expect(confirmed.pendingReason).toBe('')
    expect(confirmed.count).toBe(artifact.count)
    expect(confirmed.tempLocation).toBe(artifact.tempLocation)
  })
})
