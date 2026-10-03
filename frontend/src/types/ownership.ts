/**
 * 数据归属：地层单位与层位关系由工地记录员定（site），
 * 出土物的器物编号、件数、临时存放由整理室填（lab），两边各自持有自己那份。
 */
export const OWNERS = ['site', 'lab'] as const
export type Owner = (typeof OWNERS)[number]

export const OWNER_LABELS: Record<Owner, string> = {
  site: '工地记录员',
  lab: '整理室'
}

/** 出土物登记状态：registered 已入账 / pending 挂起待核（等记录员核） */
export const ARTIFACT_STATUSES = ['registered', 'pending'] as const
export type ArtifactStatus = (typeof ARTIFACT_STATUSES)[number]

export const ARTIFACT_STATUS_LABELS: Record<ArtifactStatus, string> = {
  registered: '已入账',
  pending: '待核'
}

/** 挂起待核原因（件数与临时存放位置一律保持原样，只改状态） */
export const PENDING_REASONS = {
  /** 出土深度掉到单位深度区间外 */
  depthOut: '出土深度超出单位深度区间，待记录员核',
  /** 记录员把单位拆开，挂在原单位下的那批退回待核 */
  split: '所属单位已拆分，退回待核',
  /** 记录员把单位并掉，挂在原单位下的那批退回待核 */
  merge: '所属单位已合并，退回待核',
  /** 单位号在工地台账中对不上 */
  unitMissing: '单位号在工地台账中不存在，待核对'
} as const
