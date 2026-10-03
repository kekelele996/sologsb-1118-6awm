<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { Artifact } from '@/types'
import { ARTIFACT_STATUS_LABELS } from '@/types'
import UnitPicker from '@/components/common/UnitPicker.vue'
import { useStore } from '@/hooks/usePersistentStore'
import { artifactStore } from '@/stores/artifactStore'
import { stratumStore } from '@/stores/stratumStore'
import { trenchStore } from '@/stores/trenchStore'
import { reconcileByUnitCode, MISMATCH_KIND_LABELS, type MismatchKind } from '@/utils/reconcile'

const artifactState = useStore(artifactStore)
const stratumState = useStore(stratumStore)
const trenchState = useStore(trenchStore)

const filterTrenchId = ref('')
const lastRetryAt = ref('')
const lastRetryCount = ref<number | null>(null)

const reassignVisible = ref(false)
const reassignTarget = ref<Artifact | null>(null)
const pickTrenchId = ref('')
const pickStratumId = ref('')

/** 待核队列：整理室挂起等记录员核的那批 */
const pendingList = computed(() =>
  artifactState.artifacts.filter((item) => {
    if (item.status !== 'pending') return false
    if (filterTrenchId.value && item.trenchId !== filterTrenchId.value) return false
    return true
  })
)

/** 两边按单位号对账：对不上的摆出来等人定 */
const mismatches = computed(() =>
  reconcileByUnitCode(artifactState.artifacts, stratumState.strata).filter(
    (item) => !filterTrenchId.value || item.trenchId === filterTrenchId.value
  )
)

const mismatchCountOf = (kind: MismatchKind): number => mismatches.value.filter((item) => item.kind === kind).length

function trenchLabel(trenchId: string): string {
  const trench = trenchState.trenches.find((item) => item.id === trenchId)
  return trench ? `${trench.area} · ${trench.code}` : '未知探方'
}

/** 单位号展示：单位已停用（拆分/并掉）时按快照原编号留底 */
function stratumLabelOf(row: Artifact): string {
  const unit = stratumState.strata.find((item) => item.id === row.stratumId)
  if (unit) return unit.code
  return row.stratumCode ? `${row.stratumCode}（已停用）` : '未知单位'
}

/** 核准：仅当单位仍在工地台账中（深度超区间类）才允许直接入账 */
function canApprove(row: Artifact): boolean {
  return stratumState.strata.some((item) => item.id === row.stratumId)
}

async function approve(row: Artifact): Promise<void> {
  await ElMessageBox.confirm(
    `确认「${row.code}」出土深度 ${row.z} m 属实，核准入账？（件数与临时存放位置保持原样）`,
    '记录员核准',
    { type: 'warning' }
  )
  await artifactStore.getState().approve(row.id)
  ElMessage.success(`「${row.code}」已核准入账`)
}

function openReassign(row: Artifact): void {
  reassignTarget.value = row
  const unit = stratumState.strata.find((item) => item.id === row.stratumId)
  pickTrenchId.value = unit?.trenchId ?? row.trenchId ?? trenchState.trenches[0]?.id ?? ''
  const candidates = stratumState.strata.filter((item) => !pickTrenchId.value || item.trenchId === pickTrenchId.value)
  pickStratumId.value = unit?.id ?? candidates[0]?.id ?? ''
  reassignVisible.value = true
}

async function submitReassign(): Promise<void> {
  const target = reassignTarget.value
  const unit = stratumState.strata.find((item) => item.id === pickStratumId.value)
  if (!target || !unit) {
    ElMessage.warning('请先选择要改派的地层单位')
    return
  }
  const inRange = await artifactStore.getState().reassign(target.id, unit)
  if (inRange) {
    ElMessage.success(`「${target.code}」已改派到 ${unit.code} 并入账`)
  } else {
    ElMessage.warning(`「${target.code}」已改派到 ${unit.code}，但出土深度仍超出该单位区间，继续挂起待核`)
  }
  reassignVisible.value = false
  reassignTarget.value = null
}

