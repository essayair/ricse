'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/app-sidebar';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Bell, Settings, LogOut, ChevronRight } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

function useAuthGuard() {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (!stored) {
      router.push('/login');
      return;
    }
    setUser(JSON.parse(stored));
  }, [router]);

  return user;
}

function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  const labels: Record<string, string> = {
    dashboard: '系统总览',
    contracts: '合同管理',
    orders: '合同执行批次管理',
    'dispatch-notices': '执行通知管理',
    settlement: '应收管理',
    payables: '应付管理',
    dispatch: '调度看板',
    waybills: '运单管理',
    'logistics-reconciliation': '物流对账',
    inventory: '在库总览',
    inbound: '入库单管理',
    outbound: '出库单管理',
    'inventory-reversals': '库存冲销',
    weighbridge: '磅单管理',
    quality: '质检单管理',
    monitor: '监控录像',
    'master-data': '主数据管理',
    org: '组织数据',
    system: '系统管理',
    approvals: '审批流程',
    create: '新建',
    edit: '编辑',
  };

  const crumbs = segments.slice(1).map((seg, index) => {
    const previous = segments[index];
    const isDynamicId = !labels[seg];
    const label = isDynamicId && previous === 'contracts'
      ? '合同详情'
      : isDynamicId && previous === 'orders'
        ? '执行批次详情'
        : isDynamicId && previous === 'dispatch-notices'
          ? '执行通知详情'
          : isDynamicId && previous === 'waybills'
            ? '物流运单详情'
          : isDynamicId && previous === 'weighbridge'
            ? '磅单详情'
          : isDynamicId && previous === 'inbound'
            ? '物流入库单详情'
          : isDynamicId && previous === 'outbound'
            ? '物流出库单详情'
          : isDynamicId && previous === 'inventory-reversals'
            ? '库存冲销单详情'
        : labels[seg] || seg;
    return { label, href: `/${segments.slice(0, index + 2).join('/')}` };
  });

  return (
    <div className="flex items-center gap-1 text-sm text-muted-foreground">
      <Link href="/dashboard" className="hover:text-foreground">首页</Link>
      {crumbs.map((crumb, i) => (
        <span key={crumb.href} className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3" />
          {i === crumbs.length - 1 ? (
            <span className="text-foreground font-medium">{crumb.label}</span>
          ) : (
            <Link href={crumb.href} className="hover:text-foreground">{crumb.label}</Link>
          )}
        </span>
      ))}
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = useAuthGuard();
  const router = useRouter();

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/login');
  };

  if (!user) return null;

  return (
    <SidebarProvider>
      <AppSidebar userRole={user.role} />
      <SidebarInset>
        <header className="flex h-14 items-center gap-4 border-b bg-background px-6">
          <SidebarTrigger />
          <div className="flex-1">
            <Breadcrumbs />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon">
              <Bell className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon">
              <Settings className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 px-2">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                      {user.name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm">{user.name}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="h-4 w-4 mr-2" />
                  退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
