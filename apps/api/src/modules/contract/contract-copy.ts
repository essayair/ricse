const FORM_FIELDS = [
  'type', 'title', 'signingPartnerId', 'sellerId', 'buyerId', 'businessUnitId', 'contactPerson', 'contactPhone',
  'pricingType', 'overfillPct', 'shortfallPct', 'deliveryMethod', 'deliveryLocation', 'settlementMethod', 'settlementBasis',
  'prepayPct', 'paymentDays', 'paymentMethod', 'salesPaymentMethod', 'moistureRule', 'impurityRule', 'remarks',
] as const;
const LINE_FIELDS = [
  'materialId', 'materialName', 'quantity', 'unit', 'unitPrice', 'unitPriceExTax', 'taxRatePct',
  'salesUnitPrice', 'salesUnitPriceExTax', 'remarks',
] as const;
const clone = (value: unknown) => value == null ? null : JSON.parse(JSON.stringify(value));
const object = (value: any) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const pickScalar = (source: any, fields: readonly string[]) => Object.fromEntries(fields.flatMap(key => {
  const value = source[key];
  return value == null ? [] : typeof value === 'object' && typeof value.toFixed !== 'function' ? [] : [[key, typeof value === 'object' ? String(value) : value]];
}));

/** 仅复制可编辑的合同内容，绝不将业务关系、附件或操作状态带回创建接口。 */
export function buildContractCopyTemplate(source: any, defaults: { departmentId?: string | null; businessUnitId?: string | null; allowedBusinessUnitIds: string[] }) {
  const rawDraft = ['DRAFT', 'REJECTED'].includes(source.status) ? object(source.draftData) : {};
  const form = { ...pickScalar(source, FORM_FIELDS), ...pickScalar(object(rawDraft.form), FORM_FIELDS) };
  form.title = `${form.title || '未命名合同'}（副本）`;
  form.departmentId = defaults.departmentId || '';
  form.businessUnitId = defaults.allowedBusinessUnitIds.includes(String(form.businessUnitId || '')) ? form.businessUnitId : defaults.businessUnitId || '';
  for (const key of ['externalNo', 'salesExternalNo', 'signedAt', 'salesSignedAt', 'effectiveAt', 'expireAt']) form[key] = '';
  const rawLines = Array.isArray(rawDraft.lineItems) ? rawDraft.lineItems : source.lineItems || [];
  const lineItems: Array<Record<string, any>> = rawLines.filter((line: any) => line && typeof line === 'object').map((line: any) => {
    const result: Record<string, any> = pickScalar(line, LINE_FIELDS);
    result.qualityRulesSnapshot = clone(line.qualityRulesSnapshot);
    for (const field of ['priceRulesSnapshot', 'salesPriceRulesSnapshot']) {
      result[field] = line[field] ? { ...clone(line[field]), formulaConfirmed: false } : null;
    }
    return result;
  });
  return {
    ...form, status: 'DRAFT', lineItems, draftData: { form, lineItems }, attachments: [],
    copySource: { id: source.id, contractNo: source.contractNo }, warnings: [] as string[],
  };
}
