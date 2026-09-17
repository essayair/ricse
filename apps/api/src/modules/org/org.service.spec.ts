import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { OrgService } from './org.service';

describe('OrgService', () => {
  const prisma = mockDeep<PrismaService>();
  let service: OrgService;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (input: any) => (
      typeof input === 'function' ? input(prisma) : Promise.all(input)
    ));
    const module = await Test.createTestingModule({
      providers: [
        OrgService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(OrgService);
  });

  it('仅首个内部组织企业成为平台管理主体并自动建立综合事业部', async () => {
    prisma.partner.findUnique.mockResolvedValue({
      code: '300001', name: '和光云链有限公司', shortName: '和光云链', isInternal: true,
    } as any);
    prisma.company.findUnique.mockResolvedValue(null);
    prisma.company.count.mockResolvedValue(0);
    prisma.company.create.mockResolvedValue({ id: 'company-1', isManagementEntity: true } as any);
    prisma.businessUnit.create.mockResolvedValue({ id: 'bu-1' } as any);

    await service.createCompany({ partnerId: 'partner-1' });

    expect(prisma.company.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ isManagementEntity: true }),
    }));
    expect(prisma.businessUnit.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        code: 'BU-300001-001',
        name: '和光云链综合事业部',
        companyId: 'company-1',
      }),
    }));
  });

  it('后续内部签约企业不重复创建事业部', async () => {
    prisma.partner.findUnique.mockResolvedValue({
      code: '300002', name: '第二业务公司', shortName: null, isInternal: true,
    } as any);
    prisma.company.findUnique.mockResolvedValue(null);
    prisma.company.count.mockResolvedValue(1);
    prisma.company.create.mockResolvedValue({ id: 'company-2', isManagementEntity: false } as any);

    await service.createCompany({ partnerId: 'partner-2' });

    expect(prisma.company.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ isManagementEntity: false }),
    }));
    expect(prisma.businessUnit.create).not.toHaveBeenCalled();
  });

  it('业务单元编码按企业编码和三位流水号自动生成', async () => {
    prisma.company.findFirst.mockResolvedValue({
      id: 'company-1', code: '300001', type: 'INTERNAL', status: 'ACTIVE', isManagementEntity: true,
    } as any);
    prisma.businessUnit.findMany.mockResolvedValue([
      { code: 'BU-300001-001' },
      { code: 'BU-300001-002' },
    ] as any);
    prisma.businessUnit.create.mockResolvedValue({ id: 'unit-3', code: 'BU-300001-003' } as any);

    await service.createBusinessUnit({
      name: '玉门事业部',
      companyId: 'company-1',
      type: 'REGION',
    });

    expect(prisma.businessUnit.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ code: 'BU-300001-003', name: '玉门事业部' }),
    }));
  });

  it('业务单元编码不允许手工填写或创建后修改', async () => {
    await expect(service.createBusinessUnit({
      code: 'BU-CUSTOM',
      name: '玉门事业部',
      companyId: 'company-1',
    })).rejects.toThrow('编码由系统自动生成');

    prisma.businessUnit.findUnique.mockResolvedValue({ id: 'unit-1', code: 'BU-300001-001', companyId: 'company-1' } as any);
    await expect(service.updateBusinessUnit('unit-1', { code: 'BU-300001-009' }))
      .rejects.toThrow('编码创建后不能修改');
  });

  it('创建员工时保存去除首尾空格后的必填手机号', async () => {
    prisma.company.findUnique.mockResolvedValue({ id: 'company-1', status: 'ACTIVE' } as any);
    prisma.department.findUnique.mockResolvedValue({ id: 'department-1', companyId: 'company-1' } as any);
    prisma.employee.create.mockResolvedValue({ id: 'employee-1' } as any);

    await service.createEmployee({
      name: ' 张三 ',
      phone: ' 13800138000 ',
      companyId: 'company-1',
      departmentId: 'department-1',
    });

    expect(prisma.employee.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: '张三',
        phone: '13800138000',
      }),
    });
  });

  it('创建员工时未填写手机号会被拒绝', async () => {
    await expect(service.createEmployee({
      name: '张三',
      phone: '',
      companyId: 'company-1',
      departmentId: 'department-1',
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.employee.create).not.toHaveBeenCalled();
  });

  it('员工手机号必须为11位中国大陆手机号', async () => {
    await expect(service.createEmployee({
      name: '张三',
      phone: '1380013800',
      companyId: 'company-1',
      departmentId: 'department-1',
    })).rejects.toThrow('员工手机号必须为11位中国大陆手机号');

    await expect(service.createEmployee({
      name: '张三',
      phone: '12800138000',
      companyId: 'company-1',
      departmentId: 'department-1',
    })).rejects.toThrow('员工手机号必须为11位中国大陆手机号');
  });

  it('员工详情中可以修改手机号', async () => {
    prisma.employee.findUnique.mockResolvedValue({
      id: 'employee-1',
      company: { id: 'company-1' },
      department: { id: 'department-1' },
      user: null,
    } as any);
    prisma.company.findUnique.mockResolvedValue({ id: 'company-1', status: 'ACTIVE' } as any);
    prisma.department.findUnique.mockResolvedValue({ id: 'department-1', companyId: 'company-1' } as any);
    prisma.employee.update.mockResolvedValue({
      id: 'employee-1',
      phone: '13900139000',
    } as any);

    await service.updateEmployee('employee-1', { phone: ' 13900139000 ' });

    expect(prisma.employee.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'employee-1' },
      data: expect.objectContaining({ phone: '13900139000' }),
    }));
  });

  it('不同员工不能使用相同手机号', async () => {
    prisma.company.findUnique.mockResolvedValue({ id: 'company-1', status: 'ACTIVE' } as any);
    prisma.department.findUnique.mockResolvedValue({ id: 'department-1', companyId: 'company-1' } as any);
    prisma.employee.findFirst.mockResolvedValue({ id: 'employee-existing' } as any);

    await expect(service.createEmployee({
      name: '李四',
      phone: '13800138000',
      companyId: 'company-1',
      departmentId: 'department-1',
    })).rejects.toThrow('员工手机号已存在');

    expect(prisma.employee.create).not.toHaveBeenCalled();
  });

  it('员工部门必须属于所选企业', async () => {
    prisma.company.findUnique.mockResolvedValue({ id: 'company-1', status: 'ACTIVE' } as any);
    prisma.department.findUnique.mockResolvedValue({ id: 'department-2', companyId: 'company-2' } as any);

    await expect(service.createEmployee({
      name: '王五', phone: '13700137000', companyId: 'company-1', departmentId: 'department-2',
    })).rejects.toThrow('所属部门不属于所选企业');
  });

  it('停用员工时同步禁用账号并清除刷新令牌', async () => {
    prisma.employee.findUnique.mockResolvedValue({
      id: 'employee-1', name: '张三', status: 'ACTIVE',
      company: { id: 'company-1' }, department: { id: 'department-1' },
      user: { id: 'user-1', username: 'employee01', status: 'ACTIVE' },
    } as any);
    prisma.company.findUnique.mockResolvedValue({ id: 'company-1', status: 'ACTIVE' } as any);
    prisma.department.findUnique.mockResolvedValue({ id: 'department-1', companyId: 'company-1' } as any);
    prisma.employee.update.mockResolvedValue({ id: 'employee-1', status: 'DISABLED' } as any);

    await service.updateEmployee('employee-1', { status: 'DISABLED' });

    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user-1' },
      data: expect.objectContaining({ status: 'DISABLED', refreshToken: null }),
    }));
  });

  it('员工离职时保留档案并同步禁用账号', async () => {
    prisma.employee.findUnique.mockResolvedValue({
      id: 'employee-1', name: '张三', status: 'ACTIVE',
      company: { id: 'company-1' }, department: { id: 'department-1' },
      user: { id: 'user-1', username: 'employee01', status: 'ACTIVE' },
    } as any);
    prisma.company.findUnique.mockResolvedValue({ id: 'company-1', status: 'ACTIVE' } as any);
    prisma.department.findUnique.mockResolvedValue({ id: 'department-1', companyId: 'company-1' } as any);
    prisma.employee.update.mockResolvedValue({ id: 'employee-1', status: 'RESIGNED' } as any);

    await service.updateEmployee('employee-1', { status: 'RESIGNED' });

    expect(prisma.employee.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'RESIGNED' }),
    }));
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'DISABLED', refreshToken: null }),
    }));
  });

  it('员工跨企业调动时停用旧业务单元和角色授权并暂停账号', async () => {
    prisma.employee.findUnique.mockResolvedValue({
      id: 'employee-1', name: '张三', status: 'ACTIVE',
      company: { id: 'company-1' }, department: { id: 'department-1' },
      user: { id: 'user-1', username: 'employee01', status: 'ACTIVE' },
    } as any);
    prisma.company.findUnique.mockResolvedValue({ id: 'company-2', type: 'INTERNAL', status: 'ACTIVE' } as any);
    prisma.department.findUnique.mockResolvedValue({ id: 'department-2', companyId: 'company-2' } as any);
    prisma.employee.update.mockResolvedValue({ id: 'employee-1', companyId: 'company-2' } as any);
    prisma.userRoleAssignment.findMany.mockResolvedValue([{
      id: 'assignment-1', role: { code: 'SALESPERSON' },
    }] as any);

    await service.updateEmployee('employee-1', {
      companyId: 'company-2', departmentId: 'department-2',
    });

    expect(prisma.userBusinessUnit.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-1', status: 'ACTIVE' },
      data: expect.objectContaining({ status: 'DISABLED', isDefault: false }),
    }));
    expect(prisma.userRoleAssignment.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-1', status: 'ACTIVE' },
      data: expect.objectContaining({ status: 'DISABLED' }),
    }));
    expect(prisma.user.update).toHaveBeenLastCalledWith({
      where: { id: 'user-1' },
      data: { status: 'DISABLED', refreshToken: null },
    });
  });

  it('已开通账号的员工档案不允许删除', async () => {
    prisma.employee.findUnique.mockResolvedValue({
      id: 'employee-1', name: '张三', company: { id: 'company-1' }, department: { id: 'department-1' }, user: { id: 'user-1' },
    } as any);

    await expect(service.deleteEmployee('employee-1')).rejects.toThrow('不能删除历史档案');
    expect(prisma.employee.delete).not.toHaveBeenCalled();
  });
});
