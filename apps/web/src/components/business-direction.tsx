import { cn } from '@/lib/utils';

export type BusinessDirection = 'PURCHASE' | 'SALES' | 'BILATERAL' | string;

export const BUSINESS_DIRECTION_STYLES = {
  PURCHASE: {
    label: '采购',
    badge: 'border-business-purchase-border bg-business-purchase-bg text-business-purchase',
    active: 'border-business-purchase bg-business-purchase text-white',
    hover: 'hover:bg-business-purchase-bg',
    text: 'text-business-purchase',
  },
  SALES: {
    label: '销售',
    badge: 'border-business-sales-border bg-business-sales-bg text-business-sales',
    active: 'border-business-sales bg-business-sales text-white',
    hover: 'hover:bg-business-sales-bg',
    text: 'text-business-sales',
  },
  BILATERAL: {
    label: '双边',
    badge: 'border-business-bilateral-border bg-business-bilateral-bg text-business-bilateral',
    active: 'border-business-bilateral bg-business-bilateral text-white',
    hover: 'hover:bg-business-bilateral-bg',
    text: 'text-business-bilateral',
  },
} as const;

export function businessDirectionStyle(type: BusinessDirection) {
  return BUSINESS_DIRECTION_STYLES[type as keyof typeof BUSINESS_DIRECTION_STYLES]
    || { label: type || '未知', badge: 'border-border bg-muted text-muted-foreground', active: 'border-primary bg-primary text-primary-foreground', hover: 'hover:bg-muted/50', text: 'text-muted-foreground' };
}

export function BusinessDirectionBadge({ type, suffix = '', className }: {
  type: BusinessDirection;
  suffix?: string;
  className?: string;
}) {
  const style = businessDirectionStyle(type);
  return <span className={cn('inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[11px] font-medium', style.badge, className)}>{style.label}{suffix}</span>;
}

export function businessDirectionFilterClass(type: BusinessDirection, active: boolean) {
  const style = businessDirectionStyle(type);
  return active ? style.active : cn(style.badge, style.hover);
}

export function waybillStatusLabel(status: string, type: BusinessDirection, assigned = true) {
  if (status === 'PENDING') return assigned ? '待发运' : '待调度';
  if (status === 'IN_TRANSIT') return '在途';
  if (status === 'ARRIVED') return type === 'SALES' ? '已送达待客户签收' : '已到达待收货';
  if (status === 'SIGNED') return type === 'SALES' ? '客户已签收' : '已收货';
  if (status === 'CANCELLED') return '已取消';
  return status;
}

export function waybillTransitionLabel(nextStatus: string, type: BusinessDirection) {
  if (nextStatus === 'IN_TRANSIT') return '确认发运';
  if (nextStatus === 'ARRIVED') return type === 'SALES' ? '确认送达' : '确认到达';
  if (nextStatus === 'SIGNED') return type === 'SALES' ? '确认客户签收' : '确认收货';
  if (nextStatus === 'CANCELLED') return '取消运单';
  return nextStatus;
}
