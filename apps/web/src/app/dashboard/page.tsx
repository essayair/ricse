'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, Box, ChevronRight, ClipboardList, FileText, FlaskConical,
  Package, RefreshCw, Scale, Truck, Warehouse,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTimeToSecond } from '@/lib/date-time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Activity = {
  id: string;
  occurredAt: string;
  title: string;
  subtitle: string;
  href: string;
  type: 'error' | 'warning' | 'success' | 'info';
};

type Overview = {
  generatedAt: string;
  permissions: Record<string, boolean>;
  metrics: Record<string, number>;
  alerts: Activity[];
  activities: Activity[];
};

const EMPTY: Overview = {
  generatedAt: '', permissions: {}, metrics: {}, alerts: [], activities: [],
};

const COLOR = {
  blue: { bg: 'bg-primary-bg', text: 'text-primary' },
  amber: { bg: 'bg-warning-bg', text: 'text-warning' },
  green: { bg: 'bg-success-bg', text: 'text-success' },
  red: { bg: 'bg-destructive-bg', text: 'text-destructive' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-600' },
};

export default function DashboardPage() {
  const [data, setData] = useState<Overview>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setData(await api.get<Overview>('/dashboard/overview'));
    } catch (err: any) {
      setError(err.message || '系统总览加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const m = data.metrics;
  const stats = [
    { label: '本月采购入库量', value: metric(data.permissions.inventory, m.monthlyPurchaseQuantity, 3), unit: '吨', note: '本月已过账采购入库', icon: Package, color: 'blue' as const },
    { label: '当前在途车辆', value: metric(data.permissions.logistics, m.inTransitVehicles), unit: '辆', note: '状态为运输中的运单', icon: Truck, color: 'amber' as const },
    { label: '当前账面库存', value: metric(data.permissions.inventory, m.inventoryPhysicalQuantity, 3), unit: '吨', note: `${metric(data.permissions.inventory, m.inventoryLotCount)} 个有效库存批次`, icon: Box, color: 'green' as const },
    { label: '待处理异常', value: number(m.alertCount), unit: '条', note: `磅差 ${number(m.abnormalWeighTickets)} · 质检拒收 ${number(m.fuseQualityInspections)} · 运单超时 ${number(m.overdueWaybills)}`, icon: AlertTriangle, color: 'red' as const },
  ];
  const flowSteps = [
    { label: '执行批次', value: m.activeOrders, suffix: '个执行中', href: '/dashboard/orders', permission: data.permissions.execution, icon: ClipboardList, color: 'blue' as const },
    { label: '物流运输', value: m.inTransitVehicles, suffix: '车在途', href: '/dashboard/waybills', permission: data.permissions.logistics, icon: Truck, color: 'amber' as const },
    { label: '过磅称重', value: m.todayWeighTickets, suffix: '张今日磅单', href: '/dashboard/weighbridge', permission: data.permissions.quality, icon: Scale, color: 'green' as const },
    { label: '到货质检', value: m.pendingQualityInspections, suffix: '项待处理', href: '/dashboard/quality', permission: data.permissions.quality, icon: FlaskConical, color: 'purple' as const },
    { label: '入库作业', value: m.pendingInboundReceipts, suffix: '单待入账', href: '/dashboard/inbound', permission: data.permissions.inventory, icon: Warehouse, color: 'green' as const },
    { label: '出库作业', value: m.pendingOutboundOrders, suffix: '单待完成', href: '/dashboard/outbound', permission: data.permissions.inventory, icon: Package, color: 'amber' as const },
  ];
  const modules = [
    { name: '采销管理', desc: '合同 / 执行批次 / 执行通知', href: '/dashboard/contracts', icon: FileText, color: 'blue' as const, permission: data.permissions.contracts, stats: [['执行中合同', m.activeContracts], ['待审批合同', m.pendingApprovalContracts]] },
    { name: '物流管理', desc: '通知 / 调度 / 运单', href: '/dashboard/waybills', icon: Truck, color: 'amber' as const, permission: data.permissions.logistics, stats: [['当前在途', m.inTransitVehicles], ['超时运单', m.overdueWaybills]] },
    { name: '库存管理', desc: '库存主体 / 仓库 / 批次', href: '/dashboard/inventory', icon: Box, color: 'green' as const, permission: data.permissions.inventory, stats: [['账面库存(吨)', decimal(m.inventoryPhysicalQuantity)], ['有效批次', m.inventoryLotCount]] },
    { name: '到货质检', desc: '任务 / 多机构报告 / 最终判定', href: '/dashboard/quality', icon: FlaskConical, color: 'purple' as const, permission: data.permissions.quality, stats: [['待处理', m.pendingQualityInspections], ['拒收任务', m.fuseQualityInspections]] },
    { name: '地磅管理', desc: '称重 / 复磅 / 偏差复核', href: '/dashboard/weighbridge', icon: Scale, color: 'blue' as const, permission: data.permissions.quality, stats: [['今日磅单', m.todayWeighTickets], ['偏差异常', m.abnormalWeighTickets]] },
    { name: '出入库作业', desc: '到货入库 / 销售出库', href: '/dashboard/inbound', icon: Warehouse, color: 'green' as const, permission: data.permissions.inventory, stats: [['待入库', m.pendingInboundReceipts], ['待出库', m.pendingOutboundOrders]] },
  ];

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold">系统总览</h1>
        <p className="mt-1 text-sm text-muted-foreground">{data.generatedAt ? `数据更新于 ${formatDateTimeToSecond(data.generatedAt)}` : '正在读取系统数据'} · 统计受当前账号数据范围限制</p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新数据</Button>
        {data.permissions.contracts && <Button asChild><Link href="/dashboard/contracts/create">+新建合同</Link></Button>}
      </div>
    </div>

    {error && <div className="rounded-lg border border-destructive-border bg-destructive-bg p-4 text-sm text-destructive">{error}</div>}
    {!loading && !error && (data.alerts.length ? <Card className="border-destructive-border bg-destructive-bg">
      <CardContent className="p-4">
        <div className="mb-3 flex items-center gap-2 font-medium text-destructive"><AlertTriangle className="h-5 w-5" />待处理异常 {data.metrics.alertCount} 条</div>
        <div className="grid gap-2 md:grid-cols-2">{data.alerts.slice(0, 4).map(item => <Link key={item.id} href={item.href} className="rounded-md border border-destructive-border bg-background/70 p-3 text-sm hover:bg-background"><div className="font-medium">{item.title}</div><div className="mt-1 text-xs text-muted-foreground">{item.subtitle}</div></Link>)}</div>
      </CardContent>
    </Card> : <div className="rounded-lg border border-success/20 bg-success-bg p-4 text-sm text-success">当前数据范围内没有磅差异常、质检拒收或运单超时。</div>)}

    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{stats.map(stat => {
      const colors = COLOR[stat.color];
      return <Card key={stat.label}><CardContent className="p-5"><div className={`w-fit rounded-lg p-2.5 ${colors.bg} ${colors.text}`}><stat.icon className="h-5 w-5" /></div><div className="mt-3 text-xs text-muted-foreground">{stat.label}</div><div className="mt-1 flex items-baseline gap-1"><span className="text-2xl font-bold">{stat.value}</span><span className="text-xs text-muted-foreground">{stat.value === '—' ? '' : stat.unit}</span></div><div className="mt-1 text-xs text-muted-foreground">{stat.note}</div></CardContent></Card>;
    })}</div>

    <Card><CardHeader className="pb-3"><CardTitle className="text-base">业务主流程当前进度</CardTitle></CardHeader><CardContent><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{flowSteps.map((step, index) => {
      const colors = COLOR[step.color];
      const content = <div className="flex h-full items-center gap-3 rounded-lg border p-3"><div className={`rounded-full p-2 ${colors.bg}`}><step.icon className={`h-4 w-4 ${colors.text}`} /></div><div><div className="text-sm font-medium">{step.label}</div><div className="mt-0.5 text-xs text-muted-foreground">{step.permission ? `${number(step.value)} ${step.suffix}` : '无查看权限'}</div></div>{index < flowSteps.length - 1 && <ChevronRight className="ml-auto hidden h-4 w-4 text-muted-foreground xl:block" />}</div>;
      return step.permission ? <Link key={step.label} href={step.href}>{content}</Link> : <div key={step.label}>{content}</div>;
    })}</div></CardContent></Card>

    <div className="grid gap-6 lg:grid-cols-2">
      <Card><CardHeader><CardTitle className="text-base">模块状态</CardTitle></CardHeader><CardContent><div className="grid gap-3 sm:grid-cols-2">{modules.map(mod => {
        const colors = COLOR[mod.color];
        const content = <div className="rounded-lg border p-4 transition-shadow hover:shadow-sm"><div className="flex items-start gap-3"><div className={`rounded-lg p-2 ${colors.bg} ${colors.text}`}><mod.icon className="h-4 w-4" /></div><div><div className="text-sm font-medium">{mod.name}</div><div className="text-[11px] text-muted-foreground">{mod.desc}</div></div></div>{mod.permission ? <div className="mt-3 flex gap-5">{mod.stats.map(([label, value]) => <div key={String(label)}><div className="text-sm font-bold">{number(value as number)}</div><div className="text-[10px] text-muted-foreground">{label}</div></div>)}</div> : <div className="mt-3 text-xs text-muted-foreground">当前账号无该模块查看权限</div>}</div>;
        return mod.permission ? <Link key={mod.name} href={mod.href}>{content}</Link> : <div key={mod.name}>{content}</div>;
      })}</div></CardContent></Card>

      <Card><CardHeader><CardTitle className="text-base">最近业务动态</CardTitle></CardHeader><CardContent>{data.activities.length ? <div className="space-y-1">{data.activities.map(item => <Link key={item.id} href={item.href} className="flex gap-3 rounded-md p-2 hover:bg-muted/60"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${activityColor(item.type)}`} /><div className="min-w-0"><div className="text-xs text-muted-foreground">{formatDateTimeToSecond(item.occurredAt)}</div><div className="mt-0.5 truncate text-sm">{item.title}</div><div className="truncate text-xs text-muted-foreground">{item.subtitle}</div></div></Link>)}</div> : <div className="py-12 text-center text-sm text-muted-foreground">{loading ? '正在加载业务动态…' : '当前数据范围内暂无业务动态'}</div>}</CardContent></Card>
    </div>
    <div className="text-center text-xs text-muted-foreground">结算与监控模块尚未形成业务数据，本页不再展示模拟数字。</div>
  </div>;
}

function decimal(value: number | undefined, maximumFractionDigits = 3) {
  return Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits });
}

function number(value: number | undefined) {
  return Number(value || 0).toLocaleString('zh-CN');
}

function metric(allowed: boolean | undefined, value: number | undefined, digits = 0) {
  return allowed ? decimal(value, digits) : '—';
}

function activityColor(type: Activity['type']) {
  return { error: 'bg-destructive', warning: 'bg-warning', success: 'bg-success', info: 'bg-primary' }[type];
}
