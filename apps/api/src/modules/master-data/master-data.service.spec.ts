import { Test, TestingModule } from '@nestjs/testing';
import { MasterDataService } from './master-data.service';
import { PrismaService } from '../../prisma/prisma.service';
import { mockDeep } from 'jest-mock-extended';

describe('MasterDataService', () => {
  let service: MasterDataService;
  let prisma: ReturnType<typeof mockDeep<PrismaService>>;

  const mockSupplier = { id: 's-1', code: 'SUP001', name: '测试供应商', contactPerson: '张三', contactPhone: '13800000000', address: null, status: 'ACTIVE', createdAt: new Date(), updatedAt: new Date() };
  const mockMaterial = { id: 'm-1', code: 'MAT001', name: '测试物料', category: '测试', unit: 'TON', spec: null, status: 'ACTIVE', createdAt: new Date(), updatedAt: new Date() };
  const mockWarehouse = { id: 'w-1', code: 'WH001', name: '测试仓库', address: '测试地址', status: 'ACTIVE', createdAt: new Date(), updatedAt: new Date() };

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MasterDataService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<MasterDataService>(MasterDataService);
  });

  describe('Suppliers', () => {
    it('创建供应商', async () => {
      prisma.supplier.create.mockResolvedValue(mockSupplier as any);
      const result = await service.createSupplier({ code: 'SUP001', name: '测试供应商' });
      expect(result.name).toBe('测试供应商');
    });

    it('查询供应商列表（分页）', async () => {
      prisma.supplier.findMany.mockResolvedValue([mockSupplier] as any);
      prisma.supplier.count.mockResolvedValue(1);

      const result = await service.findAllSuppliers({});
      expect(result.items).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
    });

    it('搜索供应商', async () => {
      prisma.supplier.findMany.mockResolvedValue([mockSupplier] as any);
      prisma.supplier.count.mockResolvedValue(1);

      const result = await service.findAllSuppliers({ search: '测试' });
      expect(result.items).toHaveLength(1);
      expect(prisma.supplier.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ OR: expect.any(Array) }),
        }),
      );
    });
  });

  describe('Materials', () => {
    it('创建物料', async () => {
      prisma.material.create.mockResolvedValue(mockMaterial as any);
      const result = await service.createMaterial({ code: 'MAT001', name: '测试物料', category: '测试' });
      expect(result.name).toBe('测试物料');
    });

    it('按分类筛选物料', async () => {
      prisma.material.findMany.mockResolvedValue([mockMaterial] as any);
      prisma.material.count.mockResolvedValue(1);

      const result = await service.findAllMaterials({ category: '测试' });
      expect(result.items).toHaveLength(1);
    });
  });

  describe('Warehouses', () => {
    it('创建仓库', async () => {
      prisma.warehouse.create.mockResolvedValue(mockWarehouse as any);
      const result = await service.createWarehouse({ code: 'WH001', name: '测试仓库' });
      expect(result.name).toBe('测试仓库');
    });

    it('查询所有仓库', async () => {
      prisma.warehouse.findMany.mockResolvedValue([mockWarehouse] as any);
      const result = await service.findAllWarehouses();
      expect(result).toHaveLength(1);
    });
  });
});
