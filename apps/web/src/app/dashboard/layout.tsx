'use client';

import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
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
import { buildBreadcrumbs } from '@/lib/breadcrumbs';

function useAuthGuard() {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; role: string; permissions?: string[] } | null>(null);

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
  const searchParams = useSearchParams();
  const crumbs = buildBreadcrumbs(pathname, searchParams);

  return (
    <div className="flex min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap text-sm text-muted-foreground">
      {crumbs.map((crumb, i) => (
        <span key={`${i}-${crumb.href || crumb.label}`} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3 w-3" />}
          {i === crumbs.length - 1 ? (
            <span className="text-foreground font-medium">{crumb.label}</span>
          ) : crumb.href ? (
            <Link href={crumb.href} className="hover:text-foreground">{crumb.label}</Link>
          ) : (
            <span>{crumb.label}</span>
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
      <AppSidebar userRole={user.role} permissions={user.permissions || []} />
      <SidebarInset>
        <header className="flex h-14 items-center gap-4 border-b bg-background px-6">
          <SidebarTrigger />
          <div className="min-w-0 flex-1">
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
