import { Prisma } from '@prisma/client';

/** 日期流水与普通单据共用同一命名空间；静态表/字段白名单，不接受用户SQL。 */
export async function reserveBusinessNumber(tx: Prisma.TransactionClient, kind: 'ORDER' | 'NOTICE' | 'DIRECT' | 'WAYBILL', direction: 'PURCHASE' | 'SALES', now = new Date()) {
  const date = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }).replace(/-/g, '');
  const prefix = kind === 'WAYBILL' ? 'WB' : kind === 'ORDER' ? direction === 'PURCHASE' ? 'CGDD' : 'XSDD'
    : kind === 'NOTICE' ? direction === 'PURCHASE' ? 'PI' : 'SD' : direction === 'PURCHASE' ? 'ZBCG' : 'ZBXS';
  const base = kind === 'ORDER' ? `${prefix}${date}` : `${prefix}-${date}-`;
  const table = Prisma.raw(kind === 'WAYBILL' ? '"waybills"' : kind === 'ORDER' ? '"orders"' : kind === 'NOTICE' ? '"dispatch_notices"' : '"direct_trade_documents"');
  const field = Prisma.raw(kind === 'WAYBILL' ? '"waybillNo"' : kind === 'ORDER' ? '"orderNo"' : kind === 'NOTICE' ? '"noticeNo"' : '"documentNo"');
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`RICSE_NUMBER:${base}`}, 0))::text`;
  const pattern = `^${base}([0-9]+)$`;
  const rows = await tx.$queryRaw<Array<{ value: string }>>(Prisma.sql`SELECT COALESCE(MAX(substring(${field} from ${pattern})::bigint), 0)::text AS value FROM ${table} WHERE ${field} ~ ${pattern}`);
  const next = BigInt(rows?.[0]?.value || '0') + 1n;
  return `${base}${String(next).padStart(4, '0')}`;
}
