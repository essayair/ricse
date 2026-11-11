import { directEvidenceSnapshot } from './direct-evidence-snapshot';

describe('直拨双侧证据快照', () => {
  const ticket = (id: string, stage: string, weight: number) => ({ id, ticketNo: id, weighingStage: stage, netWeight: weight, weightSelections: [] as Array<{ purpose: string; weighTicketId: string }> });
  const report = (id: string, stage: string, moisture: number) => ({ id, inspectionNo: id, evidenceStage: stage, status: 'CONFIRMED', indicators: [{ code: 'MOISTURE', name: '水分', measuredValue: moisture, unit: '%' }, { code: 'CAF2', name: 'CaF₂', measuredValue: 32.5, unit: '%' }] });
  it('两侧各自保存磅单及所有有效报告，差异按收货减发货', () => {
    const result = directEvidenceSnapshot([ticket('S', 'SHIPPING', 20), ticket('R', 'RECEIVING', 19.8)], [report('QS', 'SHIPPING', 0), report('QR', 'RECEIVING', 5)], 'QR');
    expect(result.weightVariance).toBe('-0.2');
    expect(result.shipping.reports[0]).toMatchObject({ moisturePct: 0, gradePct: 32.5, finalAdopted: false });
    expect(result.receiving.reports[0].finalAdopted).toBe(true);
  });
  it('缺少一侧时保留空值，不编造差异或凭证', () => {
    const result = directEvidenceSnapshot([ticket('S', 'SHIPPING', 20)], [report('QS', 'SHIPPING', 3)], 'QS');
    expect(result.receiving.ticket).toBeNull(); expect(result.receiving.reports).toEqual([]); expect(result.weightVariance).toBeNull();
  });
  it('同侧多张未采信不擅自选最新或首张，采信后使用指定单据', () => {
    const tickets = [ticket('S1', 'SHIPPING', 20), ticket('S2', 'SHIPPING', 21)];
    expect(directEvidenceSnapshot(tickets, [], '').shipping).toMatchObject({ selectionRequired: true, ticket: null });
    tickets[1].weightSelections.push({ purpose: 'SHIPPING', weighTicketId: 'S2' });
    expect(directEvidenceSnapshot(tickets, [], '').shipping.ticket?.netWeight).toBe('21');
  });
  it('报告顺序不影响复核比较，后续修改源对象不改变已有快照', () => {
    const source = ticket('S', 'SHIPPING', 20), a = report('Q1', 'SHIPPING', 3), b = report('Q2', 'SHIPPING', 4);
    const result = directEvidenceSnapshot([source], [a, b], 'Q1');
    expect(result).toEqual(directEvidenceSnapshot([source], [b, a], 'Q1'));
    source.netWeight = 30; a.indicators[0].measuredValue = 8;
    expect(result.shipping.ticket?.netWeight).toBe('20'); expect(result.shipping.reports[0].moisturePct).toBe(3);
  });
  it('被作废或删除报告不进入有效双侧快照', () => {
    expect(directEvidenceSnapshot([], [{ ...report('Q', 'SHIPPING', 3), status: 'VOIDED' }], '').shipping.reports).toEqual([]);
  });
});
