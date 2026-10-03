# 考古探方地层编目台（gbtrenchlog）

面向考古发掘工地的记录员与整理人员，把「探方 → 地层单位 → 堆积描述 → 层位关系 → 出土物」整理成一套可核对的编目档案，解决地层编号重复、打破与叠压关系记不清、出土物脱离层位上下文的问题。**纯前端单页应用**，全部数据保存在浏览器 IndexedDB，不依赖任何后端服务或外部接口。

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
| 部署 | 多阶段 Dockerfile：`node:20-alpine` 构建 → `nginx:alpine` 托管 |

## 三、本地开发

```bash
cd frontend
npm install
npm run dev        # http://localhost:21818
npm run build      # 类型检查 + 生产构建
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
│   └── src/
│       ├── types/              # trench.ts / stratum.ts / artifact.ts / relation.ts / ownership.ts / index.ts
│       ├── stores/             # trenchStore / stratumStore / artifactStore / relationStore（Zustand）
│       ├── components/common/  # StratumDepthBar / RelationGraph / TrenchTag / UnitPicker
│       ├── hooks/              # useStratumOrder / useRelationGraph / usePersistentStore
│       ├── pages/              # TrenchesPage / StrataPage / ArtifactsPage / ReconcilePage / RelationsPage / SectionsPage
│       ├── router/index.ts
│       └── utils/              # graph.ts / export.ts / id.ts / reconcile.ts
```

## 五、数据模型与存储

| 模型 | 说明 | Dexie 表 |
| --- | --- | --- |
| Trench 探方 | 探方号、发掘区、规格、基点坐标、开口层位、发掘起止、负责人、四壁备注、是否回填 | `trenches` |
| Stratum 地层单位 | 单位号、类型（地层/灰坑/房址/沟/墓葬）、开口层位、上下界深度、土质土色、包含物、堆积成因、绘图拍照号、归属（工地记录员） | `strata` |
| Artifact 出土物 | 所属地层单位、器物编号、类别、件数、残整程度、探方内 X/Y/Z、出土日期、提取人、临时存放、归属（整理室）、登记状态（已入账/待核）、单位号与探方快照 | `artifacts` |
| Relation 层位关系 | 单位 A、关系类型（叠压/打破/共存）、单位 B、判定依据、记录人、备注、归属（工地记录员）、两端单位号快照 | `relations` |

- 数据库名 `gbtrenchlog`，`meta` 表保存 `schemaVersion`；
- `version(2)` 升级迁移会为历史地层单位补齐「开口层位」字段并规范包含物数组；
- `version(3)` 引入数据归属与待核状态：旧数据没记归属，升级时按现有单位回填再启用——地层单位与层位关系归工地记录员、出土物归整理室，出土物按现有单位深度区间回填入账/待核状态，并补齐单位号快照；
- 数据仅存于浏览器本地，容器无状态、不挂载命名卷。

## 六、主要页面

| 路由 | 功能 |
| --- | --- |
| `/trenches` | 探方清单：按「发掘区-探方号」校验唯一性，卡片显示单位数、出土物件数、关系数与发掘进度状态 |
| `/strata` | 地层单位编目表（工地记录员台账）：按类型与深度区间筛选，层序倒置与单位号重复即时高亮；支持拆分单位与合并选中单位 |
| `/artifacts` | 出土物登记与清单（整理室台账）：先锁定所属地层单位（级联选择器），带出深度区间；出土深度掉到区间外的挂起待核，件数与位置不挪 |
| `/reconcile` | 对账与待核：两边按单位号对账，对不上的摆出来等人定；待核队列支持核准入账与改派单位；整理室侧重试只重算自己那份 |
| `/relations` | 层位关系视图：SVG 有向图展示叠压/打破，点击节点高亮直接关系，新增关系前做环路检测；单位停用后关系仍按原编号展示 |
| `/sections` | 四壁剖面示意：按深度刻度绘制地层条带与厚度标注，叠加出土物投影点 |

## 七、校验规则

- 同一「发掘区-探方号」只允许一个探方；
- 同一探方内单位号不可重复（保存时拒绝）；
- 上界深度大于下界深度即为**层序倒置**，编目表整行标红并在顶部汇总；
- 若「A 叠压/打破 B」但 A 的上界深度大于 B，则提示层位关系与深度矛盾；
- 新增层位关系前做**环路检测**（DFS），会形成闭合矛盾的关系直接拒绝保存；
- 出土物的 Z（深度）落在所属单位深度区间外时**挂起待核**（不拒绝登记），等记录员核，件数与临时存放位置保持原样。

## 八、归属与对账

- 地层单位的单位号、上下界深度与层位关系由**工地记录员**定，出土物的器物编号、件数、临时存放位置由**整理室**填，两边各自持有自己那份（记录上的 `owner` 字段）；
- 整理室登记前先认单位号；出土深度掉到单位深度区间外的先挂起来等记录员核；
- 记录员把单位**拆开**或**并掉**后，整理室挂在原单位下的那批出土物退回待核，层位关系照旧按原编号留着（关系上的单位号快照不改写）；
- 两边按单位号对账：单位号对不上、深度超区间、单位号已变更的条目摆出来等人定，系统不自动改；
- 整理室侧重试对账只重算自己那份（出土物台账的状态与快照），工地那份（地层单位、层位关系）不受影响；
- 旧数据没记归属，`version(3)` 升级时按现有单位回填归属与登记状态再启用。
