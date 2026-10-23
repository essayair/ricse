import type { LogisticsTicket } from './logistics-shared';
import { num } from './logistics-shared';

export function FreightWeightOption({ ticket, stage, waybillNo, group, checked, lower, disabled, onSelect }: {
  ticket?: LogisticsTicket; stage: 'SHIPPING' | 'RECEIVING'; waybillNo: string; group: string;
  checked: boolean; lower: boolean; disabled: boolean; onSelect: (ticketId: string) => void;
}) {
  const label = stage === 'SHIPPING' ? '发货' : '收货';
  if (!ticket) return <span className="text-xs text-muted-foreground">暂无有效磅单</span>;
  return <label className={`flex items-start gap-2 ${disabled ? 'cursor-default' : 'cursor-pointer'}`} title={`${ticket.ticketNo} · ${label}净重 ${ticket.netWeight} 吨${lower ? '（两端较低）' : ''}`}>
    <input type="radio" className="mt-1 h-4 w-4 shrink-0 accent-primary" name={group} aria-label={`${waybillNo}选用${label}净重`} checked={checked} disabled={disabled} onChange={() => onSelect(ticket.id)} />
    <span className="min-w-0"><span className={`block whitespace-nowrap tabular-nums ${lower ? 'font-medium text-primary' : ''}`}>{num(ticket.netWeight)}{lower && <span className="ml-1 text-xs">较低</span>}</span><span className="mt-1 block max-w-36 truncate font-mono text-[11px] text-muted-foreground">{ticket.ticketNo}</span></span>
  </label>;
}
