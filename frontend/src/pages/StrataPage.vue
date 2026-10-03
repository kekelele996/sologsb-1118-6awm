<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { Inclusion, Stratum, UnitType } from '@/types'
import { INCLUSIONS, LIFECYCLE_LABELS, UNIT_TYPES, isCodeDuplicated, isDepthInverted, stratumThickness } from '@/types'
import StratumDepthBar from '@/components/common/StratumDepthBar.vue'
import TrenchTag from '@/components/common/TrenchTag.vue'
import { useStore } from '@/hooks/usePersistentStore'
import { useStratumOrder } from '@/hooks/useStratumOrder'
import { stratumStore } from '@/stores/stratumStore'
import { trenchStore } from '@/stores/trenchStore'
import { artifactStore } from '@/stores/artifactStore'
import { relationStore } from '@/stores/relationStore'
import { uid } from '@/utils/id'

const trenchState = useStore(trenchStore)
const stratumState = useStore(stratumStore)
const artifactState = useStore(artifactStore)
const relationState = useStore(relationStore)

const { result: order } = useStratumOrder(
  computed(() => stratumState.strata),
  computed(() => relationState.relations)
)

const filterTrenchId = ref('')
const filterType = ref<UnitType | ''>('')
const depthFrom = ref<number | undefined>(undefined)
const depthTo = ref<number | undefined>(undefined)
const selectedIds = ref<string[]>([])
const batchType = ref<UnitType>('地层')

const dialogVisible = ref(false)
const editingId = ref<string | null>(null)

const form = reactive({
  trenchId: '',
  code: '',
  type: '地层' as UnitType,
  openLayer: '第①层',
  topDepth: 0,
  bottomDepth: 0.3,
  soil: '',
  inclusions: [] as Inclusion[],
  formation: '',
  date: new Date().toISOString().slice(0, 10),
  drawingNo: ''
})

const visible = computed(() =>
  stratumState.strata.filter((item) => {
    if (filterTrenchId.value && item.trenchId !== filterTrenchId.value) return false
    if (filterType.value && item.type !== filterType.value) return false
    if (depthFrom.value !== undefined && item.bottomDepth < depthFrom.value) return false
    if (depthTo.value !== undefined && item.topDepth > depthTo.value) return false
    return true
  })
)

function trenchLabel(trenchId: string): string {
  const trench = trenchState.trenches.find((item) => item.id === trenchId)
  return trench ? `${trench.area} · ${trench.code}` : '未知探方'
}

function artifactsOf(stratumId: string): number {
  return artifactState.artifacts.filter((item) => item.stratumId === stratumId).reduce((sum, item) => sum + item.count, 0)
}

function pendingOf(stratumId: string): number {
  return artifactState.artifacts.filter((item) => item.stratumId === stratumId && item.status === 'pending').length
}

function invertedOf(stratum: Stratum): boolean {
  return isDepthInverted(stratum)
}

function duplicatedOf(stratum: Stratum): boolean {
  return isCodeDuplicated(stratumState.strata, stratum)
}

function rowClass(param: { row: Stratum }): string {
  if (invertedOf(param.row)) return 'inverted-row'
  if (duplicatedOf(param.row)) return 'duplicate-row'
  return ''
}

/** 与层位关系矛盾的告警（按单位过滤） */
const conflictOf = (code: string): string | null =>
  order.value.conflicts.find((item) => item.startsWith(code)) ?? null

watch(
  () => [trenchState.trenches.length, form.trenchId] as const,
  () => {
    if (!form.trenchId && trenchState.trenches.length > 0) form.trenchId = trenchState.trenches[0].id
  },
  { immediate: true }
)

function resetForm(): void {
  editingId.value = null
  form.trenchId = trenchState.trenches[0]?.id ?? ''
  form.code = ''
  form.type = '地层'
  form.openLayer = '第①层'
  form.topDepth = 0
  form.bottomDepth = 0.3
  form.soil = ''
  form.inclusions = []
  form.formation = ''
  form.date = new Date().toISOString().slice(0, 10)
  form.drawingNo = ''
}

function openCreate(): void {
  resetForm()
  dialogVisible.value = true
}

