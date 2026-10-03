import { describe, expect, it } from 'vitest'
import { artifactsToReturn, planMerge, planSplit } from '@/domain/reorganize'
import { makeArtifact, makeStratum } from './fixtures'

describe('记录员拆分单位', () => {
  it('原单位转已拆分并记录去向，新单位继承档案、单位号与深度取新定值', () => {
    const source = makeStratum({ id: 'st_h12', code: 'H12', topDepth: 0.6, bottomDepth: 1.4, soil: '深灰褐土' })
    let n = 0
    const plan = planSplit(
      source,
      [
        { code: 'H12-1', topDepth: 0.6, bottomDepth: 1.0 },
        { code: 'H12-2', topDepth: 1.0, bottomDepth: 1.4 }
      ],
      () => `st_new_${++n}`
    )
    expect(plan.archived.lifecycle).toBe('split')
    expect(plan.archived.code).toBe('H12')
    expect(plan.archived.successorCodes).toEqual(['H12-1', 'H12-2'])
    expect(plan.created).toHaveLength(2)
    expect(plan.created[0]).toMatchObject({ code: 'H12-1', topDepth: 0.6, bottomDepth: 1.0, lifecycle: 'active', owner: 'field' })
    expect(plan.created[1]).toMatchObject({ code: 'H12-2', topDepth: 1.0, bottomDepth: 1.4 })
    // 新单位继承原单位档案（探方、土质等），但 id 全新
    expect(plan.created[0].trenchId).toBe(source.trenchId)
    expect(plan.created[0].soil).toBe('深灰褐土')
    expect(plan.created[0].id).not.toBe(source.id)
  })
})

describe('记录员并掉单位', () => {
  it('原单位转已并掉，去向记为目标单位号', () => {
    const source = makeStratum({ code: 'H09' })
    const archived = planMerge(source, { code: 'H12' })
    expect(archived.lifecycle).toBe('merged')
    expect(archived.successorCodes).toEqual(['H12'])
    expect(archived.code).toBe('H09')
  })
})

describe('拆并后退回整理室那批', () => {
  it('只挑出挂在该单位底下的出土物', () => {
    const artifacts = [
      makeArtifact({ stratumId: 'st_a' }),
      makeArtifact({ stratumId: 'st_a' }),
      makeArtifact({ stratumId: 'st_b' })
    ]
    const targets = artifactsToReturn(artifacts, 'st_a')
    expect(targets).toHaveLength(2)
    expect(targets.every((item) => item.stratumId === 'st_a')).toBe(true)
  })
})
