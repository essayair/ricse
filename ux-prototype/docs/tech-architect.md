# 产业链运营管理系统 — 技术架构设计

> 版本：v1.1 | 日期：2026-07-01 | 基于 PRD：fuctionPrd.docx
>
> 本文档定义系统的整体技术架构、技术选型、模块划分与分阶段交付计划，作为后续开发的纲领性参考。

---

## 目录

1. [整体架构模式](#一整体架构模式)
   - [1.4 架构分层原则（AI 介入边界）](#14-架构分层原则ai-介入边界)
2. [后端技术栈](#二后端技术栈)
3. [前端技术栈](#三前端技术栈)
   - [3.4 为何不采用 Ant Design 5](#34-为何不采用-ant-design-5)
   - [3.5 为何不采用 tRPC](#35-为何不采用-trpc)
4. [数据库设计](#四数据库设计)
5. [API 设计规范](#五api-设计规范)
6. [认证与授权](#六认证与授权)
7. [文件与媒体存储](#七文件与媒体存储)
8. [实时功能](#八实时功能)
9. [状态机设计](#九状态机设计)
10. [集成点设计](#十集成点设计)
11. [移动端方案（二期）](#十一移动端方案二期)
12. [OCR 流水线](#十二ocr-流水线)
13. [部署方案](#十三部署方案)
14. [项目结构](#十四项目结构)
15. [开发优先级与分阶段交付](#十五开发优先级与分阶段交付)
16. [技术选型决策总表](#十六技术选型决策总表)

---

## 一、整体架构模式

### 1.1 决策

**模块化单体（Modular Monolith），以 DDD 有界上下文划分模块边界，预留未来微服务拆分能力。**

> **注意：Modular Monolith（架构模式）与 Monorepo（仓库组织方式）是两个不同层面的概念。Modular Monolith 管"代码怎么写"，Monorepo 管"代码放哪"。本项目两者同时采用。**

### 1.2 选型理由

| 维度 | 模块化单体 | 微服务 | 传统单体 |
|------|----------|--------|---------|
| 开发速度 | 高，单进程内调试 | 低，多服务联调复杂 | 高，但代码耦合快 |
| 部署复杂度 | 低，一个部署单元 | 高，需容器编排 | 低 |
| 模块边界 | DDD 强制隔离 | 天然物理隔离 | 随时间腐化 |
| 团队规模 | 3-8 人最佳 | 15+ 人 | 1-3 人 |
| 数据一致性 | 单 DB 事务，强一致 | 分布式事务 SAGA | 单 DB 事务 |
| AI 辅助友好度 | 高，代码库集中 | 低，上下文分散 | 中 |
| 运维成本 | 低 | 高（K8s/服务网格） | 低 |

**选择模块化单体的核心原因：**

1. **小团队：** 微服务的运维和治理开销远超收益
2. **AI 辅助开发：** 单代码库使 AI 工具可获取完整上下文，代码生成和重构更准确
3. **业务链紧凑：** 合同 → 物流 → 库存 → 质检 → 结算 是紧密编排的业务链，分布式事务会大幅增加复杂度
4. **1-2 月上线目标：** 微服务的服务发现、配置中心、CI/CD 搭建成本远超业务开发

### 1.3 模块划分（DDD Bounded Contexts）

```
app/
├── modules/
│   ├── master-data/          # 主数据管理（供应商、客户、物料、仓库、价格、组织）
│   ├── contract/             # 合同管理/采销系统（采购、销售、双边合同）
│   ├── logistics/            # 物流管理（运单、叫车派车、在途监控）
│   ├── inventory/            # 库存管理（入库、出库、调拨、盘点）
│   ├── quality-inspection/   # 质检化验（取样、化验、报告）
│   ├── weighbridge/          # 地磅管理（过磅采集、防作弊）
│   ├── finance/              # 资金与付款（结算、发票、付款）
│   ├── video-monitoring/     # 监控录像（抓拍、影像关联）
│   ├── workbench/            # 工作台（待办、概览、预警）
│   └── common/               # 共享内核（认证、授权、审批引擎、文件、消息）
```

每个模块内部结构：

```
modules/contract/
├── domain/          # 领域层：实体、值对象、领域服务、状态机
├── application/     # 应用层：命令/查询处理器、DTO
├── infrastructure/  # 基础设施层：Repository 实现、外部 API 适配器
└── interfaces/      # 接口层：Controller、API 路由
```

**模块间通信规则：**

- **同步：** 通过应用服务调用（同进程，无网络开销）
- **异步：** 领域事件总线（EventEmitter 模式），用于跨模块联动（如：合同生效 → 通知物流 → 生成运输任务）
- **严格禁止：** 跨模块直接访问对方 Repository 或数据库表

### 1.4 架构分层原则（AI 介入边界）

系统分两层，AI 仅在数据层（只读）工作：

```
业务层（无 AI）          AI 层（只读）
─────────────           ────────────
交易管理                 数据查询
合同流转                 报表生成
结算登记                 趋势分析
权限控制                 信息提取
```

- **业务层**：标准模块驱动的运营管理，AI 不介入任何业务流程和数据写入
- **AI 层**：只读数据消费，仅用于查询、分析、报告生成，不触碰业务逻辑
- **核心约束**：所有 AI 功能只能读取数据，严禁通过 AI 触发任何数据写入或状态变更。涉及钱、合同、对外动作的，必须人来确认

---

## 二、后端技术栈

### 2.1 决策

**Node.js + NestJS + TypeScript**

### 2.2 选型理由

| 维度 | NestJS (TypeScript) | Spring Boot (Java) | FastAPI (Python) |
|------|---------------------|---------------------|-------------------|
| AI 辅助开发 | 极好，类型系统使 AI 补全准确 | 好，Java 类型强但冗长 | 极好 |
| 前后端统一 | 前端也用 TS，类型共享 | 需维护两份类型定义 | 类型系统不兼容 |
| 企业级能力 | DI/IoC/Guards/Pipes 对标 Spring | 最成熟 | 较弱 |
| 性能（IO 密集） | 极好，异步非阻塞 | 好，多线程 | 一般 |
| 启动速度 | ~100ms | 数秒 | ~100ms |
| 中文生态 | 中等，快速成长 | 极丰富 | 丰富 |
| ORM 选择 | Prisma/Drizzle | JPA/Hibernate/MyBatis | SQLAlchemy |

**不选 Spring Boot 的原因：** 前后端统一 TypeScript → 端到端类型安全，AI 能一次性理解前后端数据流；Node.js 单进程内存占用 ~80MB（vs JVM ~300MB+），在国内云服务器上运行更轻量。

### 2.3 核心技术选型

| 层次 | 技术 | 说明 |
|------|------|------|
| **框架** | NestJS | 模块化架构，DI/Guards/Interceptors，企业级模式 |
| **ORM** | Prisma | Schema-first，类型安全，自动迁移，Prisma Studio 可视化 |
| **数据库** | PostgreSQL 15+ | 主数据库 |
| **缓存** | Redis | 会话、热点数据、消息队列（BullMQ） |
| **后台任务** | BullMQ + Redis | 审批超时提醒、定时报表、银行流水匹配 |
| **文件存储** | MinIO (自建 S3) 或 阿里云 OSS | 影像、附件、合同扫描件 |
| **实时通信** | Socket.IO + Redis Adapter | 工作台通知、GPS 推送 |
| **日志** | Winston | 审计日志（合同修改、审批流转） |
| **校验** | class-validator + class-transformer | 配合 NestJS Pipes，声明式校验 |
| **测试** | Jest + Supertest | 单元测试 + 集成测试 |
| **API 文档** | @nestjs/swagger (OpenAPI 3.0) | 自动生成，挂载 /api/docs |

### 2.4 ORM 选型：Prisma

选用 Prisma（而非 Drizzle）的理由：
- **声明式 Schema DSL + 自动迁移**，降低人工管理 DDL 风险
- **Prisma Studio**：可视化管理数据，开发/测试阶段极有价值
- **类型生成**：一次 `prisma generate` 产出完整类型，AI 工具可直接引用
- **复杂关联查询**：大宗贸易涉及合同-订单-发货指令-物流-入库单-结算单的多层关联，Prisma 的 `include`/`select` 处理嵌套读取更直观

---

## 三、前端技术栈

### 3.1 决策

**Next.js 14+ (App Router) + shadcn/ui + Tailwind CSS**

### 3.2 选型理由

1. **Nested Layouts 天然匹配后台系统：** 顶部导航 → 侧边栏 → 内容区 → 面包屑 → 数据表格 → 弹窗表单，用 App Router 的 `layout.js` 实现清晰且可复用
2. **React Server Components（RSC）：** 列表页等数据密集场景，服务端获取数据并渲染，减少客户端 JS 体积
3. **shadcn/ui** 是 AI 友好度最高的 UI 库：组件代码可直接复制、不锁定版本、与 Tailwind CSS 原生搭配，Claude/Cursor 等 AI 工具生成 shadcn 代码的质量和一致性最高
4. **Tailwind CSS** 是 AI 生成样式的事实标准，AI 写 Tailwind 的准确率远超传统 CSS

### 3.3 核心技术选型

| 层次 | 技术 | 说明 |
|------|------|------|
| **框架** | Next.js 14+ (App Router) | Server Component 为默认，按需 `'use client'` |
| **UI 库** | shadcn/ui | 可复制组件，AI 熟悉度最高，不锁定版本 |
| **样式** | Tailwind CSS | AI 生成质量最高，与 shadcn 原生配套 |
| **表单** | React Hook Form + Zod | 类型安全表单校验，与 shadcn 原生支持 |
| **图表** | Recharts 或 Lucide | 轻量，AI 生成质量高 |
| **路由** | Next.js App Router | 文件系统路由 + 路由组 `(dashboard)` |
| **HTTP 客户端** | 自定义 fetch 封装 | 统一错误处理、Token 注入 |

### 3.4 为何不采用 Ant Design 5

Ant Design 5 是国内 B 端事实标准，ProTable/ProForm 开箱即用。但本项目以 AI 友好为第一优先：
- AI 生成 shadcn/ui 代码的质量显著高于 Ant Design（Ant Design 依赖特定版本 API，AI 容易生成过时或错误代码）
- shadcn/ui 组件代码直接进项目（src/components/ui/），可手动任意修改，不依赖第三方版本锁定
- Ant Design 的主题定制和 Tree Shaking 配置在 vibe coding 流程中增加不必要的复杂度

### 3.5 为何不采用 tRPC

tRPC 在前后端均为 TypeScript 时价值最大，但当后端是独立 NestJS 服务时，需要额外桥接层，增加复杂度。**采用 REST + OpenAPI 规范**：NestJS Swagger 模块自动生成 API 文档，在接口数量快速增长时（预估 150+），文档自动维护更可靠。未来如需端到端类型安全，可考虑 `ts-rest` 方案。

---

## 四、数据库设计

### 4.1 决策

**PostgreSQL 15+ 作为主数据库，Redis 作为缓存/消息层。**

**生产环境：阿里云 RDS PostgreSQL + 阿里云 Redis**
**开发环境：本地 Docker PostgreSQL 或 Supabase**

> 选型说明：数据库引擎决策基于下面 4.2 的特性对比，与托管平台无关。阿里云 RDS PostgreSQL 提供与自建 PostgreSQL 完全兼容的协议，开发阶段可以使用 Supabase 加速开发，生产切换到阿里云 RDS，ORM 层（Prisma）无需改动。

### 4.2 为何选择 PostgreSQL

| 特性 | PostgreSQL | MySQL | 对本项目的意义 |
|------|-----------|-------|-------------|
| 复杂事务（ACID） | 原生完整，MVCC 无读写阻塞 | InnoDB，间隙锁可能引发争用 | 合同状态流转涉及多表更新 |
| JSONB | 原生索引 JSONB | JSON 为文本存储 | 合同字段灵活扩展（不同品类不同质检指标） |
| 窗口函数 | 完善 | MySQL 8.0 才有 | 结算报表（累计采购量、部门统计） |
| 递归 CTE | 完善 | 支持 | 组织树查询 |
| 物化视图 | 支持 | 不支持 | 工作台概览预计算 |
| PostGIS | 扩展支持 | 较弱 | 电子围栏、仓库地理定位 |
| 行级安全（RLS） | 原生支持 | 不支持 | 多主体数据隔离（二期） |
| pgvector | 向量搜索 | 较弱 | 二期智能模型（相似合同匹配） |
| 国产兼容 | 华为 GaussDB 基于 PG | OceanBase/TDSQL 基于 MySQL | 国产化迁移路径清晰 |

### 4.3 核心 Schema 设计原则

**1. 多租户隔离 — 部门组维度**

所有业务表包含 `department_group_id` 字段，应用层按用户权限注入 WHERE 子句。二期使用 PostgreSQL Row-Level Security 加固。

**2. 主数据版本化**

```
主数据表（供应商、物料、价格）
├── version: INT (递增)
├── effective_from / effective_to: TIMESTAMP
├── 业务单据存储引用时的 snapshot（JSONB），而非外键
└── 新单据引用最新版本，已生效单据不受变更影响
```

**3. 批次为库存核心**

```
batch (批次表)
├── batch_no            # 系统唯一批次号
├── material_id         # 物料ID
├── warehouse_id        # 仓库ID
├── location_id         # 库位ID
├── quantity            # 数量
├── available_quantity  # 可用数量
├── origin_receipt_id   # 来源业务入库单ID
└── inspection_report_id # 关联质检报告ID
```

**4. 单据号规则统一**

```
格式: {单据类型码}{日期}{序号}
示例: CG202606160001 (采购合同2026年6月16日第1号)

单据类型码:
CG(采购) / XS(销售) / SB(双边) / WL(物流) / RK(入库) / CK(出库)
ZJ(质检) / DB(地磅) / JS(结算) / FP(发票) / FK(付款)
```

**5. 软删除为主**

所有核心业务表包含 `deleted_at: TIMESTAMP NULL`。合同/运单/磅单等不可物理删除，数据库视图自动过滤 `WHERE deleted_at IS NULL`。

---

### 4.4 数据库管理边界（开发铁律）

数据库（PostgreSQL）是与应用平级的独立服务，不是后端的子集。

| 事项 | 归属 | 说明 |
|---|---|---|
| 表/字段结构定义 | **代码（Prisma）** | `schema.prisma` 是结构的唯一真相，进 git |
| 结构变更（建表/改字段） | **代码迁移** | 一律走 `prisma migrate`，生成 DDL 交库执行 |
| 数据增删改查 | **代码（Prisma Client）** | 收口到各模块 Repository 层 |
| 事务、并发、存储 | **数据库引擎** | PostgreSQL 自身负责 |
| 实例启停、备份、扩容 | **运维/部署层** | 属基础设施项，非代码职责 |

**两条铁律：**
1. **禁止手动 DDL**——生产环境严禁人手连库改表/改结构。结构真相在 `schema.prisma`，手改会导致代码与库不一致、下次迁移冲突。结构变更只走 Prisma migrate。
2. **数据访问收口 Repository**——禁止跨模块直接访问对方表，所有库操作经本模块 Repository 层，与 DDD 跨上下文隔离一致。

> 开发/测试阶段可用 Prisma Studio 可视化查看数据；但**结构变更永远走代码迁移**，不在 Studio 或客户端手改表结构。

---

## 五、API 设计规范

### 5.1 URL 命名

```
GET    /api/v1/contracts                    # 合同列表（分页+筛选）
GET    /api/v1/contracts/:id                # 合同详情
POST   /api/v1/contracts                    # 创建合同
PUT    /api/v1/contracts/:id                # 修改合同（仅已保存/已驳回状态）
DELETE /api/v1/contracts/:id                # 作废合同（软删除）
PATCH  /api/v1/contracts/:id/status         # 状态流转（提交审批/撤回）
POST   /api/v1/contracts/:id/dispatch       # 下达发货指令
```

### 5.2 统一响应格式

```typescript
interface ApiResponse<T> {
  code: number;        // 业务代码：20000 成功，400xx 业务异常，50000 系统错误
  message: string;     // 提示信息
  data: T;             // 响应体
  requestId: string;   // 请求追踪 ID
}
```

### 5.3 分页规范

```typescript
interface PaginatedResponse<T> {
  items: T[];
  meta: {
    page: number;       // 当前页（从 1 开始）
    pageSize: number;   // 每页条数
    total: number;      // 总条数
    totalPages: number; // 总页数
  };
}
```

### 5.4 错误码体系

| 错误码 | 含义 |
|--------|------|
| 40001 | 参数校验失败 |
| 40100 | 未认证 |
| 40300 | 无权限 |
| 40301 | 数据权限不足（部门组维度） |
| 40400 | 资源不存在 |
| 40901 | 合同状态不允许此操作 |
| 40902 | 库存不足 |
| 42201 | 业务规则校验失败（如超额度） |

---

## 六、认证与授权

### 6.1 决策

**JWT + RBAC（角色权限） + 数据权限（部门组维度），预留 SSO/OAuth2 扩展点。**

> 开发阶段可借助 Supabase Auth 快速搭建，生产环境切换为自建 JWT 方案（Passport 策略），确保认证逻辑完全可控，不受第三方服务可用性影响。两种方案均可与阿里云部署集成。

### 6.2 认证流程

```
1. 用户登录 → POST /api/v1/auth/login { username, password }
2. 后端验证 → 比对 bcrypt 哈希密码
3. 签发双 Token：
   - accessToken: JWT (有效期 2 小时)
   - refreshToken: UUID (有效期 7 天，存 Redis)
4. 前端存储：accessToken 内存，refreshToken httpOnly cookie
5. 请求携带：Authorization: Bearer <accessToken>
6. 过期续期：POST /api/v1/auth/refresh { refreshToken }
```

### 6.3 权限模型

```typescript
interface Permission {
  resource: string;  // 资源: 'contract', 'logistics', 'inventory'...
  action: string;    // 操作: 'read', 'create', 'update', 'delete', 'approve'
  scope?: string;    // 范围: 'own', 'department', 'department_group', 'all'
}

// 预定义角色：
// - 超级管理员: 所有权限
// - 部门经理: 本部门组所有权限
// - 业务员: 本部门组 read + create + update(own)
// - 财务: 结算/发票/付款模块权限
// - 仓库管理员: 库存/地磅模块权限
// - 质检员: 质检化验模块权限
// - 只读: 全部 read
```

### 6.4 数据权限

- 每个用户绑定到一个**部门组**（department_group_id）
- 业务单据创建时记录 `department_group_id`
- 查询时自动注入 `WHERE department_group_id = :currentUserDeptGroupId`
- 二期使用 PostgreSQL Row-Level Security 在数据库层加固

### 4.5 生产环境数据库确认（阿里云 RDS）

| 维度 | 方案 |
|------|------|
| 数据库引擎 | PostgreSQL 15+ |
| 生产托管 | 阿里云 RDS PostgreSQL |
| 开发托管 | Supabase 或本地 Docker |
| 缓存 | 阿里云 Redis（或本地 Redis）|
| 存储过程/触发器 | 不用，逻辑统一在代码层 |
| 迁移管理 | Prisma migrate，禁止手动 DDL |
| 备份 | 阿里云 RDS 自动备份 |

> **开发→生产切换方式**：Prisma 连接字符串（DATABASE_URL）从 Supabase URL 替换为阿里云 RDS URL 即可，代码和 Schema 零改动。

---

## 七、文件与媒体存储

### 7.1 决策

**阿里云 OSS 作为主存储（生产环境），MinIO 用于本地开发。**

### 7.2 存储策略

| 文件类型 | 平均大小 | 保存期 | 存储策略 |
|---------|---------|--------|---------|
| 合同扫描件 | 2-5 MB | 永久 | 标准存储 |
| 磅单照片 | 1-3 MB | 3 年 | 标准存储 |
| 质检报告照片 | 1-2 MB | 3 年 | 标准存储 |
| 过磅抓拍影像 | 0.5-1 MB/张 | 1 年 | 标准，1 年后转冷存储 |
| 卸货监控视频 | 50-200 MB/段 | 90 天 | 低频存储，到期自动删除 |
| 附件/补充协议 | 1-10 MB | 永久 | 标准存储 |
| 系统导出文件 | 不定 | 30 天 | 临时存储，定期清理 |

### 7.3 关键技术实现

- 后端使用 multer 处理上传，校验（类型/大小）后转存 MinIO
- 大文件使用分片上传（监控视频场景）
- 数据库仅存储文件 URL 和元数据
- 防作弊：影像与业务单据通过 `evidence_package` 表绑定

---

## 八、实时功能

### 8.1 决策

**短轮询（工作台数据） + Socket.IO + Redis Adapter（预警推送、GPS 位置）。**

> 基于阿里云 Redis 部署 Socket.IO Adapter 实现多实例推送，不依赖第三方实时服务平台。开发阶段可用本地 Redis 替代。

### 8.2 功能清单

| 功能 | 实时性要求 | 实现方式 |
|------|-----------|---------|
| 工作台待办数量角标 | 准实时（< 10s） | 短轮询（5s 间隔） |
| 预警通知推送 | 秒级 | Socket.IO 推送 |
| GPS 在途位置更新 | 秒级 | Socket.IO 推送（来自 GPS 回调） |
| 审批通知 | 分钟级 | 轮询 + 站内消息 |
| 工作台概览数据 | 分钟级 | 轮询 + 缓存 |

### 8.3 架构

```
客户端 <-> Socket.IO <-> Redis Adapter <-> NestJS Gateway
                                               |
                                         BullMQ (消息队列)
                                               |
                                         GPS 回调 / 定时任务
```

- Socket.IO 使用 Redis Adapter 支持多实例部署
- 消息队列用于异步处理 GPS 回调、审批超时提醒

---

## 九、状态机设计

### 9.1 决策

**后端代码定义状态转换表（轻量级），不使用 XState 等外部库。**

### 9.2 设计原则

合同、物流运单、质检任务、入库单、结算单等业务对象都有状态流转。在后端实现**强约束**的状态机（不允许前端绕过）。

### 9.3 合同状态机实现模式

```typescript
interface StateTransition {
  from: ContractStatus;
  to: ContractStatus;
  condition?: (contract: Contract) => boolean | Promise<boolean>;
  sideEffect?: (contract: Contract) => Promise<void>;
  allowedRoles: string[];
}

const CONTRACT_TRANSITIONS: StateTransition[] = [
  {
    from: 'DRAFT', to: 'PENDING_APPROVAL',
    allowedRoles: ['salesperson', 'manager'],
    condition: async (c) => c.items.length > 0 && c.supplier_id !== null,
  },
  {
    from: 'PENDING_APPROVAL', to: 'APPROVED',
    allowedRoles: ['approver'],
    sideEffect: async (c) => { /* 生成发货指令、通知物流 */ },
  },
  {
    from: 'PENDING_APPROVAL', to: 'REJECTED',
    allowedRoles: ['approver'],
  },
  {
    from: 'REJECTED', to: 'DRAFT',
    allowedRoles: ['salesperson'],
  },
  {
    from: 'APPROVED', to: 'EXECUTING',
    allowedRoles: ['system'], // 系统自动：首次生成发货指令后
  },
  {
    from: 'EXECUTING', to: 'COMPLETED',
    allowedRoles: ['system'],
    condition: async (c) => { /* 已执行量 >= 合同量 * (1 - 短装比例) */ },
  },
  // 任何状态 → VOIDED (管理员特权)
  {
    from: '*', to: 'VOIDED',
    allowedRoles: ['admin'],
  },
];
```

### 9.4 适用范围

| 业务对象 | 状态流转 |
|---------|---------|
| 合同 | 已保存 → 审批中 → 已驳回/已生效 → 执行中 → 已完成/已关闭/已作废 |
| 物流运单 | 待发运 → 在途 → 已到达 → 已签收 |
| 质检任务 | 待取样 → 化验中 → 已出报告 → 已确认 |
| 入库单 | 待入库 → 已入库 → 已过账 |
| 结算单 | 待生成 → 待审核 → 已审核 → 已付款 |
| 发票 | 待开具 → 已开具 → 已认证 |

---

### 9.5 审批流程：不自研通用 BPM

**核心原则：一期只做写死的单一审批流程，不自研通用 BPM 引擎。**

自研通用 BPM 意味着要开发：可视化流程设计器、条件分支引擎（如"金额>100万走总经理"）、动态节点配置、流程版本管理、会签/或签/并行审批。**本质上是在再造一个轻量版钉钉审批系统**，其工作量远超核心业务功能本身。

一期做法——代码里写死审批链：

```typescript
// 示例：十几行代码完成
if (合同类型 === '采购' && 金额 > 100万) {
  审批链 = [业务主管, 风控经理, 总经理]
} else {
  审批链 = [业务主管, 风控经理]
}
```

**何时开始评估通用方案：** 当业务中出现超过 10 种不同审批规则，或每天都有新审批流程变更需求时，再评估挂载成熟工作流引擎（如 Flowable REST 或 Node 工作流库）。

## 十、集成点设计

### 10.1 GPS 平台对接

```
第三方GPS平台 → Webhook回调 → POST /api/v1/callbacks/gps
                                │
                                ▼
                          解析位置数据 → 更新运输运单位置
                                │
                                ▼
                          电子围栏判断 → 触发出/入场事件
                                │
                                ▼
                          Socket.IO 推送给前端
```

- 适配器模式，支持多 GPS 平台（中交兴路、G7 等）
- GPS 回调数据存入 `vehicle_position_log` 表

### 10.2 银行 API 对接（二期）

```
资金中心 → 银行前置机/SDK → 银行核心系统
          │
          对账引擎 → 定时拉取银行流水 → 自动匹配系统单据 → 对账报告
```

### 10.3 地磅硬件对接

- **一期（Web 端）：** 手动上传磅单，不直连接口（按 PRD 要求）
- **二期：** 对接地磅设备 RS232/TCP 数据采集

### 10.4 摄像头对接

- **一期（Web 端）：** 手动上传抓拍图片
- **二期：** 对接 NVR 设备，通过 RTSP/ONVIF 协议直接抓取

---

## 十一、移动端方案（二期）

### 11.1 决策

**微信小程序 + 企业微信 H5 双渠道，后端统一 API。**

### 11.2 技术方案

| 渠道 | 框架 | 适用场景 |
|------|------|---------|
| 微信小程序 | Taro 或 Uni-app | 外部合作伙伴，轻量级业务操作 |
| 企业微信 | 企业微信 JS-SDK + H5 | 内部员工审批、物流跟踪、过磅拍照 |
| API | 统一后端 REST API | 多端共享同一 API 层 |

### 11.3 注意事项

- 小程序需要 HTTPS 域名备案（国内云）
- 企业微信应用需要 corpid/corpsecret 配置
- 文件上传需适配小程序 `wx.uploadFile` API

---

## 十二、OCR 流水线

### 12.1 决策

**异步 OCR 处理流水线，一期接入百度/腾讯云 OCR API，二期自建模型。**

### 12.2 处理流程

```
用户上传图片 → 临时存 MinIO → 创建 OCR 任务 (BullMQ)
                                    │
                                    ▼
                              调用云 OCR API（百度/腾讯）
                              ├── 磅单：提取车牌号、毛重、皮重、净重
                              ├── 发票：提取发票代码、金额、税率、开票日期
                              └── 合同：提取主体、金额、日期
                                    │
                                    ▼
                              结构化提取 → 自动填充表单
                                    │
                              置信度 < 阈值 → 人工复核
```

### 12.3 技术要点

- OCR 结果与原始图片绑定存储
- 低置信度字段高亮标记，引导人工修正
- 修正数据反馈到训练集（二期模型升级）

---

## 十三、部署方案

### 13.1 决策

**阿里云全栈部署（生产），Docker Compose 用于本地开发。**

| 服务 | 阿里云产品 |
|------|-----------|
| 应用服务器 | 阿里云 ECS（一台起步）或 SAE（Serverless） |
| 数据库 | 阿里云 RDS PostgreSQL |
| 缓存/队列 | 阿里云 Redis |
| 文件存储 | 阿里云 OSS |
| CDN / 证书 | 阿里云 CDN + SSL 证书 |
| 域名 | 阿里云 DNS / 万网 |
| CI/CD | GitHub Actions → 部署到 ECS

### 13.2 Docker Compose 编排

```yaml
# docker-compose.yml (开发/测试环境)
services:
  postgres:
    image: postgres:15-alpine
  redis:
    image: redis:7-alpine
  minio:
    image: minio/minio
  backend:
    build: ./packages/backend
    depends_on: [postgres, redis, minio]
    ports: ["3000:3000"]
  frontend:
    build: ./packages/frontend
    depends_on: [backend]
    ports: ["3001:3000"]
```

### 13.3 生产部署

| 环境 | 推荐方案 |
|------|---------|
| 国内公有云 | 阿里云 ECS + RDS PostgreSQL + OSS + Redis |
| 国产化环境 | 麒麟 OS + 鲲鹏/飞腾 + GaussDB/达梦 DB |
| CI/CD | GitHub Actions / 阿里云效 |
| 反向代理 | Nginx + 国内 CA 证书 |
| 监控 | 阿里云 ARMS / 自建 Prometheus + Grafana |

### 13.4 CI/CD 流水线

```
代码提交 → 类型检查 (tsc --noEmit) → 单元测试 (Jest)
                                       │
                                  构建 Docker 镜像
                                       │
                                  推送镜像仓库
                                       │
                                  部署到测试环境
                                       │
                                  E2E 测试 (Playwright)
                                       │
                                  手动审批 → 部署生产
```

---

## 十四、项目结构

### 14.1 Monorepo 布局

```
jiayiicp/
├── package.json                    # workspace 根配置
├── pnpm-workspace.yaml
├── docker-compose.yml              # 本地开发环境
├── turbo.json                      # 可选：构建缓存
│
├── packages/
│   ├── shared/                     # 前后端共享类型和常量
│   │   └── src/
│   │       ├── types/              # API 类型、枚举、DTO 接口
│   │       ├── constants/          # 业务常量（状态枚举、单据类型码）
│   │       ├── validators/         # 通用校验规则
│   │       └── index.ts
│   │
│   ├── backend/
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── modules/
│   │   │   │   ├── master-data/    # 主数据
│   │   │   │   ├── contract/       # 合同管理/采销系统
│   │   │   │   ├── logistics/      # 物流管理
│   │   │   │   ├── inventory/      # 库存管理
│   │   │   │   ├── quality/        # 质检化验
│   │   │   │   ├── weighbridge/    # 地磅管理
│   │   │   │   ├── finance/        # 资金与付款
│   │   │   │   ├── video/          # 监控录像
│   │   │   │   ├── workbench/      # 工作台
│   │   │   │   └── common/         # 共享基础设施
│   │   │   │       ├── auth/       # 认证授权
│   │   │   │       ├── approval/   # 审批引擎
│   │   │   │       ├── file-storage/ # 文件存储服务
│   │   │   │       ├── notification/ # 消息通知
│   │   │   │       ├── audit-log/  # 审计日志
│   │   │   │       └── ocr/        # OCR 管道
│   │   │   ├── common/             # 全局工具
│   │   │   │   ├── prisma/schema.prisma
│   │   │   │   ├── filters/        # 全局异常过滤器
│   │   │   │   ├── interceptors/   # 全局拦截器
│   │   │   │   ├── guards/         # 全局守卫
│   │   │   │   └── decorators/     # 自定义装饰器
│   │   │   └── config/
│   │   ├── test/
│   │   ├── Dockerfile
│   │   └── tsconfig.json
│   │
│   └── frontend/
│       ├── src/
│       │   ├── app/                # Next.js App Router
│       │   │   ├── layout.tsx      # 根布局
│       │   │   ├── (auth)/         # 登录/注册路由组
│       │   │   │   └── login/
│       │   │   ├── (dashboard)/    # 主后台路由组
│       │   │   │   ├── layout.tsx  # 后台布局 (ProLayout)
│       │   │   │   ├── page.tsx    # 工作台首页
│       │   │   │   ├── master-data/ # 主数据管理
│       │   │   │   ├── contracts/  # 合同管理
│       │   │   │   ├── logistics/  # 物流管理
│       │   │   │   ├── inventory/  # 库存管理
│       │   │   │   ├── quality/    # 质检化验
│       │   │   │   ├── weighbridge/ # 地磅管理
│       │   │   │   ├── finance/    # 资金付款
│       │   │   │   ├── video/      # 监控录像
│       │   │   │   └── settings/   # 系统设置
│       │   ├── components/         # 共享组件
│       │   │   ├── ui/             # 基础 UI 封装
│       │   │   ├── business/       # 业务组件
│       │   │   └── layout/         # 布局组件
│       │   ├── lib/                # 工具库
│       │   │   ├── api-client.ts   # API 请求封装
│       │   │   └── auth.ts         # 认证工具
│       │   ├── hooks/              # 自定义 Hooks
│       │   └── stores/             # 客户端状态 (Zustand)
│       ├── next.config.js
│       └── Dockerfile
│
├── docs/                           # 项目文档
│   ├── tech-architecture.md        # 本文档
│   ├── api/                        # API 文档（补充 Swagger）
│   └── prd/                        # PRD 原始文档
│
└── scripts/
    ├── seed.ts                     # 开发环境种子数据
    └── migrate.sh                  # 数据库迁移脚本
```

---

## 十五、开发优先级与分阶段交付

### 15.1 第一阶段：核心业务链路（第 1-4 周）

打通 "合同 → 物流 → 地磅 → 库存 → 质检 → 结算" 的最小闭环。

| 优先级 | 模块 | 范围 |
|--------|------|------|
| **P0** | 主数据 | 供应商/客户 CRUD、物料管理、仓库库位、用户与权限（基础 RBAC） |
| **P0** | 采购合同 | 创建/查询/修改/状态流转（完整审批状态机） |
| **P0** | 销售合同 | 创建/查询/修改/状态流转 |
| **P0** | 双边合同 | 创建 + 自动拆分采购/销售单 |
| **P0** | 发货指令/提单 | 供应商发货指令、销售提单生成 |
| **P0** | 物流运单 | 创建/查询/状态流转 |
| **P0** | 物流入库单 | 入库确认 |
| **P0** | 物流出库单 | 常规出库确认 |
| **P0** | 地磅管理 | 磅单上传/关联/查询 |
| **P0** | 业务入库单 | 引用物流入库单创建业务入库 |
| **P0** | 销售出库单 | 销售提单 → 出库 |
| **P0** | 质检化验 | 取样登记、化验数据录入、质检报告 |
| **P0** | 结算单 | 基于合同生成结算单 |

### 15.2 第二阶段：扩展功能与工作台（第 5-8 周）

| 优先级 | 模块 | 范围 |
|--------|------|------|
| **P1** | 主数据扩展 | 组织架构树、审批流程配置、OCR 识别（百度 API） |
| **P1** | 框架协议 | 年度/月度协议，协议下拆分单次合同 |
| **P1** | 意向单 | 采购意向单、销售意向单 |
| **P1** | 合同扩展 | 定价单、合同打印、版本管理 |
| **P1** | 工作台 | 待办聚合、业务概览、预警通知、消息中心 |
| **P1** | 库存扩展 | 库存查询、调拨、报损/报溢 |
| **P1** | 物流扩展 | 叫车派车、在途监控（GPS 对接）、运费核算 |
| **P1** | 财务扩展 | 付款审批、发票管理 |
| **P1** | 监控录像 | 过磅抓拍上传、影像与单据关联 |

### 15.3 第三阶段：线上测试与补漏（第 9-12 周）

| 优先级 | 模块 | 范围 |
|--------|------|------|
| **P2** | 双轨补录 | 线下操作结果快速补录功能 |
| **P2** | 承运商管理 | 物流供应商/司机/车辆管理 |
| **P2** | 物流报表 | 运输台账、运费汇总 |
| **P2** | 库存报表 | 库存台账、收发存汇总 |
| **P2** | 地磅高级 | 偏差预警、影像自动关联 |
| **P2** | 质检扩展 | 质检规范管理、指标争议处理 |

### 15.4 二期（第 4-6 个月）

按 PRD 第十节规划：合作伙伴门户、监管仓服务、供应链金融、资金中心、可信数据层（区块链存证）、多企业主体管理、AI 模型升级、移动端。

---

## 十六、技术选型决策总表

| 决策领域 | 选择 | 核心理由 |
|---------|------|---------|
| **架构模式** | 模块化单体 (Modular Monolith) | 小团队快速迭代，单 DB 事务保证一致性，预留微服务拆分 |
| **架构分层** | 业务层（模块驱动）+ AI 层（只读） | AI 仅用于查询/分析/报告，不介入业务流程和数据写入 |
| **后端框架** | NestJS + TypeScript | 前后端统一 TS，DI/IoC 企业模式，AI 辅助开发友好 |
| **ORM** | Prisma | 类型安全，自动迁移，Studio 可视化，复杂关联查询直观 |
| **数据库** | PostgreSQL 15+（生产：阿里云 RDS，开发：Docker/Supabase） | 强 ACID，JSONB，RLS；阿里云 RDS 免运维，Prisma 连接串切换零改动 |
| **缓存/队列** | Redis + BullMQ | 会话管理，消息队列，后台任务调度 |
| **前端框架** | Next.js 14+ (App Router) | 嵌套布局匹配后台系统，RSC 减少客户端体积 |
| **UI 库** | shadcn/ui + Tailwind CSS | AI 生成质量最高，组件可直接修改，不锁定版本 |
| **API 风格** | REST + OpenAPI 3.0 | 语言无关，Swagger 自动文档，未来合作伙伴 API 兼容 |
| **认证授权** | JWT + RBAC（生产）；Supabase Auth（开发加速） | 开发用 Supabase 快速搭，生产切换自建 JWT 保证可控 |
| **文件存储** | 阿里云 OSS（生产）；MinIO（本地开发） | 国内主流对象存储，与 ECS 内网互通，成本低 |
| **实时通信** | Socket.IO + Redis Adapter（生产：阿里云 Redis） | GPS 推送、预警通知、工作台刷新；不依赖第三方实时平台 |
| **状态机** | 后端代码状态转换表（强约束） | 轻量可控，可审计；不自研通用 BPM |
| **部署** | 阿里云 ECS + RDS + OSS + Redis（生产）；Docker Compose（本地开发） | 阿里云一站式国内部署，与 Next.js/NestJS 均可集成 |
| **项目结构** | pnpm Monorepo | 前后端同仓库，共享类型，AI 可获取完整上下文 |
| **移动端（二期）** | Taro/Uni-app + 企业微信 H5 | 微信生态兼容，跨端复用 |

---

> **后续开发指引：** 下一步按第十五节的分阶段计划，从第一阶段"核心业务链路"开始，先搭建项目骨架（Monorepo + NestJS + Next.js + Prisma），再按模块逐一实现。每个模块完成后进行集成测试，确保业务链路端到端跑通。
