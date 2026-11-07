'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { PAYABLE_NAV_ITEMS, RECEIVABLE_NAV_ITEMS } from '@/lib/settlement-navigation';

const SECTIONS = {
  receivable: { label: '应收管理', items: RECEIVABLE_NAV_ITEMS },
  payable: { label: '应付管理', items: PAYABLE_NAV_ITEMS },
} as const;

export function SettlementSectionTabs({ section, showPageTitle = false }: { section: keyof typeof SECTIONS; showPageTitle?: boolean }) {
  const pathname = usePathname();
  const current = SECTIONS[section];
  const activeRef = useRef<HTMLAnchorElement | null>(null);
  useEffect(() => { activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [pathname]);

  return (
    <div className="flex min-w-0 flex-col items-stretch gap-3 border-b sm:gap-4">
      {showPageTitle ? <h1 className="text-xl font-bold sm:text-2xl">{current.label}</h1> : <div className="text-sm font-semibold text-foreground">{current.label}</div>}
      <nav
        aria-label={`${current.label}功能切换`}
        className="-mb-px flex gap-5 overflow-x-auto [scrollbar-width:none] sm:gap-6 [&::-webkit-scrollbar]:hidden"
      >
        {current.items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              ref={active ? activeRef : undefined}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative shrink-0 whitespace-nowrap border-b-2 px-1 pb-2.5 pt-1 text-sm font-medium transition-colors',
                active
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
