import type { Artifact, Stratum } from '@/types'

let seq = 0
function nextId(prefix: string): string {
  seq += 1
  return `${prefix}_test_${seq}`
}

/** 造一个在地层单位（可被覆盖任意字段） */
export function makeStratum(overrides: Partial<Stratum> = {}): Stratum {
  return {
    id: nextId('st'),
    trenchId: 'tr_1',
    code: 'L01',
    type: '地层',
    openLayer: '第①层',
    topDepth: 0.5,
    bottomDepth: 1.0,
    soil: '灰褐色黏土',
    inclusions: ['陶片'],
    formation: '文化层',
    date: '2026-10-03',
    drawingNo: '',
    owner: 'field',
    lifecycle: 'active',
    successorCodes: [],
    ...overrides
  }
}

/** 造一件已确认出土物（可被覆盖任意字段） */
export function makeArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: nextId('af'),
    stratumId: 'st_1',
    code: `T01:${seq}`,
    category: '陶器',
    count: 2,
    completeness: '残片',
    x: 1,
    y: 1,
    z: 0.7,
    date: '2026-10-03',
    collector: '祁野',
    tempLocation: '整理室周转箱 B-1',
    owner: 'lab',
    unitCode: 'L01',
    status: 'confirmed',
    pendingReason: '',
    ...overrides
  }
}
