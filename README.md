# RICSE · 区域产业链服务生态

**Regional Industry Chain Service Ecosystem**

打造区域产业链的供应链协同管理平台，涵盖采购、销售、物流、库存、质检、结算的全链路数字化管理。

---

## 项目定位

| 层次 | 范围 |
|------|------|
| **SCP** — 供应链规划 | 需求计划、供应计划、库存计划、配送计划 |
| **ICP** — 集成供应链 | 端到端打通上述模块的一体化协同 |
| **RICE** — 区域产业链服务生态 | 面向区域多主体的产业链服务平台 |

---

## 当前阶段

一期走通 **合约主线**：合同创建 → 审核 → 生效，验证产品设计、数据模型、技术架构、AI 开发流程四者能否闭环跑通。

---

## 项目结构

```
├── apps/
│   ├── web/              # 前端 Next.js (shadcn/ui + Tailwind CSS)
│   └── api/              # 后端 NestJS (模块化单体 + DDD)
├── packages/
│   └── shared-types/     # 前后端共享 TypeScript 类型
├── prisma/
│   └── schema.prisma     # 数据库结构定义
├── docs/                 # AI OS 文档体系
├── ux-prototype/         # UX 原型参考（icpux）
├── CLAUDE.md
└── README.md
```

---

## 技术栈

| 层次 | 选型 |
|------|------|
| 架构 | 模块化单体 + DDD |
| 后端 | NestJS + TypeScript + Prisma + PostgreSQL |
| 前端 | Next.js 14+ (App Router) + shadcn/ui |
| 缓存/队列 | Redis + BullMQ |
| 实时通信 | Socket.IO |
| 文件存储 | MinIO (开发) / 阿里云 OSS (生产) |
| API | REST + OpenAPI |

---

## 开始

```bash
# 依赖安装
pnpm install

# 启动后端（开发模式）
pnpm --filter @ricse/api dev

# 启动前端（开发模式）
pnpm --filter @ricse/web dev

# 数据库迁移
pnpm --filter @ricse/api prisma:migrate
```

---

## 原型参考

`ux-prototype/` 目录包含完整的静态 HTML 原型，打开 `ux-prototype/index.html` 即可在浏览器中浏览交互设计。

---

## 相关文档

| 文档 | 说明 |
|------|------|
| [Sot.md](docs/Sot.md) | 信息源/关键决策 |
| [项目启动文档](docs/项目启动文档.md) | 项目背景与规划 |
| [技术架构设计](docs/tech-architect.md) | 完整架构设计 |
| [开发规则](docs/开发规则.md) | 编码规范与约定 |
