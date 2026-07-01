'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  FileText,
  Truck,
  Package,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  ClipboardList,
  Scale,
  FlaskConical,
  Monitor,
  DollarSign,
  Camera,
  Box,
  ChevronRight,
} from 'lucide-react';

const STATS = [
  { label: '本月采购量', value: '2,450', unit: '吨', icon: Package, color: 'blue', trend: 'up', note: '较上月 +12.3%' },
  { label: '当前在途车辆', value: '12', unit: '辆', icon: Truck, color: 'amber', trend: 'neutral', note: '今日新增 3 辆发车' },
  { label: '当前库存总量', value: '890', unit: '吨', icon: Box, color: 'green', trend: 'down', note: '较昨日 -45 吨' },
  { label: '待处理告警', value: '3', unit: '条', icon: AlertTriangle, color: 'red', trend: 'warn', note: '磅差 2 · 质检熔断 1' },
];

const STAT_COLORS: Record<string, { bg: string; icon: string }> = {
  blue: { bg: 'bg-primary-bg', icon: 'text-primary' },
  amber: { bg: 'bg-warning-bg', icon: 'text-warning' },
  green: { bg: 'bg-success-bg', icon: 'text-success' },
  red: { bg: 'bg-destructive-bg', icon: 'text-destructive' },
};

const FLOW_STEPS = [
  { icon: ClipboardList, label: '采销订单', desc: '5 单执行中', color: 'blue' },
  { icon: Truck, label: '物流运输', desc: '12 车在途', color: 'orange' },
  { icon: Scale, label: '过磅称重', desc: '今日 8 次', color: 'green' },
  { icon: FlaskConical, label: '质检化验', desc: '3 批待检', color: 'purple' },
  { icon: Package, label: '入库存储', desc: '890 吨在库', color: 'green' },
  { icon: DollarSign, label: '价款结算', desc: '2 单待审', color: 'yellow' },
];

