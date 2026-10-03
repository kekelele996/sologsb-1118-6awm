import type { Artifact, Stratum } from '@/types'

/** 拆分出来的新单位参数（单位号与深度子区间由记录员定） */
export interface SplitPart {
  code: string
  topDepth: number
  bottomDepth: number
}

export interface SplitPlan {
  /** 原单位：标记已拆分，记录去向单位号 */
  archived: Stratum
  /** 新单位：继承原单位的探方与描述档案，生命周期为在册 */
  created: Stratum[]
}

/**
 * 拆分一个地层单位：原单位转为「已拆分」并保留原编号档案（层位关系照旧引用原编号，不改写），
 * 新单位继承土质、包含物等描述，单位号与深度子区间取记录员新定的值。
 */
export function planSplit(source: Stratum, parts: SplitPart[], makeId: () => string): SplitPlan {
  const archived: Stratum = {
    ...source,
    lifecycle: 'split',
    successorCodes: parts.map((part) => part.code)
  }
  const created: Stratum[] = parts.map((part) => ({
    ...source,
    id: makeId(),
    code: part.code,
    topDepth: part.topDepth,
    bottomDepth: part.bottomDepth,
    owner: 'field',
    lifecycle: 'active',
    successorCodes: []
  }))
  return { archived, created }
}

/**
 * 把一个地层单位并掉：原单位转为「已并掉」，去向记为目标单位号；
 * 目标单位本身不变，层位关系照旧按原编号保留。
 */
export function planMerge(source: Stratum, target: Pick<Stratum, 'code'>): Stratum {
  return {
    ...source,
    lifecycle: 'merged',
    successorCodes: [target.code]
  }
}

/** 挂在指定单位底下、需要退回待核的出土物（整理室那批） */
export function artifactsToReturn(artifacts: Artifact[], stratumId: string): Artifact[] {
  return artifacts.filter((item) => item.stratumId === stratumId)
}
