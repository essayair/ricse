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
│   ├── 项目启动文档.md            ← 启动文档（4C 框架来源）
│   ├── tech-architect.md         ← 完整技术架构设计
│   ├── 开发规则.md                ← 编码规范、DDD 约定、提交规范
│   ├── 更新记录.md                ← docs/ 下所有文件的变更追溯
│   ├── adr/                      ← 架构决策记录（每项重大决策一个文件）
│   │   └── README.md
│   └── prompt记录/               ← 有效 prompt 归档与沉淀
│       └── README.md
├── ux-prototype/                 ← 原型参考（icpux 完整副本）
├── CLAUDE.md                     ← 本文件：AI 协作约定
└── README.md
```

### AI 上下文加载顺序

1. **先读** `docs/Sot.md` — 技术栈、一期范围、决策溯源
2. **次读** `docs/开发规则.md` — 代码规范、DDD 分层、数据库铁律
3. **按需读** `docs/project-kickoff.md` — 完整启动背景
4. **按需读** `docs/tech-architect.md` — 架构详细设计

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
| 启动后端 | `pnpm --filter @ricse/api dev` |
| 启动前端 | `pnpm --filter @ricse/web dev` |
| Prisma 生成类型 | `pnpm --filter @ricse/api prisma:generate` |
| Prisma 迁移 | `pnpm --filter @ricse/api prisma:migrate` |
| 运行测试 | `pnpm --filter @ricse/api test` |
| 类型检查 | `pnpm -r tsc --noEmit` |

---

## 目录结构（一期）

```
├── apps/
│   ├── web/              ← 前端 Next.js
│   ├── api/              ← 后端 NestJS
│   │   └── src/modules/
│   │       ├── contract/     ✅ 一期实现
│   │       ├── master-data/  ⬜ 仅合约必需的最小主数据
│   │       ├── common/       ✅ 认证、RBAC、审批（最简版）
│   │       ├── logistics/    ⛔ 本期不铺开
│   │       ├── inventory/    ⛔ 本期不铺开
│   │       └── ...
├── packages/
│   └── shared-types/     ← 前后端共享类型
├── prisma/
│   └── schema.prisma     ← 数据库结构
├── docs/                 ← AI OS 文档体系
└── ux-prototype/         ← 原型参考
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
