type PaymentContractOption = { id: string; businessType: string; remainingPaymentAmount?: number | string | null };

/** 只收口新采购货款候选；历史单据、客户退款及独立履约保证金不受货款已付清影响。 */
export function paymentContractSelectable(contract: PaymentContractOption, businessType: string, paymentStage: string, savedContractId?: string) {
  if (contract.businessType !== businessType) return false;
  if (contract.id === savedContractId || businessType !== 'PURCHASE' || paymentStage === 'GUARANTEE') return true;
  return contract.remainingPaymentAmount != null && Number.isFinite(Number(contract.remainingPaymentAmount)) && Number(contract.remainingPaymentAmount) > 0;
}
