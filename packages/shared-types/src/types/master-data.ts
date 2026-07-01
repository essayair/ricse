/** 供应商 */
export interface Supplier {
  id: string;
  code: string;
  name: string;
  contactPerson?: string;
  contactPhone?: string;
  address?: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

/** 物料 */
export interface Material {
  id: string;
  code: string;
  name: string;
  category: string;
  unit: string;
  spec?: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

/** 仓库 */
export interface Warehouse {
  id: string;
  code: string;
  name: string;
  address?: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}
