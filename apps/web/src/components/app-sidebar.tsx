'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { PAYABLE_NAV_ITEMS } from '@/lib/settlement-navigation';
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
  Settings2,
  CircleDollarSign,
  Factory,
  Newspaper,
  Users,
  Video,
  Database,
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
      { href: '/dashboard/orders', label: '执行管理' },
      { href: '/dashboard/dispatch-notices', label: '执行通知' },
    ],
  },
  {
    label: '物流管理',
    icon: Truck,
    children: [
      { href: '/dashboard/dispatch', label: '调度看板' },
      { href: '/dashboard/waybills', label: '运单管理' },
      { href: '/dashboard/logistics-settlements', label: '运费结算单' },
      { href: '/dashboard/logistics-contracts', label: '物流合同' },
    ],
  },
  {
    label: '磅单质检',
    icon: FlaskConical,
    children: [
      { href: '/dashboard/weighbridge', label: '磅单管理' },
      { href: '/dashboard/quality', label: '质检管理' },
      { href: '/dashboard/quality/reports', label: '检测报告' },
    ],
  },
  {
    label: '库存管理',
    icon: Warehouse,
    children: [
      { href: '/dashboard/inventory', label: '在库总览' },
      { href: '/dashboard/inbound', label: '入库单管理' },
      { href: '/dashboard/outbound', label: '出库单管理' },
      { href: '/dashboard/inventory-reversals', label: '库存冲销' },
    ],
  },
  {
    label: '生产管理',
    icon: Factory,
    children: [
      { href: '/dashboard/production', label: '生产任务' },
      { href: '/dashboard/production/recipes', label: '生产方案' },
      { href: '/dashboard/production/ledger', label: '生产台账' },
    ],
  },
  {
    label: '资金结算',
    icon: CircleDollarSign,
    children: [
      { href: '/dashboard/receivables', label: '应收管理' },
      ...PAYABLE_NAV_ITEMS,
      { href: '/dashboard/settlement-ledger', label: '结算台账' },
    ],
  },
];

const BASE_ITEMS: NavGroup[] = [
  {
    label: '主数据管理',
    icon: Box,
    children: [
      { href: '/dashboard/master-data?tab=partners', label: '合作伙伴' },
      { href: '/dashboard/master-data?tab=service-organizations', label: '服务生态' },
      { href: '/dashboard/master-data?tab=materials', label: '物料品类' },
      { href: '/dashboard/master-data?tab=warehouses', label: '仓库库位' },
      { href: '/dashboard/master-data?tab=vehicles', label: '运力管理' },
      { href: '/dashboard/master-data?tab=price', label: '价格基准' },
      { href: '/dashboard/master-data?tab=quality-standards', label: '质检标准' },
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
      { href: '/dashboard/org?tab=business-group', label: '业务单元（事业部）' },
    ],
  },
];

const CONTENT_ITEMS: NavGroup[] = [
  {
    label: '内容运营',
    icon: Newspaper,
    children: [
      { href: '/dashboard/content/articles', label: '资讯管理' },
      { href: '/dashboard/content/supply-demand', label: '供需信息' },
      { href: '/dashboard/content/prices', label: '价格行情' },
      { href: '/dashboard/content/contacts', label: '官网咨询' },
      { href: '/dashboard/content/data-sources', label: '数据源管理' },
      { href: '/dashboard/content/jobs', label: '采集与 AI' },
    ],
  },
];

const INDUSTRY_ITEMS: NavGroup[] = [
  {
    label: '产业数据库',
    icon: Database,
    children: [
      { href: '/dashboard/industry-database', label: '产业概览' },
      { href: '/dashboard/industry-database/fluorite-regional-map', label: '区域分布地图' },
      { href: '/dashboard/industry-database/fluorite-producers', label: '萤石生产企业' },
      { href: '/dashboard/industry-database/fluorochemical-producers', label: '氟化工生产企业' },
      { href: '/dashboard/industry-database/mine-resources', label: '矿山与资源' },
      { href: '/dashboard/industry-database/capacity-projects', label: '产能与项目' },
      { href: '/dashboard/industry-database/parks', label: '产业园区' },
    ],
  },
];

const USER_ITEMS: NavGroup[] = [
  {
    label: '用户管理',
    icon: Users,
    children: [
      { href: '/dashboard/users', label: '个人用户' },
    ],
  },
];

const SYSTEM_ITEMS: NavGroup[] = [
  {
    label: '系统管理',
    icon: Settings2,
    children: [
      { href: '/dashboard/system/access-control', label: '用户与权限' },
      { href: '/dashboard/system/approvals', label: '审批流程' },
    ],
  },
];

