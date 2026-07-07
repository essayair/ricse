'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarIconItem,
  SidebarSectionLabel,
  SidebarGroupItem,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  LayoutDashboard,
  FileText,
  Truck,
  Warehouse,
  FlaskConical,
  Building2,
  Box,
} from 'lucide-react';

interface NavGroup {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children: Array<{ href: string; label: string }>;
}

const NAV_ITEMS: NavGroup[] = [
  {
    label: '采销管理',
    icon: FileText,
    children: [
      { href: '/dashboard/contracts', label: '合同管理' },
      { href: '/dashboard/orders', label: '订单管理' },
      { href: '/dashboard/settlement', label: '结算管理' },
    ],
  },
  {
    label: '物流管理',
    icon: Truck,
    children: [
      { href: '/dashboard/dispatch', label: '调度看板' },
      { href: '/dashboard/waybills', label: '运单管理' },
      { href: '/dashboard/logistics-reconciliation', label: '物流对账' },
    ],
  },
  {
    label: '库存管理',
    icon: Warehouse,
    children: [
      { href: '/dashboard/inventory', label: '在库总览' },
      { href: '/dashboard/inbound', label: '入库单管理' },
      { href: '/dashboard/outbound', label: '出库单管理' },
    ],
  },
  {
    label: '质检影像',
    icon: FlaskConical,
    children: [
      { href: '/dashboard/weighbridge', label: '磅单管理' },
      { href: '/dashboard/quality', label: '质检单管理' },
      { href: '/dashboard/monitor', label: '监控录像' },
    ],
  },
];

const BASE_ITEMS: NavGroup[] = [
  {
    label: '主数据管理',
    icon: Box,
    children: [
      { href: '/dashboard/master-data?tab=partners', label: '合作伙伴' },
      { href: '/dashboard/master-data?tab=materials', label: '物料品类' },
      { href: '/dashboard/master-data?tab=warehouses', label: '仓库库位' },
      { href: '/dashboard/master-data?tab=vehicles', label: '车辆管理' },
      { href: '/dashboard/master-data?tab=price', label: '价格基准' },
      { href: '/dashboard/master-data?tab=approval', label: '审批流程' },
    ],
  },
  {
    label: '组织数据',
    icon: Building2,
    children: [
      { href: '/dashboard/org', label: '企业维护' },
      { href: '/dashboard/org?tab=dept', label: '部门管理' },
      { href: '/dashboard/org?tab=employee', label: '员工管理' },
      { href: '/dashboard/org?tab=users', label: '用户账号' },
      { href: '/dashboard/org?tab=business-group', label: '业务组' },
    ],
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { open } = useSidebar();

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    const [base, qs] = href.split('?');

    // Different base path → not active
    if (pathname !== base && !pathname.startsWith(base + '/')) return false;

    // Nav item has query params (e.g. ?tab=suppliers) → match them exactly
    if (qs) {
      const params = new URLSearchParams(qs);
      for (const [key, val] of params) {
        if (searchParams.get(key) !== val) return false;
      }
      return true;
    }

    // Nav item has no query params (e.g. 公司维护) → only active when URL has none
    return !searchParams.toString();
  };

  return (
    <Sidebar>
      {/* Header */}
      <SidebarHeader>
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary text-primary-foreground text-[10px] font-bold">
            R
          </div>
          {open && (
            <div className="flex flex-col">
              <span className="text-base text-sidebar-foreground">运营管理平台</span>
            </div>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {/* 系统总览 */}
        <SidebarIconItem
          icon={LayoutDashboard}
          label="系统总览"
          isActive={pathname === '/dashboard'}
          href="/dashboard"
        />

        {/* 业务模块 — accordion */}
        {NAV_ITEMS.map((group) => (
          <SidebarGroupItem
            key={group.label}
            icon={group.icon}
            label={group.label}
            items={group.children}
            isActive={isActive}
          />
        ))}

        {/* 分隔线 */}
        <div className="px-3 py-1">
          <div className="h-px bg-border" />
        </div>

        {/* 基础管理 */}
        <SidebarSectionLabel>基础管理</SidebarSectionLabel>

        {BASE_ITEMS.map((group) => (
          <SidebarGroupItem
            key={group.label}
            icon={group.icon}
            label={group.label}
            items={group.children}
            isActive={isActive}
          />
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
