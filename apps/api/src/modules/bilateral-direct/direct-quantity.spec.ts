import { Prisma } from '@prisma/client';
import { directQuantity } from './direct-quantity';

describe('直拨共同交付数量', () => {
  const water = (value: string | null) => [{ code: 'MOISTURE', name: '水分', unit: '%', measuredValue: value }];
  it('实物计价不强制水分，主辅数量相同', () => {
    const q = directQuantity('120', 'PHYSICAL', []);
    expect(q.quantity.toString()).toBe('120'); expect(q.pricingQuantity.eq(q.quantity)).toBe(true);
  });
  it('按净重折干，不用计划或毛重', () => {
    const q = directQuantity('50', 'DRY_MATTER', water('3.2'));
    expect(q.pricingQuantity.toString()).toBe('48.4');
  });
  it('零水分合法，不能误判成缺失', () => expect(directQuantity('20', 'DRY_MATTER', water('0')).pricingQuantity.toString()).toBe('20'));
  it.each(['-1', '100', '101'])('非法水分 %s 不计算', value => expect(() => directQuantity('20', 'DRY_MATTER', water(value))).toThrow('水分实测值'));
  it('缺水分和重复水分不得取零或任意一项', () => {
    expect(() => directQuantity('20', 'DRY_MATTER', [])).toThrow('唯一的水分');
    expect(() => directQuantity('20', 'DRY_MATTER', [...water('5'), ...water('6')])).toThrow('唯一的水分');
  });
  it('负数、零净重及未知数量口径不能通过', () => {
    expect(() => directQuantity('0', 'PHYSICAL', [])).toThrow();
    expect(() => directQuantity('-2', 'PHYSICAL', [])).toThrow();
    expect(() => directQuantity('20', '', [])).toThrow('数量口径');
  });
  it('使用十进制运算并统一保留三位数量', () => expect(directQuantity(new Prisma.Decimal('87.58'), 'DRY_MATTER', water('8.7')).pricingQuantity.toString()).toBe('79.961'));
});
