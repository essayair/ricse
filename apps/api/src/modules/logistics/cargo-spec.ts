import { BadRequestException } from '@nestjs/common';
import { applicableGradeSpecs, CARGO_SPECS, type CargoSpec } from '@ricse/shared-types/grade-price-spec';

/** 同一车只允许一种规格；多行或双边直拨必须同时落在各适用条款范围内。 */
export function cargoSpecOptions(rules: unknown[]): CargoSpec[] {
  const gradeRules = rules.filter((r: any) => r?.method === 'CAF2_GRADE_TIER');
  if (!gradeRules.length) return [];
  return CARGO_SPECS.filter(spec => gradeRules.every((rule: any) => applicableGradeSpecs(rule).includes(spec)));
}
export function assertCargoSpec(spec: unknown, options: CargoSpec[]) {
  if (spec == null) return;
  if (!CARGO_SPECS.includes(spec as CargoSpec) || !options.includes(spec as CargoSpec)) throw new BadRequestException('本车货物规格不在合同适用范围内，请核对合同及所选物料；一车只能选择一种规格');
}
export function noticeLineCargoSpecs(line: any, notice: any): CargoSpec[] {
  const contractLineItemId = line.dispatchNoticeLineItem?.orderLineItem?.contractLineItemId || line.orderLineItem?.contractLineItemId;
  const item = notice?.order?.contract?.lineItems?.find((row: any) => row.id === contractLineItemId);
  if (!item || notice.order?.contract?.pricingType !== 'GRADE_TIER') return [];
  return cargoSpecOptions(notice.directSalesExecution ? [item.priceRulesSnapshot, item.salesPriceRulesSnapshot] : [notice.type === 'SALES' && notice.order.contract.type === 'BILATERAL' ? item.salesPriceRulesSnapshot : item.priceRulesSnapshot]);
}

/** 定价快照仅供服务端求选项，不随物流接口额外泄露给只有物流权限的账号。 */
export function publicCargoNotice<T extends { order?: any; lineItems?: any[] }>(notice: T): T {
  if (!notice.order?.contract) return notice;
  const { lineItems: _rules, ...contract } = notice.order.contract;
  return { ...notice, order: { ...notice.order, contract }, lineItems: notice.lineItems?.map(({ orderLineItem: _orderLine, ...line }) => line) };
}
export function publicCargoWaybill<T extends { dispatchNotice?: any; lineItems?: any[] }>(waybill: T): T & { cargoSpecOptions: CargoSpec[] } {
  const options = (waybill.lineItems || []).map(line => noticeLineCargoSpecs(line, waybill.dispatchNotice));
  return { ...waybill,
    dispatchNotice: waybill.dispatchNotice ? publicCargoNotice(waybill.dispatchNotice) : waybill.dispatchNotice,
    lineItems: waybill.lineItems?.map(({ dispatchNoticeLineItem: _noticeLine, ...line }) => line),
    cargoSpecOptions: CARGO_SPECS.filter(spec => options.length > 0 && options.every(values => values.includes(spec))),
  };
}
