import { reserveBusinessNumber } from './business-number';

describe('业务日期流水编号', () => {
  it.each([
    ['ORDER', 'PURCHASE', 'CGDD202611120013'], ['ORDER', 'SALES', 'XSDD202611120013'],
    ['NOTICE', 'PURCHASE', 'PI-20261112-0013'], ['NOTICE', 'SALES', 'SD-20261112-0013'],
    ['DIRECT', 'PURCHASE', 'ZBCG-20261112-0013'], ['DIRECT', 'SALES', 'ZBXS-20261112-0013'],
    ['WAYBILL', 'PURCHASE', 'WB-20261112-0013'],
  ] as const)('%s/%s 使用北京日期和已有最大流水，而不是总条数', async (kind, direction, expected) => {
    const db: any = { $queryRaw: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ value: '12' }]) };
    expect(await reserveBusinessNumber(db, kind, direction, new Date('2026-11-11T16:30:00Z'))).toBe(expected);
    expect(db.$queryRaw).toHaveBeenCalledTimes(2);
    expect(db.$queryRaw.mock.calls[0][1]).toContain('RICSE_NUMBER:');
  });
  it('流水超过9999自然扩位，不回绕或截断', async () => {
    const db: any = { $queryRaw: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ value: '9999' }]) };
    expect(await reserveBusinessNumber(db, 'DIRECT', 'SALES', new Date('2026-11-12T01:00:00Z'))).toBe('ZBXS-20261112-10000');
  });
});
