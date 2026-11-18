import { BadRequestException } from '@nestjs/common';

export const normalizeImageRemarks = (value?: string | null) => value?.replace(/\r\n?/g, '\n').trim() || null;

export const IMAGE_TYPES = ['CONTRACT', 'WEIGH_TICKET', 'QUALITY_REPORT', 'VEHICLE_PHOTO', 'SCENE_PHOTO', 'RECEIPT', 'WAREHOUSE_DOCUMENT', 'SETTLEMENT_DOCUMENT', 'OTHER'] as const;
export const TYPE_LABELS: Record<string, string> = { CONTRACT: '合同附件', WEIGH_TICKET: '磅单', QUALITY_REPORT: '检测报告', VEHICLE_PHOTO: '车辆照片', SCENE_PHOTO: '现场照片', RECEIPT: '签收交接凭证', WAREHOUSE_DOCUMENT: '出入库凭证', SETTLEMENT_DOCUMENT: '结算凭证', OTHER: '其他资料' };
export const TARGETS = {
  CONTRACT: { field: 'contractId', model: 'contract', table: 'contracts', label: '合同', permission: 'contract.edit', view: 'contract.view', number: 'contractNo' },
  WAYBILL: { field: 'waybillId', model: 'waybill', table: 'waybills', label: '物流运单', permission: 'logistics.manage', view: 'logistics.view', number: 'waybillNo' },
  WEIGH_TICKET: { field: 'weighTicketId', model: 'weighTicket', table: 'weigh_tickets', label: '磅单', permission: 'quality.manage', view: 'quality.view', number: 'ticketNo' },
  QUALITY_REPORT: { field: 'qualityInspectionId', model: 'qualityInspection', table: 'quality_inspections', label: '检测报告', permission: 'quality.manage', view: 'quality.view', number: 'inspectionNo' },
  INBOUND: { field: 'inboundReceiptId', model: 'inboundReceipt', table: 'inbound_receipts', label: '入库单', permission: 'inventory.manage', view: 'inventory.view', number: 'receiptNo' },
  OUTBOUND: { field: 'outboundReceiptId', model: 'outboundReceipt', table: 'outbound_receipts', label: '出库单', permission: 'inventory.manage', view: 'inventory.view', number: 'receiptNo' },
  SETTLEMENT: { field: 'financialSettlementId', model: 'financialSettlement', table: 'financial_settlements', label: '采购/销售结算单', permission: 'settlement.create', view: 'settlement.view', number: 'settlementNo' },
  PAYMENT_REQUEST: { field: 'paymentRequestId', model: 'paymentRequest', table: 'payment_requests', label: '付款申请单', permission: 'settlement.payment.apply', view: 'settlement.view', number: 'requestNo' },
  FUND: { field: 'fundTransactionId', model: 'fundTransaction', table: 'fund_transactions', label: '收付款单', permission: 'settlement.payment.execute', view: 'settlement.view', number: 'transactionNo' },
} as const;
export type ImageTargetType = keyof typeof TARGETS;
export const ATTACHMENT_LINK_FIELDS = ['partnerId', 'contractId', 'waybillId', 'weighTicketId', 'weighTaskId', 'qualityTaskId', 'qualitySampleId', 'qualityInspectionId', 'inboundReceiptId', 'outboundReceiptId', 'inventoryReversalId', 'fundTransactionId', 'paymentRequestId', 'financialSettlementId', 'logisticsContractId', 'logisticsSettlementId', 'driverId', 'vehicleId'] as const;
export const UNLINKED = Object.fromEntries(ATTACHMENT_LINK_FIELDS.map(field => [field, null]));
export const isLinkedImage = (attachment: any) => ATTACHMENT_LINK_FIELDS.some(field => Boolean(attachment[field]));
export const imageTarget = (attachment: any) => (Object.entries(TARGETS).find(([, config]) => Boolean(attachment[config.field]))?.[0] || null) as ImageTargetType | null;

