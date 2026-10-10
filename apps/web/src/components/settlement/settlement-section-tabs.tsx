'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const SECTIONS = {
  receivable: {
    label: '应收管理',
    items: [
      { href: '/dashboard/receivables', label: '应收款计划' },
      { href: '/dashboard/receipts', label: '收款单' },
    ],
  },
  payable: {
    label: '应付管理',
    items: [
      { href: '/dashboard/payment-requests', label: '付款申请单' },
      { href: '/dashboard/payments', label: '付款单' },
    ],
  },
} as const;

export function SettlementSectionTabs({ section }: { section: keyof typeof SECTIONS }) {
  const pathname = usePathname();
  const current = SECTIONS[section];

  return (
    <div className="flex flex-col items-start gap-2 border-b">
      <div className="text-sm font-semibold text-foreground">{current.label}</div>
      <nav
        aria-label={`${current.label}功能切换`}
        className="inline-flex self-start gap-6"
      >
        {current.items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'relative border-b-2 px-1 pb-2.5 pt-1 text-sm font-medium transition-colors',
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
