import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessOperationInterceptor } from './business-operation.interceptor';

describe('BusinessOperationInterceptor', () => {
  const prisma = mockDeep<PrismaService>();
  const interceptor = new BusinessOperationInterceptor(prisma);

  beforeEach(() => jest.clearAllMocks());

  function executionContext(request: Record<string, unknown>) {
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as ExecutionContext;
  }

  function handler(response: unknown) {
    return { handle: () => of(response) } as CallHandler;
  }

  it('创建合同后记录创建人、动作和业务单据 ID', async () => {
    prisma.businessOperationLog.create.mockResolvedValue({} as any);

    await lastValueFrom(interceptor.intercept(executionContext({
      method: 'POST', path: '/api/v1/contracts', body: {}, user: { id: 'user-1' },
    }), handler({ id: 'contract-1' })));

    expect(prisma.businessOperationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        businessType: 'CONTRACT',
        businessId: 'contract-1',
        action: 'CREATE',
        operatorId: 'user-1',
      }),
    });
  });

  it('合同详情在原权限校验完成后附加操作记录', async () => {
    const createdAt = new Date();
    prisma.businessOperationLog.findMany.mockResolvedValue([{
      id: 'log-1', action: 'CREATE', actionLabel: '创建合同', details: null, createdAt,
      operator: { id: 'user-1', name: '张三', username: 'zhangsan' },
    }] as any);

    const result: any = await lastValueFrom(interceptor.intercept(executionContext({
      method: 'GET', path: '/api/v1/contracts/contract-1', user: { id: 'user-1' },
    }), handler({ id: 'contract-1', title: '采购合同' })));

    expect(result.operationLogs).toHaveLength(1);
    expect(prisma.businessOperationLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { businessType: 'CONTRACT', businessId: 'contract-1' },
    }));
  });

  it('合同表单选项不会被误判为合同详情', async () => {
    const response = { defaultDepartmentId: 'dept-1', departments: [] };
    const result = await lastValueFrom(interceptor.intercept(executionContext({
      method: 'GET', path: '/api/v1/contracts/form-options', user: { id: 'user-1' },
    }), handler(response)));

    expect(result).toEqual(response);
    expect(prisma.businessOperationLog.findMany).not.toHaveBeenCalled();
  });

  it('生产任务关键动作记录在对应生产任务下', async () => {
    prisma.businessOperationLog.create.mockResolvedValue({} as any);

    await lastValueFrom(interceptor.intercept(executionContext({
      method: 'PATCH', path: '/api/v1/production/tasks/task-1/release', body: {}, user: { id: 'user-2' },
    }), handler({ id: 'task-1', status: 'RELEASED' })));

    expect(prisma.businessOperationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        businessType: 'PRODUCTION_TASK',
        businessId: 'task-1',
        action: 'RELEASE',
        operatorId: 'user-2',
      }),
    });
  });

  it('出库车次动作归集到出库管理主单', async () => {
    prisma.businessOperationLog.create.mockResolvedValue({} as any);

    await lastValueFrom(interceptor.intercept(executionContext({
      method: 'PATCH', path: '/api/v1/outbound-receipts/receipt-1/variance',
      body: { reason: '客户临时调整数量' }, user: { id: 'user-3' },
    }), handler({ id: 'receipt-1', outboundOrderId: 'outbound-order-1' })));

    expect(prisma.businessOperationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        businessType: 'OUTBOUND_ORDER',
        businessId: 'outbound-order-1',
        action: 'VARIANCE',
        operatorId: 'user-3',
      }),
    });
  });
});
