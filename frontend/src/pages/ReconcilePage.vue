<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { Mismatch, Stratum } from '@/types'
import { MISMATCH_KIND_LABELS, OWNER_LABELS } from '@/types'
import { useStore } from '@/hooks/usePersistentStore'
import { artifactStore } from '@/stores/artifactStore'
import { reconcileStore } from '@/stores/reconcileStore'
import { stratumStore } from '@/stores/stratumStore'

const reconcileState = useStore(reconcileStore)
const stratumState = useStore(stratumStore)

const running = ref(false)

const latestRun = computed(() => reconcileState.runs[0] ?? null)

const latestMismatches = computed(() => {
  if (!latestRun.value) return []
  return reconcileState.mismatches
    .filter((item) => item.runId === latestRun.value!.id)
    .sort((a, b) => (a.status === b.status ? a.unitCode.localeCompare(b.unitCode, 'zh-Hans-CN') : a.status === 'open' ? -1 : 1))
})

const openCount = computed(() => latestMismatches.value.filter((item) => item.status === 'open').length)

function fmt(iso: string | null): string {
  return iso ? iso.slice(0, 19).replace('T', ' ') : '—'
}

async function run(): Promise<void> {
  running.value = true
  try {
    await reconcileStore.getState().run()
    const run = reconcileStore.getState().runs[0]
    if (run?.labStatus === 'failed') {
      ElMessage.warning(`对账完成，但整理室侧比对失败：${run.labError}。工地快照已保留，可只重试整理室侧`)
    } else {
      ElMessage.success('对账完成，对不上的已摆入差异清单')
    }
  } finally {
    running.value = false
  }
}

async function retryLab(): Promise<void> {
  running.value = true
  try {
    await reconcileStore.getState().retryLab()
    const run = reconcileStore.getState().runs[0]
    if (run?.labStatus === 'failed') {
      ElMessage.warning(`整理室侧重试仍失败：${run.labError}（工地快照未动）`)
    } else {
      ElMessage.success('整理室侧已重跑（沿用原工地快照，工地那份未受影响）')
    }
  } finally {
    running.value = false
  }
}

/* ---------- 人工裁定 ---------- */

const resolveVisible = ref(false)
const resolving = ref<Mismatch | null>(null)
const resolveMode = ref<'reassign' | 'keep-pending' | 'ack'>('ack')
const reassignTargetId = ref('')

const activeStrata = computed(() => stratumState.strata.filter((item) => item.lifecycle === 'active'))

function openResolve(mismatch: Mismatch): void {
  resolving.value = mismatch
  resolveMode.value = mismatch.side === 'lab' ? 'reassign' : 'ack'
  reassignTargetId.value = ''
  resolveVisible.value = true
}

