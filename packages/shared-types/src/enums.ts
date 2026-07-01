/** 合同状态 */
export enum ContractStatus {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  EXECUTING = 'EXECUTING',
  COMPLETED = 'COMPLETED',
  VOIDED = 'VOIDED',
}

/** 合同类型 */
export enum ContractType {
  PURCHASE = 'PURCHASE',
  SALES = 'SALES',
  BILATERAL = 'BILATERAL',
}

/** 结算方式 */
export enum SettlementMethod {
  PREPAYMENT = 'PREPAYMENT',
  INSTALLMENT = 'INSTALLMENT',
  DELIVERY = 'DELIVERY',
  NET_30 = 'NET_30',
  NET_60 = 'NET_60',
}

/** 物料单位 */
export enum MaterialUnit {
  TON = 'TON',
  KG = 'KG',
  PIECE = 'PIECE',
  BAG = 'BAG',
}
