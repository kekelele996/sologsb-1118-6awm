<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { Artifact, ArtifactCategory, ArtifactStatus, Completeness } from '@/types'
import { ARTIFACT_CATEGORIES, ARTIFACT_STATUS_LABELS, COMPLETENESS, PENDING_REASONS, isDepthInRange } from '@/types'
import StratumDepthBar from '@/components/common/StratumDepthBar.vue'
import UnitPicker from '@/components/common/UnitPicker.vue'
import { useStore } from '@/hooks/usePersistentStore'
import { artifactStore } from '@/stores/artifactStore'
import { stratumStore } from '@/stores/stratumStore'
import { trenchStore } from '@/stores/trenchStore'
import { downloadCsv } from '@/utils/export'
import { uid } from '@/utils/id'

const artifactState = useStore(artifactStore)
const stratumState = useStore(stratumStore)
const trenchState = useStore(trenchStore)

const pickTrenchId = ref('')
const pickStratumId = ref('')
const filterCategory = ref<ArtifactCategory | ''>('')
const filterStatus = ref<ArtifactStatus | ''>('')
const filterTrenchId = ref('')
const editingId = ref<string | null>(null)

const form = reactive({
  code: '',
  category: '陶器' as ArtifactCategory,
  count: 1,
  completeness: '残片' as Completeness,
  x: 2.5,
  y: 2.5,
  z: 0.5,
  date: new Date().toISOString().slice(0, 10),
  collector: '',
  tempLocation: ''
})

const lockedStratum = computed(() => stratumState.strata.find((item) => item.id === pickStratumId.value) ?? null)

watch(
  () => [trenchState.trenches.length, pickTrenchId.value] as const,
  () => {
    if (!pickTrenchId.value && trenchState.trenches.length > 0) {
      pickTrenchId.value = trenchState.trenches[0].id
      const first = stratumState.strata.find((item) => item.trenchId === pickTrenchId.value)
      if (first) pickStratumId.value = first.id
    }
  },
  { immediate: true }
)

watch(
  () => [stratumState.strata.length, pickTrenchId.value] as const,
  () => {
    const list = stratumState.strata.filter((item) => !pickTrenchId.value || item.trenchId === pickTrenchId.value)
    if (!list.some((item) => item.id === pickStratumId.value)) {
      pickStratumId.value = list[0]?.id ?? ''
    }
    if (lockedStratum.value && !editingId.value) {
      form.z = Math.round(((lockedStratum.value.topDepth + lockedStratum.value.bottomDepth) / 2) * 100) / 100
    }
  },
  { immediate: true }
)

function stratumOf(artifact: Artifact): string {
  const unit = stratumState.strata.find((item) => item.id === artifact.stratumId)
  if (unit) return unit.code
  // 单位已停用（拆分/并掉）：按快照原编号留底
  return artifact.stratumCode ? `${artifact.stratumCode}（已停用）` : '未知单位'
}

function trenchOf(artifact: Artifact): string {
  const stratum = stratumState.strata.find((item) => item.id === artifact.stratumId)
  const trenchId = stratum?.trenchId ?? artifact.trenchId
  const trench = trenchState.trenches.find((item) => item.id === trenchId)
  return trench ? `${trench.area} · ${trench.code}` : '未知探方'
}

function rowClass(param: { row: Artifact }): string {
  return param.row.status === 'pending' ? 'pending-row' : ''
}

const visible = computed(() =>
  artifactState.artifacts.filter((item) => {
    if (filterCategory.value && item.category !== filterCategory.value) return false
    if (filterStatus.value && item.status !== filterStatus.value) return false
    if (filterTrenchId.value) {
      const stratum = stratumState.strata.find((row) => row.id === item.stratumId)
      const trenchId = stratum?.trenchId ?? item.trenchId
      if (trenchId !== filterTrenchId.value) return false
    }
    return true
  })
)

const totalCount = computed(() => visible.value.reduce((sum, item) => sum + item.count, 0))

function resetForm(): void {
  editingId.value = null
  form.code = ''
  form.category = '陶器'
  form.count = 1
  form.completeness = '残片'
  form.x = 2.5
  form.y = 2.5
  form.date = new Date().toISOString().slice(0, 10)
  form.collector = ''
  form.tempLocation = ''
  if (lockedStratum.value) {
    form.z = Math.round(((lockedStratum.value.topDepth + lockedStratum.value.bottomDepth) / 2) * 100) / 100
  }
}