const FLOW_COLORS: Record<string, { bg: string; text: string }> = {
  blue: { bg: 'bg-primary-bg', text: 'text-primary' },
  orange: { bg: 'bg-warning-bg', text: 'text-warning' },
  green: { bg: 'bg-success-bg', text: 'text-success' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-600' },
  yellow: { bg: 'bg-warning-bg', text: 'text-warning' },
};

const FLOW_DESC_COLORS: Record<string, string> = {
  blue: 'text-primary',       // 采销订单
  orange: 'text-warning',     // 物流运输
  green: 'text-muted-foreground', // 过磅称重
  purple: 'text-warning',     // 质检化验
  yellow: 'text-muted-foreground', // 价款结算
};

const MODULES: Array<{
  name: string;
  desc: string;
  icon: any;
  href: string;
  color: string;
  stats: Array<{ label: string; value: string; danger?: boolean; warning?: boolean; success?: boolean }>;
}> = [
  {
    name: '采销管理',
    desc: '合同 / 订单 / 结算',
    icon: FileText,
    href: '/dashboard/contracts',
    color: 'bg-primary-bg text-primary',
    stats: [
      { label: '合同执行中', value: '8' },
      { label: '订单待发货', value: '5' },
    ],
  },
  {
    name: '物流管理',
    desc: '调度 / 运单 / 结算',
    icon: Truck,
    href: '/dashboard/dispatch',
    color: 'bg-warning-bg text-warning',
    stats: [
      { label: '在途', value: '12' },
      { label: '超时告警', value: '1', danger: true },
    ],
  },
  {
    name: '库存管理',
    desc: '批次 / 库位 / 盘点',
    icon: Package,
    href: '/dashboard/inventory',
    color: 'bg-success-bg text-success',
    stats: [
      { label: '吨在库', value: '890' },
      { label: '批次', value: '14' },
    ],
  },
  {
    name: '质检化验',
    desc: '取样 / 报告 / 熔断',
    icon: FlaskConical,
    href: '/dashboard/quality',
    color: 'bg-purple-50 text-purple-600',
    stats: [
      { label: '待检', value: '3', warning: true },
      { label: '熔断处理', value: '1', danger: true },
    ],
  },
  {
    name: '地磅管理',
    desc: '磅单 / 防作弊',
    icon: Scale,
    href: '/dashboard/weighbridge',
    color: 'bg-primary-bg text-primary',
    stats: [
      { label: '今日磅单', value: '8' },
      { label: '磅差异常', value: '2', danger: true },
    ],
  },
  {
    name: '监控录像',
    desc: '实时 / 存证',
    icon: Camera,
    href: '/dashboard/monitor',
    color: 'bg-muted text-muted-foreground',
    stats: [
      { label: '在线摄像头', value: '6' },
      { label: '系统状态', value: '正常', success: true },
    ],
  },
];

const TIMELINE = [
  { time: '09:28', text: '🚨 甘A·12345 磅差超限，净重偏差 0.8%', sub: '地磅管理 · 需要人工复核', type: 'error' },
  { time: '08:55', text: '⚠ HT-2026003 质检熔断，水分超标 0.3%', sub: '质检化验 · 待采销协商处理', type: 'warning' },
  { time: '08:30', text: '✅ 批次 PC-0610-03 完成入库，净重 68.5 吨', sub: '库存管理 · 玉门堆场 A-03 库位', type: 'done' },
  { time: '08:12', text: '✅ 甘B·88890 完成过磅，净重 72.4 吨', sub: '地磅管理 · 关联运单 WB-20260610-06', type: 'done' },
  { time: '07:45', text: '📋 合同 HT-2026007 审核通过，已生成采购订单', sub: '采销系统 · 玉门众鑫矿业 · 萤石粉97% · 200吨', type: 'info' },
  { time: '07:20', text: '🚛 3 辆车从玉门出发，预计 14:00 到达巨化', sub: '物流管理 · 销售订单 SO-20260610-002', type: 'done' },
  { time: '18:30', text: '💰 结算单 STL-2026-019 财务审核完成', sub: '结算管理 · 合同 HT-2026002 · 金额 ¥326,500', type: 'done' },
];

const TIMELINE_DOTS: Record<string, string> = {
  error: 'bg-destructive',
  warning: 'bg-warning',
  done: 'bg-success',
  info: 'bg-primary',
};

export default function DashboardPage() {
  const renderTrend = (trend: string, note: string) => {
    if (trend === 'up') return <span className="flex items-center gap-0.5 text-xs text-success"><ArrowUpRight className="h-3 w-3" />{note}</span>;
    if (trend === 'down') return <span className="flex items-center gap-0.5 text-xs text-destructive"><ArrowDownRight className="h-3 w-3" />{note}</span>;
    if (trend === 'warn') return <span className="flex items-center gap-0.5 text-xs text-warning"><Minus className="h-3 w-3" />{note}</span>;
    return <span className="text-xs text-muted-foreground">{note}</span>;
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">系统总览</h1>
          <p className="text-sm text-muted-foreground mt-1">
            2026年7月1日 · 数据更新于 14:00 | 玉门运营基地
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/dashboard/contracts"><FileText className="h-4 w-4 mr-1" />查看合同</Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard/contracts/create">+ 新建合同</Link>
          </Button>
        </div>
      </div>

      {/* Alert */}
      <div className="flex items-start gap-3 rounded-lg border border-destructive-border bg-destructive-bg p-4 text-sm">
        <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
        <div>
          <strong className="text-destructive">待处理告警 3 条：</strong>
          <span className="text-destructive/80 ml-2">甘A·12345 磅差超限（进出差 0.8%）· HT-2026003 质检熔断待协商 · 甘B·66789 在途超时 2.5 小时</span>
          <span className="text-primary ml-2 cursor-pointer hover:underline">立即处理 →</span>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        {STATS.map((stat) => {
          const colors = STAT_COLORS[stat.color] || STAT_COLORS.blue;
          return (
            <Card key={stat.label}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className={`rounded-lg p-2.5 ${colors.bg} ${colors.icon}`}>
                    <stat.icon className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-3">
                  <div className="text-xs text-muted-foreground">{stat.label}</div>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-2xl font-bold">{stat.value}</span>
                    <span className="text-xs text-muted-foreground">{stat.unit}</span>
                  </div>
                  <div className="mt-1">{renderTrend(stat.trend, stat.note)}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Business Flow */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">业务主流程 — 今日进度</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            {FLOW_STEPS.map((step, i) => {
              const flowColors = FLOW_COLORS[step.color] || FLOW_COLORS.blue;
              const descColor = FLOW_DESC_COLORS[step.color] || 'text-muted-foreground';
              return (
                <div key={step.label} className="flex items-center">
                  <div className="flex flex-col items-center gap-1.5">
                    <div className={`rounded-full p-2.5 ${flowColors.bg}`}>
                      <step.icon className={`h-4 w-4 ${flowColors.text}`} />
                    </div>
                    <span className="text-xs font-medium">{step.label}</span>
                    <span className={`text-[10px] ${descColor} font-medium`}>{step.desc}</span>
                  </div>
                  {i < FLOW_STEPS.length - 1 && <ChevronRight className="h-5 w-5 text-muted-foreground mx-2 mt-[-1.5rem]" />}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Module Status + Timeline */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Module Status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">模块状态</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {MODULES.map((mod) => (
                <Link key={mod.name} href={mod.href}>
                  <div className="rounded-lg border p-4 hover:shadow-sm transition-shadow">
                    <div className="flex items-start gap-3">
                      <div className={`rounded-lg p-2 ${mod.color}`}>
                        <mod.icon className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-sm font-medium">{mod.name}</div>
                        <div className="text-[11px] text-muted-foreground">{mod.desc}</div>
                      </div>
                    </div>
                    <div className="mt-3 flex gap-4">
                      {mod.stats.map((stat) => {
                        const valClass = stat.danger ? 'text-destructive' : stat.warning ? 'text-warning' : stat.success ? 'text-success' : '';
                        return (
                          <div key={stat.label}>
                            <div className={`text-sm font-bold ${valClass}`}>
                              {stat.value}
                            </div>
                            <div className="text-[10px] text-muted-foreground">{stat.label}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Timeline */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">最近动态</CardTitle>
            <span className="text-xs text-primary cursor-pointer hover:underline">全部 →</span>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {TIMELINE.map((item) => (
                <div key={item.time} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`h-2 w-2 rounded-full mt-1.5 ${TIMELINE_DOTS[item.type] || 'bg-muted-foreground'}`} />
                    <div className="w-px flex-1 bg-border mt-1" />
                  </div>
                  <div className="pb-4">
                    <div className="text-xs text-muted-foreground">{item.time}</div>
                    <div className="text-sm mt-0.5">{item.text}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{item.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
