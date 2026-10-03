import type { Artifact, FieldUnitSnapshot, Mismatch, MismatchKind, Owner, ReconcileRun, Stratum } from '@/types'

/** 未落库的差异（id / runId / 裁定状态由 store 包装） */
export interface RawMismatch {
  unitCode: string
  side: Owner
  kind: MismatchKind
  detail: string
}

/** 取工地侧快照：全部单位的单位号与生命周期（对账基准） */
export function snapshotFieldUnits(strata: Pick<Stratum, 'code' | 'trenchId' | 'lifecycle'>[]): FieldUnitSnapshot[] {
  return strata.map((item) => ({ code: item.code, trenchId: item.trenchId, lifecycle: item.lifecycle }))
}

/**
 * 按单位号对账：工地侧单位号清单 × 整理室出土物认下的单位号。
 * - 整理室认的单位号工地侧没有 → lab-unknown-unit；
 * - 单位号已拆分/已并掉仍挂出土物 → lab-stale-unit；
 * - 工地侧在册单位整理室无任何记录 → field-unit-unmatched。
 * 对不上的全部摆出，等人裁定。
 */
export function diffByUnitCode(fieldUnits: FieldUnitSnapshot[], artifacts: Pick<Artifact, 'code' | 'unitCode' | 'count'>[]): RawMismatch[] {
  const fieldByCode = new Map<string, FieldUnitSnapshot>()
  fieldUnits.forEach((unit) => {
    if (!fieldByCode.has(unit.code)) fieldByCode.set(unit.code, unit)
  })

  const mismatches: RawMismatch[] = []

  // 整理室侧：按认下的单位号归集出土物
  const labByCode = new Map<string, { codes: string[]; count: number }>()
  artifacts.forEach((item) => {
    const bucket = labByCode.get(item.unitCode) ?? { codes: [], count: 0 }
    bucket.codes.push(item.code)
    bucket.count += item.count
    labByCode.set(item.unitCode, bucket)
  })

  labByCode.forEach((bucket, unitCode) => {
    const field = fieldByCode.get(unitCode)
    const brief = `${bucket.codes.join('、')}（共 ${bucket.count} 件）`
    if (!field) {
      mismatches.push({
        unitCode,
        side: 'lab',
        kind: 'lab-unknown-unit',
        detail: `整理室登记 ${brief} 挂在单位号「${unitCode}」下，工地侧查无此号`
      })
      return
    }
    if (field.lifecycle !== 'active') {
      mismatches.push({
        unitCode,
        side: 'lab',
        kind: 'lab-stale-unit',
        detail: `单位号「${unitCode}」已${field.lifecycle === 'split' ? '拆分' : '并掉'}，整理室仍有 ${brief} 挂在其下`
      })
    }
  })

  // 工地侧：在册单位整理室无记录
  fieldUnits.forEach((unit) => {
    if (unit.lifecycle !== 'active') return
    if (!labByCode.has(unit.code)) {
      mismatches.push({
        unitCode: unit.code,
        side: 'field',
        kind: 'field-unit-unmatched',
        detail: `工地侧在册单位「${unit.code}」下整理室暂无出土物记录`
      })
    }
  })

  return mismatches
}

/**
 * 应用整理室侧比对结果，生成新的对账运行记录。
 * 只更新整理室侧字段（labStatus / labFinishedAt / labError）：
 * 工地侧快照 fieldUnits 与 fieldSnapshotAt 原样保留 —— 整理室对账失败重试时不碰工地那份。
 */
export function applyLabReport(run: ReconcileRun, report: { ok: boolean; error?: string; finishedAt: string }): ReconcileRun {
  return {
    ...run,
    fieldUnits: run.fieldUnits,
    fieldSnapshotAt: run.fieldSnapshotAt,
    labStatus: report.ok ? 'ok' : 'failed',
    labFinishedAt: report.finishedAt,
    labError: report.ok ? '' : (report.error ?? '整理室侧比对失败')
  }
}

/** 把一次整理室侧比对产出的原始差异包装成落库记录 */
export function toMismatchRows(runId: string, raw: RawMismatch[], makeId: () => string): Mismatch[] {
  return raw.map((item) => ({
    id: makeId(),
    runId,
    unitCode: item.unitCode,
    side: item.side,
    kind: item.kind,
    detail: item.detail,
    status: 'open',
    resolution: ''
  }))
}