/** 与原单据附件门禁一致；解除关联同时要求满足原单据删除附件的条件。 */
export function imageTargetCategory(type: ImageTargetType, record: any, requested?: string, removing = false): string {
  const status = record.status;
  const fail = (message: string): never => { throw new BadRequestException(message); };
  if (type === 'CONTRACT') {
    if (!['DRAFT', 'REJECTED'].includes(status)) fail('合同已提交审批或已生效，不能从业务影像修改附件');
    const category = record.type === 'BILATERAL' ? requested : record.type === 'SALES' ? 'SALES_CONTRACT' : 'PURCHASE_CONTRACT';
    if (!category || !['PURCHASE_CONTRACT', 'SALES_CONTRACT', 'OTHER'].includes(category)) fail('请选择采购合同、销售合同或其他附件类别');
    return category!;
  }
  if (type === 'WAYBILL') {
    if (!['ARRIVED', 'SIGNED'].includes(status) || (removing && status === 'SIGNED')) fail('只有到达后且未确认签收的运单可解除凭证关联；追加凭证须在到达后');
    const category = requested || 'RECEIPT_OTHER';
    if (!['RECEIPT_DOCUMENT', 'RECEIPT_PHOTO', 'RECEIPT_OTHER'].includes(category)) fail('请选择签收单、收货现场照片或其他交接凭证');
    return category;
  }
  if (type === 'WEIGH_TICKET') {
    if (['REVIEWED', 'VOIDED'].includes(status) || (removing && status === 'COMPLETED')) fail('磅单已完成复核、作废或锁定，不能修改该附件关联');
    return 'WEIGH_TICKET';
  }
  if (type === 'QUALITY_REPORT') {
    if (['CONFIRMED', 'VOIDED'].includes(status)) fail('检测报告已确认或作废，不能修改该附件关联');
    return 'REPORT';
  }
  if (type === 'INBOUND') {
    if (status !== 'PENDING') fail('只有待入库单可以修改附件关联');
    return 'INBOUND_RECEIPT';
  }
  if (type === 'OUTBOUND') {
    if (['POSTED', 'CANCELLED'].includes(status)) fail('已出库或作废车次不能修改附件关联');
    return 'OUTBOUND_RECEIPT';
  }
  if (type === 'SETTLEMENT') {
    if (!(removing ? ['DRAFT'] : ['DRAFT', 'CONFIRMED', 'PARTIALLY_SETTLED', 'SETTLED']).includes(status)) fail('当前结算单已锁定，不能修改该附件关联');
    return 'SETTLEMENT_CONFIRMATION';
  }
  if (type === 'PAYMENT_REQUEST') {
    if (!['DRAFT', 'REJECTED', 'BUSINESS_CONFIRMED'].includes(status)) fail('付款申请已进入审批或付款阶段，不能修改附件关联');
    return 'PAYMENT_BASIS';
  }
  if (removing && !['PENDING_CLAIM', 'PARTIALLY_CLAIMED', 'PENDING_CONFIRMATION'].includes(status)) fail('已确认资金单不能解除凭证关联');
  return 'BANK_RECEIPT';
}

export function inferImageType(attachment: any): string {
  if (attachment.businessImage) return attachment.businessImage.documentType;
  if (attachment.contractId) return 'CONTRACT';
  if (attachment.weighTicketId) return 'WEIGH_TICKET';
  if (attachment.qualityInspectionId) return 'QUALITY_REPORT';
  if (attachment.inboundReceiptId || attachment.outboundReceiptId || attachment.inventoryReversalId) return 'WAREHOUSE_DOCUMENT';
  if (attachment.financialSettlementId || attachment.fundTransactionId || attachment.paymentRequestId || attachment.logisticsSettlementId) return 'SETTLEMENT_DOCUMENT';
  if (attachment.waybillId) return attachment.category === 'RECEIPT_PHOTO' ? 'SCENE_PHOTO' : 'RECEIPT';
  if (attachment.weighTaskId || attachment.qualityTaskId || attachment.qualitySampleId) return attachment.category === 'VEHICLE_PLATE' ? 'VEHICLE_PHOTO' : 'SCENE_PHOTO';
  return 'OTHER';
}
