# CLAUDE.md

> 本文件是 AI 协作约定的入口。所有 AI 实例的首次操作应读取此文件 + `docs/Sot.md` 获取完整上下文。

---

## 项目概述

**ricse** — 区域产业链服务生态运营管理平台 (Regional Industry Chain Service Ecosystem)。

当前阶段：一期，走通**合约主线**（创建 → 审核 → 生效）。

---

## AI OS 文档体系

```
ricse/
├── docs/
│   ├── Sot.md                   ← 信息源：先读这里获取全部关键决策（技术栈、一期范围、命名）
│   ├── 更新记录.md                ← docs/ 下所有文件的变更追溯
│   ├── 项目启动文档.md            ← 启动文档（4C 框架来源）
│   │
│   ├── 产品/                      ← 产品文档（面向产品经理、业务方）
│   │   ├── README.md             ← 产品文档索引
│   │   ├── 功能特性.md            ← 产品功能需求文档（原 function-prd）
│   │   ├── 01_系统管理员-主数据管理.md
│   │   ├── 02_采销业务员-合同管理.md
│   │   ├── 03_物流运营-物流管理.md
│   │   ├── 04_现场一线-地磅质检监控.md
│   │   ├── 05_仓储库管-库存管理.md
│   │   ├── 06_财务结算-资金付款管理.md
│   │   ├── 07_运营管理者-工作台.md
│   │   └── 使用指南/               ← 面向运营人员的模块操作指南
│   │       ├── README.md
│   │       ├── 认证模块.md
│   │       ├── 主数据模块.md
│   │       ├── 合同模块.md
│   │       ├── 审批模块.md
│   │       ├── 订单模块.md
│   │       └── 结算模块.md
│   │
│   └── 技术/                      ← 技术文档（面向开发团队）
│       ├── README.md             ← 技术文档索引
│       ├── 技术架构.md            ← 完整技术架构设计（原 tech-architect）
│       ├── 开发规则.md            ← 编码规范、DDD 约定、提交规范
│       ├── 设计系统.md            ← 设计 token、语义色、组件规范
│       ├── 迭代计划.md            ← 当前进度与迭代规划（首次读必读）
│       ├── 模块设计/              ← 每个模块的详细设计文档
│       │   └── README.md
│       ├── adr/                  ← 架构决策记录
│       │   └── README.md
│       └── prompt记录/           ← 有效 prompt 归档与沉淀
│           └── README.md
├── ux-prototype/                 ← 原型参考（icpux 完整副本）
├── CLAUDE.md                     ← 本文件：AI 协作约定
└── README.md
```

### AI 上下文加载顺序

1. **先读** `docs/Sot.md` — 技术栈、一期范围、决策溯源
2. **次读** `docs/技术/迭代计划.md` — 当前迭代位置、已完成和待完成工作
3. **再读** `docs/技术/开发规则.md` — 代码规范、DDD 分层、数据库铁律
4. **按需读** `docs/项目启动文档.md` — 完整启动背景
5. **按需读** `docs/技术/技术架构.md` — 架构详细设计
6. **按需读** `docs/技术/模块设计/*.md` — 当前迭代涉及的具体模块设计
7. **按需读** `docs/产品/使用指南/*.md` — 模块使用文档（面向运营人员）

---

## 技术栈速查

| 层次 | 选型 |
|------|------|
| 后端 | NestJS + TypeScript |
| ORM | Prisma |
| 数据库 | PostgreSQL 15+ |
| 缓存/队列 | Redis + BullMQ |
| 前端 | Next.js 14+ (App Router) |
| UI | shadcn/ui + Tailwind CSS |
| API | REST + OpenAPI (@nestjs/swagger) |
| 文件存储 | MinIO (开发) / 阿里云 OSS (生产) |
| 项目组织 | pnpm Monorepo |
| 部署 | Docker Compose → 阿里云 ECS |

---

## 常见操作

| 操作 | 命令 |
|------|------|
| 一键初始化 | `pnpm setup` |
| 启动基础设施 | `pnpm docker:up` |
| 启动前后端 | `pnpm dev` |
| 仅启动后端 | `pnpm dev:api` |
| 仅启动前端 | `pnpm dev:web` |
| Prisma 生成类型 | `pnpm db:generate` |
| Prisma 迁移 | `pnpm db:migrate` |
| 填充种子数据 | `pnpm db:seed` |
| 运行测试 | `pnpm test` |
| 类型检查 | `pnpm typecheck` |

---

## 目录结构（一期）

```
├── apps/
│   ├── web/              ← 前端 Next.js 14+ (App Router)
│   ├── api/              ← 后端 NestJS (模块化单体 + DDD)
│   │   ├── prisma/       ← Prisma schema + 迁移 + 种子
│   │   └── src/modules/
│   │       ├── contract/     ✅ 一期实现
│   │       ├── master-data/  ⬜ 仅合约必需的最小主数据
│   │       ├── common/       ✅ 认证、RBAC、审批（最简版）
│   │       ├── logistics/    ⛔ 本期不铺开
│   │       ├── inventory/    ⛔ 本期不铺开
│   │       └── ...
├── packages/
│   └── shared-types/     ← 前后端共享类型
├── docs/                 ← AI OS 文档体系
├── ux-prototype/         ← 原型参考
├── docker-compose.yml    ← PostgreSQL + Redis + MinIO
└── pnpm-workspace.yaml
```

---

## 一期范围

- **合约创建 → 审核 → 生效** 一条完整路径
- 单一角色（采购/交易员）
- **最小主数据**（供应商、物料、仓库）
- **最简版**认证 + RBAC + 写死审批流程
- **不涉及**物流、库存、资金结算

---

## 协作约定

### AI 自动执行范围

- 创建/修改代码文件
- 运行 `pnpm install`
- 运行 `prisma generate` / `prisma migrate dev`
- 运行测试
- 更新 docs/ 下文档（更新记录.md 同步登记）
- git add / git commit

### 需用户确认

- git push
- 修改生产环境配置
- 删除文件/目录
- 修改 Sot.md 锁定决策

### Prompt 归档

每次产出质量高的 AI 协作后，将 prompt 按格式保存到 `docs/prompt记录/`：

```markdown
## 场景
简要描述

## Prompt
完整 prompt 文本

## 评估
产出质量：高/中/低
可复用：是（下次类似场景可直接复用）/ 否
```
