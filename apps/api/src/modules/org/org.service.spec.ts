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
    const module = await Test.createTestingModule({
      providers: [
        OrgService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(OrgService);
  });

  it('创建员工时保存去除首尾空格后的必填手机号', async () => {
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
    prisma.employee.findUnique.mockResolvedValue({ id: 'employee-1' } as any);
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
    prisma.employee.findFirst.mockResolvedValue({ id: 'employee-existing' } as any);

    await expect(service.createEmployee({
      name: '李四',
      phone: '13800138000',
      companyId: 'company-1',
      departmentId: 'department-1',
    })).rejects.toThrow('员工手机号已存在');

    expect(prisma.employee.create).not.toHaveBeenCalled();
  });
});