function openEdit(stratum: Stratum): void {
  editingId.value = stratum.id
  Object.assign(form, {
    trenchId: stratum.trenchId,
    code: stratum.code,
    type: stratum.type,
    openLayer: stratum.openLayer,
    topDepth: stratum.topDepth,
    bottomDepth: stratum.bottomDepth,
    soil: stratum.soil,
    inclusions: [...stratum.inclusions],
    formation: stratum.formation,
    date: stratum.date,
    drawingNo: stratum.drawingNo
  })
  dialogVisible.value = true
}

async function submit(): Promise<void> {
  if (!form.trenchId) {
    ElMessage.warning('请选择所属探方')
    return
  }
  if (!form.code.trim()) {
    ElMessage.warning('请填写单位号（如 H12、L03）')
    return
  }
  if (form.topDepth < 0 || form.bottomDepth < 0) {
    ElMessage.warning('深度不能为负值')
    return
  }
  const candidate = { id: editingId.value ?? uid('st'), trenchId: form.trenchId, code: form.code.trim().toUpperCase() }
  if (isCodeDuplicated(stratumState.strata, candidate)) {
    ElMessage.error(`同一探方内单位号「${candidate.code}」已存在，请更换`)
    return
  }
  const origin = editingId.value ? stratumState.strata.find((item) => item.id === editingId.value) : null
  const row: Stratum = {
    id: candidate.id,
    trenchId: candidate.trenchId,
    code: candidate.code,
    type: form.type,
    openLayer: form.openLayer.trim(),
    topDepth: Number(form.topDepth) || 0,
    bottomDepth: Number(form.bottomDepth) || 0,
    soil: form.soil.trim(),
    inclusions: [...form.inclusions],
    formation: form.formation.trim(),
    date: form.date,
    drawingNo: form.drawingNo.trim(),
    owner: 'field',
    lifecycle: origin?.lifecycle ?? 'active',
    successorCodes: origin?.successorCodes ?? []
  }
  await stratumStore.getState().save(row)
  if (isDepthInverted(row)) {
    ElMessage.warning(`已保存，但「${row.code}」上界深度大于下界，层序倒置需复核`)
  } else {
    ElMessage.success(`地层单位 ${row.code} 已保存（厚 ${stratumThickness(row)} m）`)
  }
  dialogVisible.value = false
}

async function remove(stratum: Stratum): Promise<void> {
  if (stratum.lifecycle !== 'active') {
    ElMessage.error(`「${stratum.code}」已${LIFECYCLE_LABELS[stratum.lifecycle]}，档案与层位关系按原编号保留，不能删除`)
    return
  }
  const count = artifactState.artifacts.filter((item) => item.stratumId === stratum.id).length
  const relations = relationState.relations.filter(
    (item) => item.unitAId === stratum.id || item.unitBId === stratum.id
  ).length
  if (count > 0 || relations > 0) {
    ElMessage.error(`「${stratum.code}」下仍有 ${count} 件出土物、${relations} 条层位关系，请先清理`)
    return
  }
  await ElMessageBox.confirm(`确认删除地层单位「${stratum.code}」？`, '删除确认', { type: 'warning' })
  await stratumStore.getState().remove(stratum.id)
  ElMessage.success('地层单位已删除')
}

async function applyBatchType(): Promise<void> {
  if (selectedIds.value.length === 0) {
    ElMessage.warning('请先勾选要调整的单位')
    return
  }
  await stratumStore.getState().bulkSetType(selectedIds.value, batchType.value)
  ElMessage.success(`已把 ${selectedIds.value.length} 个单位的类型调整为「${batchType.value}」`)
}

/* ---------- 拆分 / 合并（记录员操作；整理室挂在底下的出土物退回待核，层位关系照旧） ---------- */

const splitVisible = ref(false)
const splitSource = ref<Stratum | null>(null)
const splitParts = ref<{ code: string; topDepth: number; bottomDepth: number }[]>([])

function openSplit(stratum: Stratum): void {
  splitSource.value = stratum
  const top = Math.min(stratum.topDepth, stratum.bottomDepth)
  const bottom = Math.max(stratum.topDepth, stratum.bottomDepth)
  const mid = Math.round(((top + bottom) / 2) * 100) / 100
  splitParts.value = [
    { code: `${stratum.code}-1`, topDepth: top, bottomDepth: mid },
    { code: `${stratum.code}-2`, topDepth: mid, bottomDepth: bottom }
  ]
  splitVisible.value = true
}

