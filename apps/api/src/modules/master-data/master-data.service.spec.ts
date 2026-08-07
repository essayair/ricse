import { Test, TestingModule } from '@nestjs/testing';
import {
  buildStandardCommodityFingerprint,
  buildStandardCommodityName,
  MasterDataService,
} from './master-data.service';
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
    standardCommodityId: 'std-1', referenceType: 'TRADING_GOODS', commodityForm: '精粉',
    grade: 'CaF₂≥97%', unit: 'TON', spec: null, sourceRegion: null,
    packageType: '散装', isVirtual: false, specs: null, hsCode: null, taxCode: null,
    internalCode: null, qcTemplate: null, status: 'ACTIVE', remark: null,
    createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
  };
  const mockStandard = {
    id: 'std-1', code: 'STD000001', name: '萤石精粉-CaF₂≥97%',
    categoryId: 'cat-1', baseName: '萤石', commodityForm: '精粉',
    coreSpecName: 'CaF₂', coreSpecOperator: '≥', coreSpecValue: '97', coreSpecUnit: '%',
    packageType: '散装', unit: '吨', fingerprint: 'fp-1', status: 'ACTIVE',
    createdAt: new Date(), updatedAt: new Date(),
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
    beforeEach(() => {
      prisma.standardCommodity.findUnique.mockResolvedValue(mockStandard as any);
      prisma.material.findFirst.mockResolvedValue(null);
    });

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
      prisma.material.findMany.mockResolvedValue([{ code: 'TRD000001' }] as any);
      prisma.material.create
        .mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('编码重复', {
          code: 'P2002', clientVersion: '5.22.0', meta: { target: ['code'] },
        }))
        .mockResolvedValueOnce({ ...mockMaterial, code: 'TRD000002', category: mockCategory } as any);

      const result = await service.createMaterial({
        code: 'TRD000001', name: '萤石粉', categoryId: 'cat-1',
      });

      expect(result.code).toBe('TRD000002');
      expect(prisma.material.create).toHaveBeenLastCalledWith(expect.objectContaining({
        data: expect.objectContaining({ code: 'TRD000002' }),
      }));
    });

    it('物料大类不存在时返回明确业务错误', async () => {
      prisma.materialCategory.findUnique.mockResolvedValue(null);
      await expect(service.createMaterial({
        code: 'MAT0001', name: '萤石粉', categoryId: 'missing-category',
      })).rejects.toThrow('所选物料大类不存在或已被删除');
      expect(prisma.material.create).not.toHaveBeenCalled();
    });

    it('下一个物料编码按参考类型前缀的最大值生成', async () => {
      prisma.material.findMany.mockResolvedValue([
        { code: 'TRD000009' }, { code: 'TRD-000012' }, { code: 'TRD-ZZ' },
      ] as any);
      await expect(service.generateNextMaterialCode()).resolves.toBe('TRD000013');
    });

    it('无相同标准商品时自动创建并生成名称与编码', async () => {
      prisma.materialCategory.findUnique.mockResolvedValue({ id: 'cat-1' } as any);
      prisma.standardCommodity.findUnique.mockResolvedValue(null);
      prisma.standardCommodity.findMany.mockResolvedValue([] as any);
      prisma.standardCommodity.create.mockResolvedValue(mockStandard as any);
      prisma.material.findMany.mockResolvedValue([] as any);
      prisma.material.create.mockResolvedValue({
        ...mockMaterial, code: 'TRD000001', name: mockStandard.name,
        standardCommodity: mockStandard, category: mockCategory,
      } as any);

      await service.createMaterial({
        categoryId: 'cat-1', baseName: '萤石', commodityForm: '精粉',
        coreSpecName: 'CaF₂', coreSpecOperator: '≥', coreSpecValue: '97',
        coreSpecUnit: '%', packageType: '散装', unit: '吨',
      });

      expect(prisma.standardCommodity.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ name: '萤石精粉-CaF₂≥97%' }),
      }));
      expect(prisma.material.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ code: 'TRD000001', standardCommodityId: 'std-1' }),
      }));
    });

    it('结构化建档以所选分类名称生成商品名称', async () => {
      prisma.materialCategory.findUnique.mockResolvedValue({ id: 'cat-1', name: '萤石' } as any);
      prisma.material.findMany.mockResolvedValue([] as any);
      prisma.material.create.mockResolvedValue({ ...mockMaterial, name: '萤石精粉-CaF₂≥97%' } as any);

      await service.createMaterial({
        categoryId: 'cat-1', baseName: '不应使用的手工名称', commodityForm: '精粉',
        coreSpecName: 'CaF₂', coreSpecOperator: '≥', coreSpecValue: '97',
        coreSpecUnit: '%', packageType: '吨袋', unit: '吨',
      });

      expect(prisma.material.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ name: '萤石精粉-CaF₂≥97%' }),
      }));
    });

    it('相同标准商品和参考类型不重复建档', async () => {
      prisma.materialCategory.findUnique.mockResolvedValue({ id: 'cat-1' } as any);
      prisma.material.findFirst.mockResolvedValue({
        id: 'm-existing', code: 'TRD000001', name: mockStandard.name,
      } as any);

      await expect(service.createMaterial({
        categoryId: 'cat-1', baseName: '萤石', commodityForm: '精粉',
        coreSpecName: 'CaF₂', coreSpecOperator: '≥', coreSpecValue: '97',
        coreSpecUnit: '%', packageType: '散装',
      })).rejects.toThrow('该物料已存在：TRD000001');
      expect(prisma.material.create).not.toHaveBeenCalled();
    });

    it('相同标准商品允许使用不同参考类型建立业务物料', async () => {
      prisma.materialCategory.findUnique.mockResolvedValue({ id: 'cat-1' } as any);
      prisma.material.findMany.mockResolvedValue([] as any);
      prisma.material.create.mockResolvedValue({ ...mockMaterial, code: 'FGD000001', referenceType: 'FINISHED_GOODS' } as any);

      const result = await service.createMaterial({
        categoryId: 'cat-1', baseName: '萤石', commodityForm: '精粉', referenceType: 'FINISHED_GOODS',
        coreSpecName: 'CaF₂', coreSpecOperator: '≥', coreSpecValue: '97',
        coreSpecUnit: '%', packageType: '散装',
      });
      expect(result.code).toBe('FGD000001');
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

    it('维护物料时不允许通过接口改写物料身份', async () => {
      prisma.material.findUnique.mockResolvedValue({
        ...mockMaterial, category: mockCategory, standardCommodity: mockStandard,
      } as any);
      prisma.material.update.mockResolvedValue({
        ...mockMaterial, status: 'INACTIVE', category: mockCategory, standardCommodity: mockStandard,
      } as any);

      await service.updateMaterial('m-1', {
        name: '不应生效的名称', categoryId: 'other-category', unit: '千克', status: 'INACTIVE',
      } as any);

      expect(prisma.material.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.not.objectContaining({
          name: expect.anything(), categoryId: expect.anything(), unit: expect.anything(),
        }),
      }));
    });
  });

  describe('标准商品规则', () => {
    it('商品名称按品名、形态和核心规格拼接，不包含包装', () => {
      expect(buildStandardCommodityName({
        baseName: '萤石', commodityForm: '精粉', coreSpecName: 'CaF₂',
        coreSpecOperator: '≥', coreSpecValue: '97', coreSpecUnit: '%', packageType: '1吨吨袋',
      })).toBe('萤石精粉-CaF₂≥97%');
    });

    it('查重指纹忽略空格和大小写', () => {
      const base = { categoryId: 'cat-1', baseName: ' Fluorite ', commodityForm: 'Powder', unit: '吨' };
      expect(buildStandardCommodityFingerprint(base)).toBe(
        buildStandardCommodityFingerprint({ ...base, baseName: 'fluorite', commodityForm: ' powder ' }),
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
