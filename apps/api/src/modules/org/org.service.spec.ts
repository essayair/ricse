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

  it('已开通账号的员工档案不允许删除', async () => {
    prisma.employee.findUnique.mockResolvedValue({
      id: 'employee-1', name: '张三', company: { id: 'company-1' }, department: { id: 'department-1' }, user: { id: 'user-1' },
    } as any);

    await expect(service.deleteEmployee('employee-1')).rejects.toThrow('不能删除历史档案');
    expect(prisma.employee.delete).not.toHaveBeenCalled();
  });
});
