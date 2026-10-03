# 考古探方地层编目台（gbtrenchlog）

面向考古发掘工地的记录员与整理人员，把「探方 → 地层单位 → 堆积描述 → 层位关系 → 出土物」整理成一套可核对的编目档案，解决地层编号重复、打破与叠压关系记不清、出土物脱离层位上下文的问题。**纯前端单页应用**，全部数据保存在浏览器 IndexedDB，不依赖任何后端服务或外部接口。

## 双侧分权与对账机制

工地记录员与整理室各持一份数据，按单位号咬合：

- **数据归属**：地层单位的单位号、上下界深度与层位关系由工地记录员定（`owner: 'field'`）；出土物的器物编号、件数与临时存放位置由整理室填（`owner: 'lab'`）。两侧分表分 store，各写各的那份；
- **登记先认单位号**：整理室登记出土物前先认工地侧在册单位号；出土深度掉到单位深度区间外的**先挂起待核**等记录员核，件数与存放位置按原样保留、不挪不动；
- **拆并退回**：记录员把单位拆开或并掉后，整理室挂在原单位底下的那批出土物全部**退回待核**；原单位号保留为档案，层位关系照旧按原编号引用，不做改写；
- **按单位号对账**：两侧按单位号对账，对不上的（整理室认了工地没有的号、已拆并单位仍挂出土物、在册单位整理室无记录）摆进差异清单**等人裁定**（改挂在册单位 / 维持挂起 / 知悉了结）；
- **分侧重试**：整理室侧对账失败只重试自己那份——沿用原工地快照重跑比对，工地那份数据与快照不受影响；
- **迁移回填**：旧数据没记归属，schema v3 升级时按现有单位回填单位号快照、状态与归属，回填完成再启用。

## 一、Docker 一键启动（推荐）

```bash
cp .env.example .env      # 首次启动先复制环境变量文件
docker compose up -d --build
```

启动后访问：<http://localhost:21818>

```bash
docker compose ps        # 查看容器状态
docker compose logs -f   # 查看日志
docker compose down      # 停止并移除容器（数据在浏览器本地）
```

`.env` 可调：

```
COMPOSE_PROJECT_NAME=gbtrenchlog
FRONTEND_PORT=21818
```

## 二、技术栈

| 层次 | 选型 |
| --- | --- |
| 框架 | Vue 3（Composition API） |
| 语言 | TypeScript（`vue-tsc` 类型检查零错误） |
| UI 组件库 | Element Plus |
| 状态管理 | Zustand（`zustand/vanilla` createStore + Vue 响应式桥接） |
| 路由 | Vue Router 4（History 模式，nginx `try_files` 回落） |
| 构建 | Vite 6 |
| 本地存储 | IndexedDB（Dexie 封装，含 `schemaVersion` 与升级迁移） |
| 测试 | Vitest（领域规则单测 + fake-indexeddb 迁移集成测试） |
| 部署 | 多阶段 Dockerfile：`node:20-alpine` 构建 → `nginx:alpine` 托管 |

## 三、本地开发

```bash
cd frontend
npm install
npm run dev        # http://localhost:21818
npm run build      # 类型检查 + 生产构建
npm run test       # Vitest：领域规则单测 + v2→v3 迁移集成测试
```

## 四、目录结构

```
sologsb-1118/
├── docker-compose.yml          # 顶层 name: gbtrenchlog，无 version 字段
├── .env.example                # COMPOSE_PROJECT_NAME / FRONTEND_PORT
├── frontend/
│   ├── Dockerfile              # 多阶段构建，nginx 阶段 chmod -R a+rX 静态资源
│   ├── nginx.conf              # try_files 前端路由回落 + gzip
│   ├── public/favicon.svg
│   ├── tests/                  # registration / reorganize / reconcile / migrate / 迁移集成
│   └── src/
│       ├── types/              # trench / stratum / artifact / relation / ownership / reconcile
│       ├── domain/             # 纯函数机制：registration / reorganize / reconcile / migrate
│       ├── stores/             # trench / stratum / artifact / relation / reconcile（Zustand）
│       ├── components/common/  # StratumDepthBar / RelationGraph / TrenchTag / UnitPicker
│       ├── hooks/              # useStratumOrder / useRelationGraph / usePersistentStore
│       ├── pages/              # Trenches / Strata / Artifacts / Relations / Sections / Reconcile
│       ├── router/index.ts
│       └── utils/              # graph.ts / export.ts / id.ts
```

