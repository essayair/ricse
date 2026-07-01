# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

**ricse** — 区域产业链平台。当前处于起始阶段。

## 项目结构

```
├── ux-prototype/        # UX 原型参考（icpux 完整副本）
├── CLAUDE.md
└── README.md
```

## UX 原型

`ux-prototype/` 目录是 icpux 项目的完整副本，包含一套静态 HTML 管理后台原型，用于参考交互设计和业务逻辑。打开 `ux-prototype/index.html` 即可在浏览器中浏览，无需服务器。

原型涵盖以下业务模块，每个模块一个子目录：

| 目录 | 模块 |
|------|------|
| `ux-prototype/caixiao/` | 采销系统 |
| `ux-prototype/logistics/` | 物流管理 |
| `ux-prototype/inventory/` | 库存管理 |
| `ux-prototype/weighbridge/` | 磅单管理 |
| `ux-prototype/quality/` | 质检化验 |
| `ux-prototype/monitor/` | 监控录像 |
| `ux-prototype/master/` | 主数据管理 |
| `ux-prototype/org/` | 组织数据 |

## 注意事项

- `ux-prototype/` 内的页面布局依赖侧边栏相对路径，始终在 `ux-prototype/` 目录下打开浏览，不要移动文件层级
- 修改 `ux-prototype/` 内的页面时需注意侧边栏路径前缀规则（根目录、子目录、`ux-prototype/logistics/` 内部各不相同）