async function submitResolve(): Promise<void> {
  const mismatch = resolving.value
  if (!mismatch) return
  let resolution = ''
  if (mismatch.side === 'lab' && resolveMode.value === 'reassign') {
    const target: Stratum | undefined = activeStrata.value.find((item) => item.id === reassignTargetId.value)
    if (!target) {
      ElMessage.warning('请选择要改挂的在册单位')
      return
    }
    const moved = await artifactStore.getState().reassignUnit(mismatch.unitCode, target)
    resolution = `人定：${moved} 件出土物改挂到在册单位「${target.code}」，按深度重新判定状态`
  } else if (mismatch.side === 'lab' && resolveMode.value === 'keep-pending') {
    resolution = '人定：维持挂起待核，等记录员核'
  } else {
    resolution = '人定：知悉，该在册单位暂无出土物记录'
  }
  await reconcileStore.getState().resolve(mismatch.id, resolution)
  ElMessage.success('差异已裁定')
  resolveVisible.value = false
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="page-title">两侧对账（按单位号）</h2>
        <p class="page-sub">
          工地记录员出单位号清册，整理室出认下的单位号，两边按单位号对账；对不上的摆出来等人定。整理室侧对账失败可只重试自己那份，工地快照不受影响。
        </p>
      </div>
      <el-button type="primary" :loading="running" @click="run">发起对账</el-button>
    </div>

    <el-card v-if="latestRun" shadow="never" class="run-card">
      <template #header>
        <div class="run-head">
          <span>最近一次对账（{{ fmt(latestRun.startedAt) }}）</span>
          <el-tag :type="latestRun.labStatus === 'ok' ? 'success' : 'danger'" size="small" effect="dark">
            整理室侧{{ latestRun.labStatus === 'ok' ? '比对完成' : '比对失败' }}
          </el-tag>
        </div>
      </template>
      <div class="run-body">
        <div class="run-cell">
          <div class="run-label">工地侧快照（工地那份）</div>
          <div>{{ latestRun.fieldUnits.length }} 个单位号 · 取于 {{ fmt(latestRun.fieldSnapshotAt) }}</div>
        </div>
        <div class="run-cell">
          <div class="run-label">整理室侧比对（整理室那份）</div>
          <div>
            完成于 {{ fmt(latestRun.labFinishedAt) }}
            <span v-if="latestRun.labError" class="error-text"> · {{ latestRun.labError }}</span>
          </div>
        </div>
        <div class="run-cell actions">
          <el-button
            :type="latestRun.labStatus === 'failed' ? 'danger' : 'default'"
            :loading="running"
            @click="retryLab"
          >
            {{ latestRun.labStatus === 'failed' ? '重试整理室侧' : '重跑整理室侧' }}
          </el-button>
          <span class="muted">只重跑整理室那份，工地快照原样保留</span>
        </div>
      </div>
    </el-card>
    <el-alert v-else class="alert" type="info" :closable="false" show-icon title="尚未对账：点击「发起对账」取一次工地快照并比对整理室登记" />

    <template v-if="latestRun">
      <div class="toolbar">
        <el-tag v-if="openCount > 0" type="warning" effect="dark">待裁定 {{ openCount }} 条</el-tag>
        <el-tag v-else type="success" effect="plain">本次对账无未决差异</el-tag>
        <span class="muted">差异共 {{ latestMismatches.length }} 条（含已裁定）</span>
      </div>

      <el-table :data="latestMismatches" border stripe row-key="id">
        <el-table-column prop="unitCode" label="单位号" width="110">
          <template #default="{ row }: { row: Mismatch }">
            <span class="mono">{{ row.unitCode || '（空）' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="出自哪侧" width="110">
          <template #default="{ row }: { row: Mismatch }">
            <el-tag :type="row.side === 'lab' ? 'warning' : 'primary'" size="small" effect="plain">{{ OWNER_LABELS[row.side] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="差异类型" width="220">
          <template #default="{ row }: { row: Mismatch }">{{ MISMATCH_KIND_LABELS[row.kind] }}</template>
        </el-table-column>
        <el-table-column prop="detail" label="说明" min-width="320" show-overflow-tooltip />
        <el-table-column label="状态" width="90">
          <template #default="{ row }: { row: Mismatch }">
            <el-tag v-if="row.status === 'open'" type="warning" size="small" effect="dark">待裁定</el-tag>
            <el-tag v-else type="success" size="small" effect="plain">已裁定</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="resolution" label="裁定结论" min-width="200" show-overflow-tooltip>
          <template #default="{ row }: { row: Mismatch }">{{ row.resolution || '—' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }: { row: Mismatch }">
            <el-button v-if="row.status === 'open'" link type="primary" size="small" @click="openResolve(row)">裁定</el-button>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
      </el-table>
    </template>

    <el-dialog v-model="resolveVisible" :title="`裁定差异：单位号「${resolving?.unitCode ?? ''}」`" width="520px">
      <p class="dialog-detail">{{ resolving?.detail }}</p>
      <template v-if="resolving?.side === 'lab'">
        <el-radio-group v-model="resolveMode" class="resolve-modes">
          <el-radio value="reassign">改挂到在册单位（出土物按新单位深度重新判定）</el-radio>
          <el-radio value="keep-pending">维持挂起待核，等记录员核</el-radio>
        </el-radio-group>
        <el-select v-if="resolveMode === 'reassign'" v-model="reassignTargetId" placeholder="选择在册单位" style="width: 100%; margin-top: 10px">
          <el-option
            v-for="item in activeStrata"
            :key="item.id"
            :label="`${item.code}（${item.type} · ${item.topDepth}–${item.bottomDepth} m）`"
            :value="item.id"
          />
        </el-select>
      </template>
      <p v-else class="muted">工地侧提示类差异：确认知悉即可了结。</p>
      <template #footer>
        <el-button @click="resolveVisible = false">取消</el-button>
        <el-button type="primary" @click="submitResolve">确认裁定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.alert {
  margin-bottom: 14px;
}
.run-card {
  border-radius: 12px;
  margin-bottom: 16px;
}
.run-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.run-body {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  align-items: center;
}
.run-cell {
  min-width: 220px;
}
.run-cell.actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.run-label {
  font-size: 12px;
  color: #8a8073;
  margin-bottom: 4px;
}
.error-text {
  color: #c0392b;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.dialog-detail {
  margin: 0 0 12px;
  padding: 8px 12px;
  border-radius: 8px;
  background: #f7f4ee;
  font-size: 13px;
}
.resolve-modes {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
}
</style>