function addSplitPart(): void {
  const source = splitSource.value
  if (!source) return
  const bottom = Math.max(source.topDepth, source.bottomDepth)
  splitParts.value.push({ code: `${source.code}-${splitParts.value.length + 1}`, topDepth: bottom, bottomDepth: bottom })
}

function removeSplitPart(index: number): void {
  if (splitParts.value.length <= 2) return
  splitParts.value.splice(index, 1)
}

async function submitSplit(): Promise<void> {
  const source = splitSource.value
  if (!source) return
  const parts = splitParts.value.map((part) => ({
    code: part.code.trim().toUpperCase(),
    topDepth: Number(part.topDepth) || 0,
    bottomDepth: Number(part.bottomDepth) || 0
  }))
  if (parts.some((part) => !part.code)) {
    ElMessage.warning('请为每个新单位填写单位号')
    return
  }
  if (new Set(parts.map((part) => part.code)).size !== parts.length) {
    ElMessage.error('新单位号之间不能重复')
    return
  }
  const clash = parts.find((part) => isCodeDuplicated(stratumState.strata, { id: '__new__', trenchId: source.trenchId, code: part.code }))
  if (clash) {
    ElMessage.error(`同一探方内单位号「${clash.code}」已存在，请更换`)
    return
  }
  const { returned } = await stratumStore.getState().split(source.id, parts)
  ElMessage.success(
    `「${source.code}」已拆分为 ${parts.map((part) => part.code).join('、')}；${returned} 件出土物退回待核，层位关系仍按原编号保留`
  )
  splitVisible.value = false
}

const mergeVisible = ref(false)
const mergeSource = ref<Stratum | null>(null)
const mergeTargetId = ref('')

const mergeCandidates = computed(() =>
  mergeSource.value
    ? stratumState.strata.filter(
        (item) => item.id !== mergeSource.value!.id && item.trenchId === mergeSource.value!.trenchId && item.lifecycle === 'active'
      )
    : []
)

function openMerge(stratum: Stratum): void {
  mergeSource.value = stratum
  mergeTargetId.value = ''
  mergeVisible.value = true
}

