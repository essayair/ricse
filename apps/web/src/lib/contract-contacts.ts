export interface ContractContacts {
  contactPerson?: string | null;
  contactPhone?: string | null;
  purchaseContactPerson?: string | null;
  purchaseContactPhone?: string | null;
  salesContactPerson?: string | null;
  salesContactPhone?: string | null;
}

/** 只更新本次选择的交易对手，不覆盖双边合同另一侧联系人。 */
export function partnerContactDefaults(type: string, field: 'sellerId' | 'buyerId', partner?: Pick<ContractContacts, 'contactPerson' | 'contactPhone'>) {
  const person = partner?.contactPerson || '';
  const phone = partner?.contactPhone || '';
  if (type !== 'BILATERAL') return { contactPerson: person, contactPhone: phone };
  return field === 'sellerId'
    ? { purchaseContactPerson: person, purchaseContactPhone: phone }
    : { salesContactPerson: person, salesContactPhone: phone };
}

/** 旧版共用字段不能可靠区分上游/下游，不自动归类。 */
export function hasLegacyBilateralContact(value: ContractContacts) {
  return !!(value.contactPerson || value.contactPhone)
    && ![value.purchaseContactPerson, value.purchaseContactPhone, value.salesContactPerson, value.salesContactPhone].some(Boolean);
}

export function contactText(person?: string | null, phone?: string | null) {
  return [person, phone].filter(Boolean).join(' / ') || '—';
}
