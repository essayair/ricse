/** 未认领收款可不关联合同，不能将其视为任一合同的核销或退款候选。 */
export function fundMatchesContract(
  fund: { contract?: { id: string } | null },
  contractId?: string | null,
): boolean {
  return Boolean(contractId && fund.contract?.id === contractId);
}