/** 整理室侧重试对账：只重算自己那份（出土物台账），工地那份不受影响 */
async function retryLabSide(): Promise<void> {
  const updates = await artifactStore.getState().retryLabSide(stratumState.strata)
  lastRetryAt.value = new Date().toLocaleString('zh-CN', { hour12: false })
  lastRetryCount.value = updates
  const stillPending = artifactState.artifacts.filter((item) => item.status === 'pending').length
  if (updates > 0) {
    ElMessage.success(`整理室侧重试完成：回写 ${updates} 条（入账/仍待核已按当前单位重算），工地台账未改动`)
  } else {
    ElMessage.info(`整理室侧重试完成：无需回写；仍有 ${stillPending} 条待核，工地台账未改动`)
  }
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="page-title">对账与待核</h2>
        <p class="page-sub">
          工地记录员持有地层单位与层位关系，整理室持有出土物登记，两边按单位号对账；对不上的摆出来等人定，
          整理室侧重试只重算自己那份，工地那份不受影响。
        </p>
      </div>
      <div class="head-actions">
        <el-select v-model="filterTrenchId" placeholder="全部探方" clearable style="width: 190px">
          <el-option v-for="trench in trenchState.trenches" :key="trench.id" :label="`${trench.area} · ${trench.code}`" :value="trench.id" />
        </el-select>
        <el-button type="primary" @click="retryLabSide">重试对账（仅整理室侧）</el-button>
      </div>
    </div>

    <el-alert
      v-if="pendingList.length > 0 || mismatches.length > 0"
      class="alert"
      type="warning"
      :closable="false"
      show-icon
      :title="`待核 ${pendingList.length} 条 · 对不上 ${mismatches.length} 条（单位号对不上 ${mismatchCountOf('unit-missing')} · 深度超区间 ${mismatchCountOf('depth-out')} · 单位号已变更 ${mismatchCountOf('code-changed')}）`"
    >
      <template #default>
        <p>对不上的条目只摆出来等人定，系统不自动改；件数与临时存放位置保持原样。</p>
        <p v-if="lastRetryAt">上次整理室侧重试：{{ lastRetryAt }}（回写 {{ lastRetryCount }} 条，工地台账未改动）</p>
      </template>
    </el-alert>
    <el-alert
      v-else
      class="alert"
      type="success"
      :closable="false"
      show-icon
      :title="`两边台账按单位号对账一致（工地单位 ${stratumState.strata.length} 个 · 整理室登记 ${artifactState.artifacts.length} 条）`"
    >
      <template #default>
        <p v-if="lastRetryAt">上次整理室侧重试：{{ lastRetryAt }}（回写 {{ lastRetryCount }} 条，工地台账未改动）</p>
      </template>
    </el-alert>

    <el-card shadow="never" class="card">
      <template #header>
        <div class="card-head">
          <span>对不上的条目（按单位号对账 · 摆出来等人定）</span>
          <el-tag type="warning" effect="plain" size="small">{{ mismatches.length }} 条</el-tag>
        </div>
      </template>
      <el-table :data="mismatches" border stripe>
        <el-table-column prop="artifactCode" label="器物编号" width="140">
          <template #default="{ row }">
            <span class="mono">{{ row.artifactCode }}</span>
          </template>
        </el-table-column>
        <el-table-column label="探方" width="150">
          <template #default="{ row }">
            <span class="mono">{{ trenchLabel(row.trenchId) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="整理室持有单位号" width="150">
          <template #default="{ row }">
            <span class="mono">{{ row.stratumCode || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="问题" width="130">
          <template #default="{ row }">
            <el-tag :type="row.kind === 'unit-missing' ? 'danger' : 'warning'" size="small" effect="dark">
              {{ MISMATCH_KIND_LABELS[row.kind as MismatchKind] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="detail" label="说明" min-width="320" show-overflow-tooltip />
        <template #empty>没有对不上的条目</template>
      </el-table>
    </el-card>

    <el-card shadow="never" class="card">
      <template #header>
        <div class="card-head">
          <span>待核队列（整理室持有 · 等记录员核）</span>
          <el-tag type="danger" effect="plain" size="small">{{ pendingList.length }} 条</el-tag>
        </div>
      </template>
      <el-table :data="pendingList" border stripe>
        <el-table-column prop="code" label="器物编号" width="140">
          <template #default="{ row }">
            <span class="mono">{{ row.code }}</span>
          </template>
        </el-table-column>
        <el-table-column label="探方" width="150">
          <template #default="{ row }">
            <span class="mono">{{ trenchLabel(row.trenchId) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="单位号" width="140">
          <template #default="{ row }">
            <span class="mono">{{ stratumLabelOf(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="出土深度 Z(m)" width="120">
          <template #default="{ row }">{{ row.z }}</template>
        </el-table-column>
        <el-table-column prop="count" label="件数" width="80" />
        <el-table-column prop="tempLocation" label="临时存放" min-width="130" show-overflow-tooltip />
        <el-table-column prop="pendingReason" label="挂起原因" min-width="220" show-overflow-tooltip />
        <el-table-column label="操作" width="170" fixed="right">
          <template #default="{ row }">
            <el-button v-if="canApprove(row)" link type="success" size="small" @click="approve(row)">核准入账</el-button>
            <el-tooltip v-else content="单位已停用，请先改派到现行单位" placement="top">
              <span><el-button link type="success" size="small" disabled>核准入账</el-button></span>
            </el-tooltip>
            <el-button link type="primary" size="small" @click="openReassign(row)">改派单位</el-button>
          </template>
        </el-table-column>
        <template #empty>没有待核的出土物</template>
      </el-table>
    </el-card>

    <el-dialog v-model="reassignVisible" title="改派地层单位" width="640px">
      <template v-if="reassignTarget">
        <p class="dialog-note">
          「{{ reassignTarget.code }}」现挂在 {{ stratumLabelOf(reassignTarget) }}（{{ ARTIFACT_STATUS_LABELS[reassignTarget.status] }}）。
          改派后按新单位深度区间重新判定：落在区间内直接入账，落到区间外继续挂起待核；件数与临时存放位置不挪。
        </p>
        <UnitPicker
          v-model="pickStratumId"
          v-model:trench-id="pickTrenchId"
          :trenches="trenchState.trenches"
          :strata="stratumState.strata"
        />
      </template>
      <template #footer>
        <el-button @click="reassignVisible = false">取消</el-button>
        <el-button type="primary" @click="submitReassign">确认改派</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.alert {
  margin-bottom: 14px;
}
.head-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.card {
  border-radius: 12px;
  margin-bottom: 16px;
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.dialog-note {
  margin: 0 0 12px;
  font-size: 12px;
  color: #8a5a2b;
  line-height: 1.7;
}
</style>