function openEdit(artifact: Artifact): void {
  editingId.value = artifact.id
  const stratum = stratumState.strata.find((item) => item.id === artifact.stratumId)
  if (stratum) {
    pickTrenchId.value = stratum.trenchId
    pickStratumId.value = stratum.id
  }
  Object.assign(form, {
    code: artifact.code,
    category: artifact.category,
    count: artifact.count,
    completeness: artifact.completeness,
    x: artifact.x,
    y: artifact.y,
    z: artifact.z,
    date: artifact.date,
    collector: artifact.collector,
    tempLocation: artifact.tempLocation
  })
}

async function submit(): Promise<void> {
  if (!lockedStratum.value) {
    ElMessage.warning('请先选择所属地层单位')
    return
  }
  if (!form.code.trim()) {
    ElMessage.warning('请填写器物编号')
    return
  }
  const duplicated = artifactState.artifacts.some(
    (item) => item.id !== editingId.value && item.code.trim().toUpperCase() === form.code.trim().toUpperCase()
  )
  if (duplicated) {
    ElMessage.error(`器物编号「${form.code}」已存在`)
    return
  }
  // 出土深度掉到单位深度区间外的先挂起来等记录员核，件数与位置照常保留、不挪
  const inRange = isDepthInRange(Number(form.z) || 0, lockedStratum.value)
  const row: Artifact = {
    id: editingId.value ?? uid('af'),
    stratumId: lockedStratum.value.id,
    code: form.code.trim(),
    category: form.category,
    count: Number(form.count) || 1,
    completeness: form.completeness,
    x: Number(form.x) || 0,
    y: Number(form.y) || 0,
    z: Number(form.z) || 0,
    date: form.date,
    collector: form.collector.trim(),
    tempLocation: form.tempLocation.trim(),
    owner: 'lab',
    status: inRange ? 'registered' : 'pending',
    pendingReason: inRange ? '' : PENDING_REASONS.depthOut,
    trenchId: lockedStratum.value.trenchId,
    stratumCode: lockedStratum.value.code
  }
  await artifactStore.getState().save(row)
  if (inRange) {
    ElMessage.success(`出土物 ${row.code} 已登记到 ${lockedStratum.value.code}`)
  } else {
    ElMessage.warning(
      `出土物 ${row.code} 已挂起待核：出土深度 ${row.z} m 不在单位「${lockedStratum.value.code}」的深度区间（${lockedStratum.value.topDepth}–${lockedStratum.value.bottomDepth} m）内，等记录员核；件数与临时存放位置保持原样`
    )
  }
  resetForm()
}

async function remove(artifact: Artifact): Promise<void> {
  await ElMessageBox.confirm(`确认删除出土物「${artifact.code}」？`, '删除确认', { type: 'warning' })
  await artifactStore.getState().remove(artifact.id)
  ElMessage.success('出土物已删除')
}