## 五、数据模型与存储

| 模型 | 说明 | Dexie 表 |
| --- | --- | --- |
| Trench 探方 | 探方号、发掘区、规格、基点坐标、开口层位、发掘起止、负责人、四壁备注、是否回填 | `trenches` |
| Stratum 地层单位 | 单位号、类型（地层/灰坑/房址/沟/墓葬）、开口层位、上下界深度、土质土色、包含物、堆积成因、绘图拍照号；归属 `owner='field'`，生命周期（在册/已拆分/已并掉）与去向单位号 | `strata` |
| Artifact 出土物 | 所属地层单位、器物编号、类别、件数、残整程度、探方内 X/Y/Z、出土日期、提取人、临时存放；归属 `owner='lab'`，认下的单位号快照 `unitCode`，状态（已确认/待核）与待核原因 | `artifacts` |
| Relation 层位关系 | 单位 A、关系类型（叠压/打破/共存）、单位 B、判定依据、记录人、备注 | `relations` |
| ReconcileRun 对账运行 | 一次对账的工地侧单位号快照（含快照时间）与整理室侧比对状态 | `reconcileRuns` |
| Mismatch 对账差异 | 对不上的单位号、出自哪侧、差异类型、说明与人工裁定结论 | `mismatches` |

- 数据库名 `gbtrenchlog`，`meta` 表保存 `schemaVersion`；
- `version(2)` 升级迁移会为历史地层单位补齐「开口层位」字段并规范包含物数组；
- `version(3)` 升级迁移为旧数据回填归属：地层单位补 `owner/lifecycle/successorCodes`，出土物按现有单位回填 `unitCode` 并按出土深度回填 `status/pendingReason`，完成后写入 `ownershipBackfilled` 标记再启用；
- 数据仅存于浏览器本地，容器无状态、不挂载命名卷。

## 六、主要页面

| 路由 | 功能 |
| --- | --- |
| `/trenches` | 探方清单：按「发掘区-探方号」校验唯一性，卡片显示单位数、出土物件数、关系数与发掘进度状态 |
| `/strata` | 地层单位编目表（记录员）：按类型与深度区间筛选，层序倒置与单位号重复即时高亮；支持拆分/并掉单位，拆并后原编号保留为档案 |
| `/artifacts` | 出土物登记与清单（整理室）：先认在册单位号，深度越界挂起待核；待核条目由记录员核定通过 |
| `/relations` | 层位关系视图：SVG 有向图展示叠压/打破，点击节点高亮直接关系，新增关系前做环路检测 |
| `/sections` | 四壁剖面示意：按深度刻度绘制在册地层条带与厚度标注，叠加出土物投影点 |
| `/reconcile` | 两侧对账：按单位号比对工地清册与整理室登记，差异摆出等人裁定；整理室侧失败可独立重试 |

## 七、校验与机制规则

- 同一「发掘区-探方号」只允许一个探方；
- 同一探方内单位号不可重复（保存时拒绝）；
- 上界深度大于下界深度即为**层序倒置**，编目表整行标红并在顶部汇总；
- 若「A 叠压/打破 B」但 A 的上界深度大于 B，则提示层位关系与深度矛盾；
- 新增层位关系前做**环路检测**（DFS），会形成闭合矛盾的关系直接拒绝保存；
- 出土物的 Z（深度）掉出所属单位深度区间 → **挂起待核**等记录员核，件数与临时存放位置不挪不动；
- 单位拆分/并掉 → 原单位转档案（层位关系照旧引用原编号），其下出土物**退回待核**；
- 对账以单位号为键，差异三类：整理室认了工地没有的号、已拆并单位仍挂出土物、在册单位整理室无记录；
- 整理室侧对账失败只重试本侧比对，工地侧快照与数据不受影响。
