'use client';
import { useEffect, useState } from 'react';
import { alertAction } from '@/lib/system-dialog';

export const logisticsField = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';
export const contractStatus: Record<string, string> = { DRAFT: '草稿', ACTIVE: '生效中', EXPIRED: '已到期', TERMINATED: '已终止' };
export const settlementStatus: Record<string, string> = { DRAFT: '草稿', SUBMITTED: '已提交', REVIEWED: '已复核', VOIDED: '已作废' };
export const weightBasisLabel: Record<string, string> = { SETTLEMENT: '货款结算依据', SHIPPING: '发货磅单', RECEIVING: '收货磅单', TICKET: '指定磅单', CONFIRMED: '双方确认重量', LEGACY: '历史口径' };
export const pricingLabel: Record<string, string> = { NET_WEIGHT: '按净重（元/吨）', GROSS_WEIGHT: '按毛重（历史口径）', TRIP: '按车次（元/车次）' };
export const num = (value: unknown, digits = 3) => value == null || value === '' ? '—' : Number(value).toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const time = (value?: string | null) => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—';
export const day = (value?: string | null) => value ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value)) : '';
export interface LogisticsPartner { id: string; name: string; code?: string }
export interface LogisticsUnit { id: string; name: string }
export interface LogisticsTicket { id: string; ticketNo: string; weighingStage: string; grossWeight: string | null; tareWeight: string | null; netWeight: string | null }
export interface LogisticsRate { id: string; contractId: string; originLocation: string; destinationLocation: string; unitPrice: string; effectiveAt: string; expiresAt: string | null; contract: { title: string; contractNo: string; settlementBasis: string; defaultWeightBasis: string; signingPartnerId: string } }
export interface LogisticsCandidate { id: string; waybillNo: string; plateNo: string | null; carrierPartnerId: string | null; carrierName: string | null; carrierPending: boolean; originLocation: string | null; destinationLocation: string | null; signedAt: string | null; departedAt: string | null; payerPartner: LogisticsPartner | null; businessUnit: LogisticsUnit | null; businessType: string; materialName: string; defaultTicketId: string | null; tickets: LogisticsTicket[]; priceTerms: LogisticsRate[] }
export function LogisticsField({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-2 text-sm"><span className="font-medium">{label}</span>{children}</label>; }
export function useLogisticsError(title: string) {
  const [error, setError] = useState('');
  useEffect(() => { if (error) void alertAction(error, { title }); }, [error, title]);
  return [error, setError] as const;
}
export function useLogisticsPermission() {
  const [permissions, setPermissions] = useState<string[]>([]);
  useEffect(() => { try { const u = JSON.parse(localStorage.getItem('user') || '{}'); setPermissions(u.role === 'ADMIN' || u.roles?.includes('ADMIN') ? ['*'] : u.permissions || []); } catch { setPermissions([]); } }, []);
  return (code: string) => permissions.includes('*') || permissions.includes(code);
}