function exportList(): void {
  downloadCsv(
    '出土物清单.csv',
    visible.value.map((item) => ({
      code: item.code,
      stratum: stratumOf(item),
      trench: trenchOf(item),
      category: item.category,
      count: item.count,
      completeness: item.completeness,
      x: item.x,
      y: item.y,
      z: item.z,
      date: item.date,
      collector: item.collector,
      tempLocation: item.tempLocation,
      status: ARTIFACT_STATUS_LABELS[item.status]
    })) as unknown as Record<string, unknown>[],
    [
      { key: 'code', label: '器物编号' },
      { key: 'stratum', label: '地层单位' },
      { key: 'trench', label: '探方' },
      { key: 'category', label: '类别' },
      { key: 'count', label: '件数' },
      { key: 'completeness', label: '残整程度' },
      { key: 'x', label: 'X(m)' },
      { key: 'y', label: 'Y(m)' },
      { key: 'z', label: 'Z 深度(m)' },
      { key: 'date', label: '出土日期' },
      { key: 'collector', label: '提取人' },
      { key: 'tempLocation', label: '临时存放' },
      { key: 'status', label: '状态' }
    ]
  )
  ElMessage.success('出土物清单已导出')
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="page-title">出土物登记与清单</h2>
        <p class="page-sub">
          整理室台账：登记前先认单位号（选择器按探方与类型级联），页面即时带出该单位的深度区间；出土深度掉到区间外的先挂起待核，
          等记录员核，件数与临时存放位置保持原样。
        </p>
      </div>
      <el-button @click="exportList">导出清单</el-button>
    </div>

    <el-card shadow="never" class="form-card">
      <template #header>登记出土物（整理室持有 · 层位上下文锁定）</template>
      <UnitPicker
        v-model="pickStratumId"
        v-model:trench-id="pickTrenchId"
        :trenches="trenchState.trenches"
        :strata="stratumState.strata"
      />
      <div v-if="lockedStratum" class="locked">
        <StratumDepthBar :stratum="lockedStratum" :length="240" />
        <span class="muted">
          该单位包含物：{{ lockedStratum.inclusions.join('、') || '无' }} · 堆积成因：{{ lockedStratum.formation || '—' }}
        </span>
      </div>
      <el-form label-width="100px" class="form">
        <el-row :gutter="12">
          <el-col :span="8">
            <el-form-item label="器物编号" required>
              <el-input v-model="form.code" placeholder="如 T0501②:2" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="类别">
              <el-select v-model="form.category" style="width: 100%">
                <el-option v-for="item in ARTIFACT_CATEGORIES" :key="item" :label="item" :value="item" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="件数">
              <el-input-number v-model="form.count" :min="1" :controls="false" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="残整程度">
              <el-select v-model="form.completeness" style="width: 100%">
                <el-option v-for="item in COMPLETENESS" :key="item" :label="item" :value="item" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="出土 X(m)">
              <el-input-number v-model="form.x" :min="0" :max="10" :step="0.1" :controls="false" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="出土 Y(m)">
              <el-input-number v-model="form.y" :min="0" :max="10" :step="0.1" :controls="false" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="出土 Z 深度(m)">
              <el-input-number v-model="form.z" :min="0" :max="10" :step="0.01" :precision="2" :controls="false" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="出土日期">
              <el-date-picker v-model="form.date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="提取人">
              <el-input v-model="form.collector" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="临时存放">
              <el-input v-model="form.tempLocation" placeholder="如 工地临时柜 A-2" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <div class="actions">
        <el-button type="primary" @click="submit">{{ editingId ? '保存修改' : '登记出土物' }}</el-button>
        <el-button v-if="editingId" @click="resetForm">取消编辑</el-button>
      </div>
    </el-card>

    <div class="toolbar">
      <el-select v-model="filterTrenchId" placeholder="全部探方" clearable style="width: 190px">
        <el-option v-for="trench in trenchState.trenches" :key="trench.id" :label="`${trench.area} · ${trench.code}`" :value="trench.id" />
      </el-select>
      <el-select v-model="filterCategory" placeholder="全部类别" clearable style="width: 130px">
        <el-option v-for="item in ARTIFACT_CATEGORIES" :key="item" :label="item" :value="item" />
      </el-select>
      <el-select v-model="filterStatus" placeholder="全部状态" clearable style="width: 120px">
        <el-option label="已入账" value="registered" />
        <el-option label="待核" value="pending" />
      </el-select>
      <el-tag type="info" effect="plain">命中 {{ visible.length }} 条 · 合计 {{ totalCount }} 件</el-tag>
    </div>

    <el-table :data="visible" border stripe row-key="id" :row-class-name="rowClass">
      <el-table-column prop="code" label="器物编号" width="140" />
      <el-table-column label="探方" width="150">
        <template #default="{ row }: { row: Artifact }">
          <span class="mono">{{ trenchOf(row) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="地层单位" width="130">
        <template #default="{ row }: { row: Artifact }">
          <span class="mono">{{ stratumOf(row) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }: { row: Artifact }">
          <el-tooltip v-if="row.status === 'pending'" :content="row.pendingReason" placement="top">
            <el-tag type="danger" size="small" effect="dark">待核</el-tag>
          </el-tooltip>
          <el-tag v-else type="success" size="small" effect="plain">已入账</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="归属" width="100">
        <template #default>
          <el-tag type="warning" size="small" effect="plain">整理室</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="深度区间" width="240">
        <template #default="{ row }: { row: Artifact }">
          <StratumDepthBar
            v-if="stratumState.strata.find((item) => item.id === row.stratumId)"
            :stratum="stratumState.strata.find((item) => item.id === row.stratumId)!"
            :length="170"
            :show-thickness="false"
          />
        </template>
      </el-table-column>
      <el-table-column prop="category" label="类别" width="90" />
      <el-table-column prop="count" label="件数" width="80" />
      <el-table-column prop="completeness" label="残整" width="90" />
      <el-table-column label="出土坐标 (X,Y,Z)" width="170">
        <template #default="{ row }: { row: Artifact }">{{ row.x }}, {{ row.y }}, {{ row.z }}</template>
      </el-table-column>
      <el-table-column prop="date" label="出土日期" width="120" />
      <el-table-column prop="collector" label="提取人" width="90" />
      <el-table-column prop="tempLocation" label="临时存放" min-width="140" show-overflow-tooltip />
      <el-table-column label="操作" width="130" fixed="right">
        <template #default="{ row }: { row: Artifact }">
          <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" size="small" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.form-card {
  border-radius: 12px;
  margin-bottom: 16px;
}
.locked {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin: 10px 0;
  padding: 8px 12px;
  border-radius: 8px;
  background: #f7f4ee;
}
.form {
  margin-top: 8px;
}
.actions {
  padding-left: 100px;
}
</style>