async function submitMerge(): Promise<void> {
  const source = mergeSource.value
  if (!source) return
  const target = stratumState.strata.find((item) => item.id === mergeTargetId.value)
  if (!target) {
    ElMessage.warning('请选择并入的目标单位')
    return
  }
  const { returned } = await stratumStore.getState().merge(source.id, target.id)
  ElMessage.success(`「${source.code}」已并掉，去向记为「${target.code}」；${returned} 件出土物退回待核，层位关系仍按原编号保留`)
  mergeVisible.value = false
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="page-title">地层单位编目表（工地记录员）</h2>
        <p class="page-sub">
          单位号、上下界深度由记录员定；单位拆开或并掉后，整理室挂在底下的出土物退回待核，层位关系照旧按原编号保留。
        </p>
      </div>
      <el-button type="primary" @click="openCreate">
        <el-icon><Plus /></el-icon>新建地层单位
      </el-button>
    </div>

    <el-alert
      v-if="order.inverted.length > 0 || order.duplicateCodes.length > 0"
      class="alert"
      type="warning"
      :closable="false"
      show-icon
      :title="`发现 ${order.inverted.length} 个层序倒置单位、${order.duplicateCodes.length} 个重复单位号`"
    >
      <template #default>
        <p v-if="order.inverted.length > 0">
          层序倒置：{{ order.inverted.map((item) => item.code).join('、') }}（上界深度大于下界深度）
        </p>
        <p v-if="order.duplicateCodes.length > 0">单位号重复：{{ order.duplicateCodes.join('、') }}</p>
        <p v-if="order.conflicts.length > 0">
          与层位关系矛盾：{{ order.conflicts.join('；') }}
        </p>
      </template>
    </el-alert>
    <el-alert
      v-else
      class="alert"
      type="success"
      :closable="false"
      show-icon
      title="层序与单位号校验通过"
    />

    <div class="toolbar">
      <el-select v-model="filterTrenchId" placeholder="全部探方" clearable style="width: 190px">
        <el-option v-for="trench in trenchState.trenches" :key="trench.id" :label="`${trench.area} · ${trench.code}`" :value="trench.id" />
      </el-select>
      <el-select v-model="filterType" placeholder="全部类型" clearable style="width: 130px">
        <el-option v-for="type in UNIT_TYPES" :key="type" :label="type" :value="type" />
      </el-select>
      <div class="depth">
        <span class="muted">深度区间（米）</span>
        <el-input-number v-model="depthFrom" :min="0" :step="0.1" :controls="false" placeholder="起" style="width: 100px" />
        <span>—</span>
        <el-input-number v-model="depthTo" :min="0" :step="0.1" :controls="false" placeholder="止" style="width: 100px" />
      </div>
      <el-select v-model="batchType" style="width: 130px">
        <el-option v-for="type in UNIT_TYPES" :key="type" :label="type" :value="type" />
      </el-select>
      <el-button type="primary" plain @click="applyBatchType">批量调整类型</el-button>
      <el-tag type="info" effect="plain">命中 {{ visible.length }} / {{ stratumState.strata.length }} 个单位</el-tag>
    </div>

    <el-table
      :data="visible"
      border
      stripe
      row-key="id"
      :row-class-name="rowClass"
      @selection-change="(rows: Stratum[]) => (selectedIds = rows.map((row) => row.id))"
    >
      <el-table-column type="selection" width="46" />
      <el-table-column label="序号" width="70">
        <template #default="{ row }: { row: Stratum }">{{ order.indexOf.get(row.id) ?? '—' }}</template>
      </el-table-column>
      <el-table-column label="探方" width="150">
        <template #default="{ row }: { row: Stratum }">
          <span class="mono">{{ trenchLabel(row.trenchId) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="单位号" width="110">
        <template #default="{ row }: { row: Stratum }">
          <span class="mono">{{ row.code }}</span>
          <el-tag v-if="duplicatedOf(row)" type="warning" size="small" effect="dark" class="mini">重复</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="130">
        <template #default="{ row }: { row: Stratum }">
          <el-tag v-if="row.lifecycle === 'active'" type="success" size="small" effect="plain">在册</el-tag>
          <el-tooltip v-else :content="`去向：${row.successorCodes.join('、') || '—'}`" placement="top">
            <el-tag type="info" size="small" effect="dark">{{ LIFECYCLE_LABELS[row.lifecycle] }}</el-tag>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column label="类型" width="110">
        <template #default="{ row }: { row: Stratum }">
          <TrenchTag :unit-type="row.type" size="small" />
        </template>
      </el-table-column>
      <el-table-column label="深度刻度" width="240">
        <template #default="{ row }: { row: Stratum }">
          <StratumDepthBar :stratum="row" :length="170" />
        </template>
      </el-table-column>
      <el-table-column label="开口层位" width="100" prop="openLayer" />
      <el-table-column label="土质土色" min-width="140" prop="soil" show-overflow-tooltip />
      <el-table-column label="包含物" width="140">
        <template #default="{ row }: { row: Stratum }">
          <el-tag v-for="item in row.inclusions" :key="item" size="small" effect="plain" class="mini">{{ item }}</el-tag>
          <span v-if="row.inclusions.length === 0" class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="出土物" width="110">
        <template #default="{ row }: { row: Stratum }">
          {{ artifactsOf(row.id) }} 件
          <el-tag v-if="pendingOf(row.id) > 0" type="warning" size="small" effect="dark" class="mini">待核 {{ pendingOf(row.id) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="校验" width="110">
        <template #default="{ row }: { row: Stratum }">
          <el-tag v-if="invertedOf(row)" type="danger" size="small" effect="dark">层序倒置</el-tag>
          <el-tag v-else-if="conflictOf(row.code)" type="warning" size="small" effect="dark">关系矛盾</el-tag>
          <el-tag v-else type="success" size="small" effect="plain">正常</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="230" fixed="right">
        <template #default="{ row }: { row: Stratum }">
          <template v-if="row.lifecycle === 'active'">
            <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
            <el-button link type="warning" size="small" @click="openSplit(row)">拆分</el-button>
            <el-button link type="warning" size="small" @click="openMerge(row)">并掉</el-button>
            <el-button link type="danger" size="small" @click="remove(row)">删除</el-button>
          </template>
          <span v-else class="muted">档案保留，不再改动</span>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑地层单位' : '新建地层单位'" width="680px">
      <el-form label-width="110px">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="所属探方" required>
              <el-select v-model="form.trenchId" style="width: 100%">
                <el-option v-for="trench in trenchState.trenches" :key="trench.id" :label="`${trench.area} · ${trench.code}`" :value="trench.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="单位号" required>
              <el-input v-model="form.code" placeholder="如 H12、L03" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="单位类型">
              <el-select v-model="form.type" style="width: 100%">
                <el-option v-for="type in UNIT_TYPES" :key="type" :label="type" :value="type" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="开口层位">
              <el-input v-model="form.openLayer" placeholder="如 第②层下" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="8">
            <el-form-item label="上界深度(m)">
              <el-input-number v-model="form.topDepth" :min="0" :step="0.05" :precision="2" :controls="false" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="下界深度(m)">
              <el-input-number v-model="form.bottomDepth" :min="0" :step="0.05" :precision="2" :controls="false" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="厚度">
              <el-input :model-value="`${Math.abs(form.bottomDepth - form.topDepth).toFixed(2)} m`" disabled />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="土质土色">
          <el-input v-model="form.soil" placeholder="如 灰褐色砂质黏土，疏松" />
        </el-form-item>
        <el-form-item label="包含物">
          <el-checkbox-group v-model="form.inclusions">
            <el-checkbox v-for="item in INCLUSIONS" :key="item" :value="item">{{ item }}</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="堆积成因">
          <el-input v-model="form.formation" placeholder="如 生活垃圾坑" />
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="发掘日期">
              <el-date-picker v-model="form.date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="绘图/拍照号">
              <el-input v-model="form.drawingNo" placeholder="如 T0501-北壁-02" />
            </el-form-item>
          </el-col>
        </el-row>
        <p v-if="form.topDepth > form.bottomDepth" class="warn">上界深度大于下界深度，保存后将标记为「层序倒置」</p>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submit">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="splitVisible" :title="`拆分单位「${splitSource?.code ?? ''}」`" width="640px">
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        class="alert"
        title="拆分后原单位号保留为档案（层位关系照旧引用原编号），整理室挂在原单位底下的出土物全部退回待核"
      />
      <div v-for="(part, index) in splitParts" :key="index" class="split-row">
        <el-input v-model="part.code" placeholder="新单位号" style="width: 140px" />
        <el-input-number v-model="part.topDepth" :min="0" :step="0.05" :precision="2" :controls="false" placeholder="上界" style="width: 110px" />
        <span>—</span>
        <el-input-number v-model="part.bottomDepth" :min="0" :step="0.05" :precision="2" :controls="false" placeholder="下界" style="width: 110px" />
        <span class="muted">m</span>
        <el-button link type="danger" size="small" :disabled="splitParts.length <= 2" @click="removeSplitPart(index)">移除</el-button>
      </div>
      <el-button link type="primary" size="small" @click="addSplitPart">+ 增加一个新单位</el-button>
      <template #footer>
        <el-button @click="splitVisible = false">取消</el-button>
        <el-button type="warning" @click="submitSplit">确认拆分</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="mergeVisible" :title="`并掉单位「${mergeSource?.code ?? ''}」`" width="480px">
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        class="alert"
        title="并掉后原单位号保留为档案（层位关系照旧引用原编号），整理室挂在原单位底下的出土物全部退回待核"
      />
      <el-form label-width="90px">
        <el-form-item label="并入目标" required>
          <el-select v-model="mergeTargetId" placeholder="选择同探方在册单位" style="width: 100%">
            <el-option
              v-for="item in mergeCandidates"
              :key="item.id"
              :label="`${item.code}（${item.type} · ${item.topDepth}–${item.bottomDepth} m）`"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="mergeVisible = false">取消</el-button>
        <el-button type="warning" @click="submitMerge">确认并掉</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.alert {
  margin-bottom: 14px;
}
.depth {
  display: flex;
  align-items: center;
  gap: 6px;
}
.mini {
  margin-left: 4px;
}
.warn {
  margin: 0;
  color: #c0392b;
  font-size: 12px;
}
.split-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
</style>
