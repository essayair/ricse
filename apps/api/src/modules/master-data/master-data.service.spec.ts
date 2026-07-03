import { Test, TestingModule } from '@nestjs/testing';
import { MasterDataService } from './master-data.service';
import { PrismaService } from '../../prisma/prisma.service';
import { mockDeep } from 'jest-mock-extended';

describe('MasterDataService', () => {
  let service: MasterDataService;
  let prisma: ReturnType<typeof mockDeep<PrismaService>>;

  const mockCategory = {
    id: 'cat-1', name: '萤石粉', parentId: null, sort: 1,
    createdAt: new Date(), updatedAt: new Date(),
  };
  const mockMaterial = {
    id: 'm-1', code: 'MT-000001', name: '萤石粉', categoryId: 'cat-1',
    grade: 'CaF₂≥97%', unit: 'TON', spec: null, sourceRegion: null,
    packageType: null, status: 'ACTIVE', remark: null,
    createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
  };
  const mockWarehouse = {
    id: 'w-1', code: 'WH-001', name: '金华仓', type: 'SELF', partnerId: null,
    address: '浙江金华', manager: null, managerPhone: null,
    status: 'ACTIVE', remark: null, createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
  };

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

  describe('MaterialCategory', () => {
    it('创建物料分类', async () => {
      prisma.materialCategory.create.mockResolvedValue(mockCategory as any);
      const result = await service.createCategory({ name: '萤石粉', sort: 1 });
      expect(result.name).toBe('萤石粉');
    });

    it('查询分类树（仅顶级）', async () => {
      prisma.materialCategory.findMany.mockResolvedValue([{ ...mockCategory, children: [] }] as any);
      const result = await service.findAllCategories();
      expect(result).toHaveLength(1);
    });
  });

  describe('Materials', () => {
    it('创建物料', async () => {
      prisma.material.create.mockResolvedValue({ ...mockMaterial, category: mockCategory } as any);
      const result = await service.createMaterial({
        code: 'MT-000001', name: '萤石粉', categoryId: 'cat-1', grade: 'CaF₂≥97%',
      });
      expect(result.name).toBe('萤石粉');
    });

    it('查询物料列表（分页）', async () => {
      prisma.material.findMany.mockResolvedValue([{ ...mockMaterial, category: mockCategory }] as any);
      prisma.material.count.mockResolvedValue(1);
      const result = await service.findAllMaterials({});
      expect(result.items).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
    });

    it('按分类 ID 筛选物料', async () => {
      prisma.material.findMany.mockResolvedValue([{ ...mockMaterial, category: mockCategory }] as any);
      prisma.material.count.mockResolvedValue(1);
      await service.findAllMaterials({ categoryId: 'cat-1' });
      expect(prisma.material.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ categoryId: 'cat-1' }) }),
      );
    });
  });

  describe('Warehouses', () => {
    it('创建仓库', async () => {
      prisma.warehouse.create.mockResolvedValue(mockWarehouse as any);
      const result = await service.createWarehouse({ code: 'WH-001', name: '金华仓' });
      expect(result.name).toBe('金华仓');
    });

    it('查询仓库列表', async () => {
      prisma.warehouse.findMany.mockResolvedValue([{ ...mockWarehouse, partner: null }] as any);
      const result = await service.findAllWarehouses();
      expect(result).toHaveLength(1);
    });
  });
});
