'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PanelLeft, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const SIDEBAR_COOKIE = 'sidebar:state';

/* ── Context ─────────────────────────────── */

type SidebarContextValue = {
  state: 'expanded' | 'collapsed';
  open: boolean;
  setOpen: (v: boolean) => void;
  toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

function useSidebar() {
  const ctx = React.useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar must be used within SidebarProvider');
  return ctx;
}

/* ── Layout components ───────────────────── */

export function SidebarProvider({
  children,
  defaultOpen = true,
}: {
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(() => {
    if (typeof document !== 'undefined') {
      const stored = document.cookie.match(
        new RegExp(`(^| )${SIDEBAR_COOKIE}=([^;]+)`),
      );
      return stored ? stored[2] === 'true' : defaultOpen;
    }
    return defaultOpen;
  });

  const persistOpen = (v: boolean) => {
    setOpen(v);
    document.cookie = `${SIDEBAR_COOKIE}=${v};path=/;max-age=${7 * 24 * 60 * 60}`;
  };

  return (
    <SidebarContext.Provider
      value={{
        state: open ? 'expanded' : 'collapsed',
        open,
        setOpen: persistOpen,
        toggleSidebar: () => persistOpen(!open),
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

/** Fixed sidebar panel — collapses to icon‑only (64px) or expands to 256px */
export function Sidebar({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const { open } = useSidebar();
  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 flex h-screen flex-col border-r bg-sidebar transition-all duration-200',
        open ? 'w-64' : 'w-16',
        className,
      )}
    >
      {children}
    </aside>
  );
}

/** Header slot inside the sidebar — border‑bottom separator */
export function SidebarHeader({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex h-14 items-center border-b px-3', className)}>
      {children}
    </div>
  );
}

/** Scrollable content area with bottom padding so last items don't stick to edge */
export function SidebarContent({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex-1 overflow-y-auto px-2 py-2 pb-8', className)}>
      {children}
    </div>
  );
}

export function SidebarGroup({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn(className)}>{children}</div>;
}

/** Optional section header (e.g. "基础管理") — hidden in collapsed mode */
export function SidebarSectionLabel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const { open } = useSidebar();
  if (!open) return null;
  return (
    <div
      className={cn(
        'px-2 py-2 text-[11px] font-bold uppercase tracking-wider text-sidebar-foreground/50',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SidebarGroupContent({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn(className)}>{children}</div>;
}

export function SidebarMenu({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <nav className={cn('flex flex-col gap-0.5', className)}>{children}</nav>;
}

export function SidebarMenuItem({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn(className)}>{children}</div>;
}

/** Reusable link‑style button for sidebar items */
export const SidebarMenuButton = React.forwardRef<
  HTMLAnchorElement,
  {
    asChild?: boolean;
    isActive?: boolean;
    className?: string;
    children: React.ReactNode;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>
>(({ asChild = false, isActive, className, children, ...props }, ref) => {
  const Comp = asChild ? Slot : 'a';
  return (
    <Comp
      ref={ref as any}
      className={cn(
        'flex items-center gap-3 px-3 py-2 text-sm transition-colors',
        // Active item: blue left border + highlight background (matches prototype)
        isActive
          ? 'border-l-[3px] border-primary bg-sidebar-accent text-[#93c5fd] font-medium'
          : 'text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground border-l-[3px] border-transparent',
        className,
      )}
      {...props}
    >
      {children}
    </Comp>
  );
});
SidebarMenuButton.displayName = 'SidebarMenuButton';

/* ── Single‑item icon button ─────────────── */

/**
 * Standalone top-level nav item — icon + label visually matches SidebarGroupItem heading.
 *
 * Expanded  → renders like accordion headings (same icon size, padding, font, color).
 * Collapsed → icon-only with tooltip.
 */
export function SidebarIconItem({
  icon: Icon,
  label,
  isActive,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  isActive?: boolean;
  href: string;
}) {
  const { open } = useSidebar();

  const linkContent = (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 rounded-md text-sm font-semibold transition-colors px-2.5 py-2 border-l-[3px]',
        // Match SidebarGroupItem heading sizing (always has transparent border to prevent icon shift)
        isActive
          ? 'border-primary bg-sidebar-accent text-[#93c5fd]'
          : 'border-transparent text-[#cbd5e1] hover:text-sidebar-accent-foreground',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {open && <span className="flex-1 text-left">{label}</span>}
    </Link>
  );

  if (open) return linkContent;

  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <Link
          href={href}
          className="flex items-center justify-center px-0 py-[10px] rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
        >
          <Icon className="h-5 w-5 shrink-0" />
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right" className="ml-2">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

/* ── Accordion group item ────────────────── */

interface NavItem {
  href: string;
  label: string;
}

/**
 * Accordion heading with collapsible children list.
 *
 * Expanded  → click heading to toggle children open/close, <ChevronDown> rotates.
 * Collapsed → click icon opens a dropdown menu instead (tooltip not needed).
 *
 * Auto‑expand: when the user navigates to one of this group's children
 * (e.g. visiting /dashboard/contracts while 采销管理 is the group),
 * the group opens automatically.
 */
export function SidebarGroupItem({
  icon: Icon,
  label,
  items,
  isActive,
  defaultOpen = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  items: NavItem[];
  isActive: (href: string) => boolean;
  defaultOpen?: boolean;
}) {
  const { open } = useSidebar();
  const hasActiveChild = items.some((item) => isActive(item.href));
  const [expanded, setExpanded] = React.useState(defaultOpen || hasActiveChild);

  // 路由切换时自动展开当前模块，但保留用户已经手动展开的其他模块。
  // 菜单是否收起只由用户点击决定，避免点击子菜单后其他菜单被意外关闭。
  React.useEffect(() => {
    if (defaultOpen || hasActiveChild) setExpanded(true);
  }, [defaultOpen, hasActiveChild]);

  const handleToggle = () => setExpanded((v) => !v);

  // — Collapsed mode: dropdown triggered by icon —
  if (!open) {
    return (
      <SidebarGroup>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'w-full flex items-center justify-center px-0 py-[10px] rounded-md transition-colors',
                'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" className="ml-2 min-w-[160px]">
            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
              {label}
            </div>
            {items.map((item) => (
              <DropdownMenuItem key={item.href} asChild>
                <Link
                  href={item.href}
                  className={isActive(item.href) ? 'font-medium' : ''}
                >
                  {item.label}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarGroup>
    );
  }

  // — Expanded mode: accordion header + children —
  return (
    <SidebarGroup>
      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          'w-full flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-semibold transition-colors border-l-[3px]',
          // Level‑1 heading: lighter text (matches prototype #cbd5e1), no background on hover
          'border-transparent text-[#cbd5e1] hover:text-sidebar-accent-foreground',
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">{label}</span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 transition-transform',
            !expanded && '-rotate-90',
          )}
        />
      </button>
      {expanded && (
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                isActive={isActive(item.href)}
                // Align text with the parent label (icon width 16px + gap 12px + border 3px ≈ 31px → 38px)
                className="pl-[38px]"
              >
                <Link href={item.href}>{item.label}</Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      )}
    </SidebarGroup>
  );
}

/* ── Utility ─────────────────────────────── */

export function SidebarRail() {
  return null;
}

/** Offsets the main content area to account for the sidebar width */
export function SidebarInset({
  children,
}: {
  children: React.ReactNode;
}) {
  const { open } = useSidebar();
  return (
    <div
      className={cn(
        'flex min-h-screen flex-col transition-all duration-200',
        open ? 'ml-64' : 'ml-16',
      )}
    >
      {children}
    </div>
  );
}

/** Button that toggles sidebar open/close */
export function SidebarTrigger({
  className,
}: {
  className?: string;
}) {
  const { toggleSidebar } = useSidebar();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleSidebar}
      className={cn('h-8 w-8', className)}
    >
      <PanelLeft className="h-4 w-4" />
    </Button>
  );
}

export { useSidebar };
