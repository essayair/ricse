import { ContractStatus, ContractType, SettlementMethod } from '../enums';

/** 合约 */
export interface Contract {
  id: string;
  contractNo: string;
  title: string;
  type: ContractType;
  status: ContractStatus;
  supplierId: string;
  buyerId: string;
  totalAmount: number;
  signedAt: string;
  effectiveAt: string;
  expireAt: string;
  settlementMethod: SettlementMethod;
  remarks?: string;
  lineItems: ContractLineItem[];
  createdAt: string;
  updatedAt: string;
}

/** 合约行项 */
export interface ContractLineItem {
  id: string;
  contractId: string;
  materialId: string;
  materialName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  deliveryDate?: string;
  remarks?: string;
}

/** 创建合约请求 */
export interface CreateContractRequest {
  title: string;
  type: ContractType;
  supplierId: string;
  totalAmount: number;
  signedAt: string;
  effectiveAt: string;
  expireAt: string;
  settlementMethod: SettlementMethod;
  remarks?: string;
  lineItems: CreateContractLineItem[];
}

/** 创建合约行项 */
export interface CreateContractLineItem {
  materialId: string;
  quantity: number;
  unitPrice: number;
  deliveryDate?: string;
  remarks?: string;
}
