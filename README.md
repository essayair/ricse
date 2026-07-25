# RICSE · 区域产业链服务生态

**Regional Industry Chain Service Ecosystem**

打造区域产业链的供应链协同管理平台，涵盖采购、销售、物流、库存、质检、结算的全链路数字化管理。

---

## 快速开始（本地开发）

```bash
# 1. 安装依赖
pnpm install

# 2. 启动基础设施（PostgreSQL + Redis + MinIO）
pnpm docker:up

# 3. 数据库迁移 + 种子数据
pnpm db:migrate
pnpm db:seed

# 4. 启动前后端开发服务器（并行）
pnpm dev
```

- **前端**: http://localhost:3001
- **API**: http://localhost:3000/api/v1
- **API 文档**: http://localhost:3000/api/docs (Swagger)
- **Prisma Studio**: `pnpm db:studio` → http://localhost:5555

**默认账号**: `admin` / `admin123` 或 `approver` / `user123`

> 上述账号仅用于本地开发。线上测试环境通过环境变量设置独立密码，并默认关闭公开注册。

## 阿里云测试环境部署

项目已提供 ECS + Docker Compose 部署配置，入口见：

- [`deploy/README.md`](deploy/README.md)
- [`docs/技术/阿里云测试环境部署.md`](docs/技术/阿里云测试环境部署.md)

部署配置不会向公网暴露 PostgreSQL、Redis、MinIO、API 或 Web 原始端口，外部流量统一通过 Nginx 的 80/443 进入。

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
│   ├── web/              # 前端 Next.js 14+ (App Router)
│   ├── api/              # 后端 NestJS (模块化单体 + DDD)
│   │   └── prisma/       # Prisma schema + 迁移 + 种子
├── packages/
│   └── shared-types/     # 前后端共享 TypeScript 类型
├── docs/                 # AI OS 文档体系
├── ux-prototype/         # UX 原型参考（icpux）
├── docker-compose.yml
├── CLAUDE.md
└── README.md
```

---

## 技术栈

| 层次 | 选型 |
|------|------|
| 架构 | 模块化单体 + DDD |
| 后端 | NestJS + TypeScript |
| ORM | Prisma |
| 数据库 | PostgreSQL 15+ |
| 缓存/队列 | Redis + BullMQ |
| 前端 | Next.js 14+ (App Router) + Tailwind CSS |
| API | REST + OpenAPI (@nestjs/swagger) |
| 文件存储 | MinIO (开发) / 阿里云 OSS (生产) |
| 项目组织 | pnpm Monorepo |

---

## 命令行速查

| 操作 | 命令 |
|------|------|
| 一键初始化 | `pnpm setup` |
| 启动基础设施 | `pnpm docker:up` |
| 停止基础设施 | `pnpm docker:down` |
| 启动前后端 | `pnpm dev` |
| 仅启动后端 | `pnpm dev:api` |
| 仅启动前端 | `pnpm dev:web` |
| 生成 Prisma 类型 | `pnpm db:generate` |
| 执行迁移 | `pnpm db:migrate` |
| 填充种子数据 | `pnpm db:seed` |
| 运行后端测试 | `pnpm test` |
| 类型检查 | `pnpm typecheck` |

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
