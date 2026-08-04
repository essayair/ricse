import { Test, TestingModule } from '@nestjs/testing';
import { MasterDataService } from './master-data.service';
import { PrismaService } from '../../prisma/prisma.service';
import { mockDeep } from 'jest-mock-extended';
import { Prisma } from '@prisma/client';

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
      expect(prisma.materialCategory.create).toHaveBeenCalledWith({
        data: { name: '萤石粉', parentId: null, sort: 1 },
      });
    });

    it('只允许在一级分类下创建二级分类', async () => {
      prisma.materialCategory.findUnique.mockResolvedValue({
        id: 'cat-2', parentId: 'cat-1',
      } as any);

      await expect(service.createCategory({
        name: '三级分类',
        parentId: 'cat-2',
      })).rejects.toThrow('物料分类最多支持两级');
    });

    it('同级分类名称不能重复', async () => {
      prisma.materialCategory.findFirst.mockResolvedValue({ id: 'cat-1' } as any);

      await expect(service.createCategory({ name: '萤石粉' }))
        .rejects.toThrow('同级分类名称已存在');
    });

    it('查询分类树（仅顶级）', async () => {
      prisma.materialCategory.findMany.mockResolvedValue([{ ...mockCategory, children: [] }] as any);
      const result = await service.findAllCategories();
      expect(result).toHaveLength(1);
    });

    it('分类被物料引用时禁止删除', async () => {
      prisma.materialCategory.findUnique.mockResolvedValue({
        id: 'cat-1',
        _count: { children: 0, materials: 2 },
      } as any);

      await expect(service.deleteCategory('cat-1'))
        .rejects.toThrow('该分类已被物料引用，不能删除');
      expect(prisma.materialCategory.delete).not.toHaveBeenCalled();
    });

    it('存在子分类时禁止删除一级分类', async () => {
      prisma.materialCategory.findUnique.mockResolvedValue({
        id: 'cat-1',
        _count: { children: 1, materials: 0 },
      } as any);

      await expect(service.deleteCategory('cat-1'))
        .rejects.toThrow('该分类下仍有子分类，请先处理子分类');
      expect(prisma.materialCategory.delete).not.toHaveBeenCalled();
    });

    it('无引用分类可以删除', async () => {
      prisma.materialCategory.findUnique.mockResolvedValue({
        id: 'cat-1',
        _count: { children: 0, materials: 0 },
      } as any);
      prisma.materialCategory.delete.mockResolvedValue(mockCategory as any);

      const result = await service.deleteCategory('cat-1');
      expect(result.id).toBe('cat-1');
    });
  });

  describe('Materials', () => {
    it('创建物料', async () => {
      prisma.materialCategory.findUnique.mockResolvedValue({ id: 'cat-1' } as any);
      prisma.material.create.mockResolvedValue({ ...mockMaterial, category: mockCategory } as any);
      const result = await service.createMaterial({
        code: 'MT-000001', name: '萤石粉', categoryId: 'cat-1', grade: 'CaF₂≥97%',
      });
      expect(result.name).toBe('萤石粉');
    });

    it('系统编码重复时自动重新分配，不返回 500', async () => {
      prisma.materialCategory.findUnique.mockResolvedValue({ id: 'cat-1' } as any);
      prisma.material.findMany.mockResolvedValue([{ code: 'MAT0001' }] as any);
      prisma.material.create
        .mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('编码重复', {
          code: 'P2002', clientVersion: '5.22.0', meta: { target: ['code'] },
        }))
        .mockResolvedValueOnce({ ...mockMaterial, code: 'MAT0002', category: mockCategory } as any);

      const result = await service.createMaterial({
        code: 'MAT0001', name: '萤石粉', categoryId: 'cat-1',
      });

      expect(result.code).toBe('MAT0002');
      expect(prisma.material.create).toHaveBeenLastCalledWith(expect.objectContaining({
        data: expect.objectContaining({ code: 'MAT0002' }),
      }));
    });

    it('物料大类不存在时返回明确业务错误', async () => {
      prisma.materialCategory.findUnique.mockResolvedValue(null);
      await expect(service.createMaterial({
        code: 'MAT0001', name: '萤石粉', categoryId: 'missing-category',
      })).rejects.toThrow('所选物料大类不存在或已被删除');
      expect(prisma.material.create).not.toHaveBeenCalled();
    });

    it('下一个物料编码按全部 MAT 数字编码最大值生成', async () => {
      prisma.material.findMany.mockResolvedValue([
        { code: 'MAT0009' }, { code: 'MAT-0012' }, { code: 'MAT-ZZ' },
      ] as any);
      await expect(service.generateNextMaterialCode()).resolves.toBe('MAT0013');
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
