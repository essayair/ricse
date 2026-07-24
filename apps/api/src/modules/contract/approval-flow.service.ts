import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ApprovalFlowService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.approvalFlow.findMany({
      include: {
        nodes: {
          include: { assignee: { select: { id: true, username: true, name: true, role: true } } },
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

  async updateNode(id: string, data: { assigneeId?: string; enabled?: boolean }) {
    const node = await this.prisma.approvalFlowNode.findUnique({ where: { id } });
    if (!node) throw new NotFoundException('审批节点不存在');
    if (data.assigneeId) {
      const user = await this.prisma.user.findFirst({ where: { id: data.assigneeId, role: { in: ['APPROVER', 'ADMIN'] }, status: 'ACTIVE' } });
      if (!user) throw new BadRequestException('审批人必须是有效的审批员或管理员');
    }
    return this.prisma.approvalFlowNode.update({ where: { id }, data });
  }
}
