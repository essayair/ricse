# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

萤石产业链平台（icpux）— 矿产供应链运营管理系统。当前为**静态 HTML 原型**（管理后台前端），用于快速验证业务流程和交互。后续将按 [tech-architect.md](docs/tech-architect.md) 升级为全栈生产系统。

## 如何浏览原型

打开 `index.html` 即可在浏览器中浏览，纯静态，无需任何服务器或构建步骤。所有页面均可点击跳转。

## 当前项目结构

```
├── index.html              # 入口：系统总览 / 工作台
├── assets/css/style.css    # 全局样式（CSS 设计系统）
├── caixiao/                # 采销系统：合同、订单、调度、结算
├── logistics/              # 物流管理：调度看板、运单、出入库、对账
├── inventory/              # 库存管理：在库总览、批次库位
├── weighbridge/            # 地磅管理：磅单上传、称重明细
├── quality/                # 质检化验：取样、报告、熔断
├── monitor/                # 监控录像：实时画面、存证
├── master/                 # 主数据：往来单位、物料、仓库、车辆、价格、用户、审批
├── org/                    # 组织数据：公司、部门、岗位
└── docs/                   # 产品文档：PRD、技术架构、各角色需求
```

## HTML 页面模式

每个页面遵循相同的布局结构，使用固定的 CSS 类名体系：

```html
<div class="app-layout">
  <aside class="sidebar">
    <div class="sidebar-logo">...</div>
    <nav class="sidebar-nav">
      <a class="nav-item-top">系统总览</a>
      <div class="nav-group">
        <div class="nav-group-label">采销系统</div>
        <a class="nav-item active">合同管理</a>
      </div>
      <div class="sidebar-section">基础管理</div>
    </nav>
  </aside>
  <div class="main">
    <header class="topbar">...</header>
    <main class="page">...</main>
  </div>
</div>
```

- **侧边栏**：需要在每个 HTML 文件中**手动同步**导航菜单（侧边栏未抽取为公共组件）
- **CSS**：所有页面引用 `../assets/css/style.css`，统一使用 CSS 自定义属性（`--primary`, `--sidebar-bg` 等，见下文）
- **页面链接**：侧边栏中的相对路径按文件所在目录层级变化（根目录页面相对于当前目录）

## CSS 设计系统

所有样式集中在 `assets/css/style.css`（约 2500 行），使用 CSS 自定义属性定义设计 token：

| 类别 | 主要变量 |
|------|---------|
| 主色 | `--primary: #2563eb`, `--primary-hover`, `--primary-bg`, `--primary-border` |
| 语义色 | `--success (#16a34a)`, `--warning (#ca8a04)`, `--danger (#dc2626)`, `--info (#0891b2)` |
| 布局 | `--sidebar-w: 224px`, `--topbar-h: 52px` |
| 表面 | `--body-bg: #f1f5f9`, `--surface: #fff`, `--surface-2: #f8fafc` |
| 文字 | `--text: #0f172a`, `--text-2: #64748b`, `--text-3: #94a3b8` |
| 侧边栏 | `--sidebar-bg: #0f172a`, `--sidebar-text: #94a3b8`, `--sidebar-hover-bg: #1e293b` |

核心组件类：`.card`, `.stat-card`, `.mod-card`, `.btn-primary`, `.btn-default`, `.flow-step`, `.timeline`, `.table`, `.form-group`, `.modal`, `.badge`, `.alert`

## 业务领域模型

系统覆盖矿产（萤石）贸易全链路：

```
主数据 → 采销合同 → 物流运输（派车/在途）→ 地磅过磅 → 质检化验 → 入库存储 → 价款结算
```

8 大业务模块对应 8 个目录，模块间通过业务单据（合同号、运单号、磅单号、入库单号）关联。

## 未来技术栈（参考 tech-architect.md）

当前原型之后，生产系统规划为：

- **架构**：模块化单体（NestJS + Next.js pnpm monorepo），DDD 有界上下文划分；**业务层与 AI 层分离，AI 仅用于只读数据消费**
- **后端**：NestJS + TypeScript + Prisma + Supabase (PostgreSQL) + Redis + BullMQ
- **前端**：Next.js 14+ (App Router) + **shadcn/ui + Tailwind CSS**
- **认证**：Supabase Auth（一期）或 JWT + RBAC
- **存储**：Supabase Storage（推荐）或 MinIO (S3 兼容)
- **部署**：Vercel（开发/演示）或 Docker Compose → 云服务器（生产）
- **共享类型**：`packages/shared/` 目录存放前后端共用的 TypeScript 类型、枚举、常量

分三阶段交付（共 12 周），优先打通「合同 → 物流 → 地磅 → 库存 → 质检 → 结算」最小闭环。

## 相关文档

- [功能特性 PRD](docs/function-prd.md)
- [技术架构设计](docs/tech-architect.md)
- [采销业务员-合同管理](docs/02_采销业务员-合同管理.md)
- [物流运营-物流管理](docs/03_物流运营-物流管理.md)
- [现场一线-地磅质检监控](docs/04_现场一线-地磅质检监控.md)
- [仓储库管-库存管理](docs/05_仓储库管-库存管理.md)
- [财务结算-资金付款管理](docs/06_财务结算-资金付款管理.md)
- [运营管理者-工作台](docs/07_运营管理者-工作台.md)
