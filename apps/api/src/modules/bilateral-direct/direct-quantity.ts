import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** 交付只计算一次，再将相同结果写入两向单据；不使用计划数量或磅单结算重量。 */
export function directQuantity(net: Prisma.Decimal.Value, basis: string, indicators: Array<{ code: string; name: string; unit: string; measuredValue: Prisma.Decimal.Value | null }>) {
  const quantity = new Prisma.Decimal(net).toDecimalPlaces(3);
  if (!quantity.isFinite() || quantity.lte(0)) throw new BadRequestException('交付磅单净重必须大于零');
  if (!['PHYSICAL', 'DRY_MATTER'].includes(basis)) throw new BadRequestException('请确认物料计价数量口径');
  if (basis === 'PHYSICAL') return { quantity, pricingQuantity: quantity, measuredMoisturePct: null };
  const water = indicators.filter(i => /^(MOISTURE|WATER|H2O|水分)$/i.test(i.code.trim()) || i.name.includes('水分'));
  if (water.length !== 1 || water[0].measuredValue == null || !['%', '％'].includes(water[0].unit.trim())) {
    throw new BadRequestException('按实测水分折干，请在采用报告中填写唯一的水分实测值（%）');
  }
  const moisture = new Prisma.Decimal(water[0].measuredValue);
  if (!moisture.isFinite() || moisture.lt(0) || moisture.gte(100)) throw new BadRequestException('水分实测值须大于等于0且小于100');
  const pricingQuantity = quantity.mul(new Prisma.Decimal(1).minus(moisture.div(100))).toDecimalPlaces(3);
  if (pricingQuantity.lte(0)) throw new BadRequestException('折干后的交付数量必须大于零');
  return { quantity, pricingQuantity, measuredMoisturePct: moisture.toNumber() };
}
