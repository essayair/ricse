import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ApprovalFlowService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    const now = new Date();
    return this.prisma.approvalFlow.findMany({
      include: {
        nodes: {
          include: {
            role: {
              select: {
                id: true,
                code: true,
                name: true,
                status: true,
                _count: {
                  select: {
                    assignments: {
                      where: {
                        status: 'ACTIVE',
                        effectiveAt: { lte: now },
                        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
                        user: { status: 'ACTIVE' },
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: { step: 'asc' },
        },
      },
      orderBy: { contractType: 'asc' },
    });
  }

  async updateFlow(id: string, data: { amountThreshold?: number | null; status?: string }) {
    const flow = await this.prisma.approvalFlow.findUnique({ where: { id } });
    if (!flow) throw new NotFoundException('审批流程不存在');
    if (data.status && !['ACTIVE', 'INACTIVE'].includes(data.status)) throw new BadRequestException('流程状态无效');
    return this.prisma.approvalFlow.update({
      where: { id },
      data: { amountThreshold: data.amountThreshold, status: data.status },
    });
  }

  async updateNode(id: string, data: {
    roleId?: string;
    approvalMode?: string;
    scopeType?: string;
    enabled?: boolean;
  }) {
    const node = await this.prisma.approvalFlowNode.findUnique({ where: { id } });
    if (!node) throw new NotFoundException('审批节点不存在');
    if (data.roleId) {
      const role = await this.prisma.role.findFirst({
        where: {
          id: data.roleId,
          status: 'ACTIVE',
          permissions: { some: { permission: { code: 'contract.approve' } } },
        },
      });
      if (!role) throw new BadRequestException('节点角色必须有效并拥有合同审批权限');
    }
    if (data.approvalMode && !['ALL', 'ANY'].includes(data.approvalMode)) {
      throw new BadRequestException('审批方式仅支持会签或或签');
    }
    if (data.scopeType && !['DEPARTMENT', 'COMPANY', 'ALL'].includes(data.scopeType)) {
      throw new BadRequestException('人员范围仅支持合同部门、合同企业或全平台');
    }
    return this.prisma.approvalFlowNode.update({ where: { id }, data });
  }
}