export function AppSidebar({ userRole, permissions = [] }: { userRole: string; permissions?: string[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { open } = useSidebar();
  const canViewContent = ['ADMIN', 'CONTENT_OPERATOR'].includes(userRole)
    || permissions.some((code) => code.startsWith('content.'));
  const canViewIndustry = userRole === 'ADMIN'
    || permissions.some((code) => code.startsWith('industry.database.'));
  const canViewMonitor = userRole === 'ADMIN' || permissions.some((code) => code.startsWith('monitor.'));
  const can = (permission: string) => userRole === 'ADMIN' || permissions.includes(permission);
  const permissionForHref = (href: string) => {
    if (href.startsWith('/dashboard/contracts')) return 'contract.view';
    if (href.startsWith('/dashboard/orders') || href.startsWith('/dashboard/dispatch-notices')) return 'execution.view';
    if (href.startsWith('/dashboard/logistics-contracts')) return 'logistics.contract.view';
    if (href.startsWith('/dashboard/logistics-settlements')) return 'logistics.settlement.view';
    if (href.startsWith('/dashboard/dispatch') || href.startsWith('/dashboard/waybills')) return 'logistics.view';
    if (href.startsWith('/dashboard/weighbridge') || href.startsWith('/dashboard/quality')) return 'quality.view';
    if (href.startsWith('/dashboard/inventory') || href.startsWith('/dashboard/inbound') || href.startsWith('/dashboard/outbound')) return 'inventory.view';
    if (href.startsWith('/dashboard/production')) return 'production.view';
    if (href.startsWith('/dashboard/settlement') || href.startsWith('/dashboard/receivables') || href.startsWith('/dashboard/receipts') || href.startsWith('/dashboard/payables') || href.startsWith('/dashboard/payable-settlements') || href.startsWith('/dashboard/payment-requests') || href.startsWith('/dashboard/payments')) return 'settlement.view';
    if (href.startsWith('/dashboard/industry-database')) return 'industry.database.view';
    if (href.startsWith('/dashboard/master-data') || href.startsWith('/dashboard/org')) return 'organization.view';
    return '';
  };
  const visibleGroups = (groups: NavGroup[]) => groups
    .map((group) => ({ ...group, children: group.children.filter((item) => {
      const required = permissionForHref(item.href);
      return !required || can(required);
    }) }))
    .filter((group) => group.children.length > 0);
  const businessGroups = visibleGroups(NAV_ITEMS);
  const baseGroups = visibleGroups(BASE_ITEMS);

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    const [base, qs] = href.split('?');

    // 产业概览是产业数据库的索引页，只在自身路由高亮。
    // 否则它会因为是所有产业子页面的路径前缀，与当前子菜单同时高亮。
    if (base === '/dashboard/industry-database' && !qs) {
      return pathname === base;
    }

    // 检测报告有独立二级入口，避免报告页面同时高亮“质检管理”。
    if (base === '/dashboard/quality' && !qs && pathname.startsWith('/dashboard/quality/reports')) {
      return false;
    }

    // 收款单仍归属应收管理；应付各功能均有自己的二级入口。
    if (base === '/dashboard/receivables' && pathname === '/dashboard/receipts') return true;

    // 必须先确认当前路径属于该菜单；否则相同长度的其他路径可能被生产管理的特殊规则误判。
    if (pathname !== base && !pathname.startsWith(base + '/')) return false;

    // 结算单有独立二级入口；新建页即使带有合同等参数，也归属于该菜单。
    if (PAYABLE_NAV_ITEMS.some(item => item.href === base)) return true;

    if (base === '/dashboard/production' && !qs) {
      const child = pathname.slice(`${base}/`.length);
      return pathname === base || child === 'new' || (!!child && !child.includes('/') && !['recipes', 'ledger'].includes(child));
    }

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
        {businessGroups.map((group) => (
          <SidebarGroupItem
            key={group.label}
            icon={group.icon}
            label={group.label}
            items={group.children}
            isActive={isActive}
          />
        ))}

        {/* 影像监控是独立业务入口，位于资金结算之后；配置能力仍由 monitor.* 权限控制。 */}
        {canViewMonitor && (
          <SidebarIconItem
            icon={Video}
            label="影像监控"
            isActive={pathname === '/dashboard/monitor'}
            href="/dashboard/monitor"
          />
        )}

        {(canViewContent || canViewIndustry) && (
          <>
            {/* 运营类模块与交易业务、基础管理分别成组，保持一级导航简洁。 */}
            <div className="px-3 py-2">
              <div className="h-px bg-border" />
            </div>

            {canViewContent && CONTENT_ITEMS.map((group) => (
              <SidebarGroupItem
                key={group.label}
                icon={group.icon}
                label={group.label}
                items={group.children}
                isActive={isActive}
              />
            ))}

            {canViewIndustry && INDUSTRY_ITEMS.map((group) => (
              <SidebarGroupItem
                key={group.label}
                icon={group.icon}
                label={group.label}
                items={group.children}
                isActive={isActive}
              />
            ))}
          </>
        )}

        {userRole === 'ADMIN' && USER_ITEMS.map((group) => (
          <SidebarGroupItem
            key={group.label}
            icon={group.icon}
            label={group.label}
            items={group.children}
            isActive={isActive}
          />
        ))}

        {baseGroups.length > 0 && (
          <>
            <div className="px-3 py-2"><div className="h-px bg-border" /></div>
            <SidebarSectionLabel>基础管理</SidebarSectionLabel>
            {baseGroups.map((group) => (
              <SidebarGroupItem
                key={group.label}
                icon={group.icon}
                label={group.label}
                items={group.children}
                isActive={isActive}
              />
            ))}
          </>
        )}

        {userRole === 'ADMIN' && SYSTEM_ITEMS.map((group) => (
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
