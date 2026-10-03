import type { Owner } from './ownership'

/** 关系类型 */
export const RELATION_TYPES = ['叠压', '打破', '共存'] as const
export type RelationType = (typeof RELATION_TYPES)[number]

/** 判定依据 */
export const RELATION_BASES = ['剖面观察', '平面观察'] as const
export type RelationBasis = (typeof RELATION_BASES)[number]

/** Relation 层位关系 */
export interface Relation {
  id: string
  /** 单位 A */
  unitAId: string
  type: RelationType
  /** 单位 B */
  unitBId: string
  basis: RelationBasis
  recorder: string
  note: string
  /** 数据归属：层位关系由工地记录员定 */
  owner: Owner
  /** 单位 A 编号快照（单位拆分/合并后，层位关系照旧按原编号留着） */
  unitACode: string
  /** 单位 B 编号快照 */
  unitBCode: string
}
