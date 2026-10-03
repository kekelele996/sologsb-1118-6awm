import type { ArtifactStatus, Owner } from './ownership'

/** 器物类别 */
export const ARTIFACT_CATEGORIES = ['陶器', '瓷器', '石器', '骨器', '铜器'] as const
export type ArtifactCategory = (typeof ARTIFACT_CATEGORIES)[number]

/** 残整程度 */
export const COMPLETENESS = ['完整', '可复原', '残片'] as const
export type Completeness = (typeof COMPLETENESS)[number]

/** Artifact 出土物 */
export interface Artifact {
  id: string
  /** 所属地层单位（登记时锁定） */
  stratumId: string
  /** 器物编号 */
  code: string
  category: ArtifactCategory
  /** 件数 */
  count: number
  completeness: Completeness
  /** 探方内坐标 X（米） */
  x: number
  /** 探方内坐标 Y（米） */
  y: number
  /** 探方内坐标 Z（距地表深度，米） */
  z: number
  date: string
  /** 提取人 */
  collector: string
  /** 临时存放位置 */
  tempLocation: string
  /** 数据归属：器物编号、件数、临时存放由整理室填 */
  owner: Owner
  /** 登记状态：registered 已入账 / pending 挂起待核 */
  status: ArtifactStatus
  /** 挂起原因（已入账时为空串） */
  pendingReason: string
  /** 所属探方快照（单位停用后仍能定位出土物来自哪个探方） */
  trenchId: string
  /** 单位号快照（对账按单位号进行；单位拆分/合并后原编号仍留底） */
  stratumCode: string
}
