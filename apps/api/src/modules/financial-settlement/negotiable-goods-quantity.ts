import { Prisma } from '@prisma/client';
import { readMeasuredPct } from '../contract/grade-price-rules';

type Ticket = { weighingStage: string; netWeight: Prisma.Decimal.Value | null };
type Report = { evidenceStage?: string | null; status: string; deletedAt?: Date | null; indicators?: Parameters<typeof readMeasuredPct>[0] };

/** 协商上限综合双方事实；折干时各侧使用本侧报告，不能将当前报告水分套到另一侧。 */
export function negotiableGoodsQuantity(
  baseQuantity: number,
  quantityBasis: string,
  effectiveByStage: ReadonlyMap<string, Ticket>,
  reports: Iterable<Report>,
  selectedMoisturePct: number | null,
): number {
  // 保留既有边界：仅一侧有效计量，不能借协商入口扩大数量。
  if (!effectiveByStage.has('SHIPPING') || !effectiveByStage.has('RECEIVING')) return baseQuantity;
  const confirmed = [...reports].filter(report => report.status === 'CONFIRMED' && !report.deletedAt);
  const validMoisture = (value: number | null): value is number => value != null && Number.isFinite(value) && value >= 0 && value <= 100;
  const candidates = [baseQuantity];
  for (const [stage, ticket] of effectiveByStage) {
    if (ticket.netWeight == null) continue;
    const net = new Prisma.Decimal(ticket.netWeight);
    if (!net.isFinite() || net.lte(0)) continue;
    if (quantityBasis !== 'DRY_MATTER') { candidates.push(net.toDecimalPlaces(3).toNumber()); continue; }
    const moistureValues = confirmed.filter(report => report.evidenceStage === stage)
      .map(report => readMeasuredPct(report.indicators || [], 'MOISTURE')).filter(validMoisture);
    // 历史报告未分类或本侧未单独化验时，沿用已选报告，不凭空推定水分为0。
    if (!moistureValues.length && validMoisture(selectedMoisturePct)) moistureValues.push(selectedMoisturePct);
    for (const moisture of moistureValues) {
      candidates.push(net.mul(new Prisma.Decimal(1).minus(new Prisma.Decimal(moisture).div(100))).toDecimalPlaces(3).toNumber());
    }
  }
  return Math.max(...candidates);
}
