import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LinkableAccountQueryDto, PlatformUserQueryDto } from './dto/platform-user.dto';

@Injectable()
export class PlatformUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: PlatformUserQueryDto) {
    const pageNo = query.pageNo || 1;
    const pageSize = query.pageSize || 20;
    const search = query.search?.trim();
    const where: Prisma.WechatIdentityWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.bindingStatus === 'BOUND'
        ? { linkedUserId: { not: null } }
        : query.bindingStatus === 'UNBOUND'
          ? { linkedUserId: null }
          : {}),
      ...(search ? {
        OR: [
          { nickName: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
          { openId: { contains: search } },
          { linkedUser: { is: { username: { contains: search, mode: 'insensitive' } } } },
          { linkedUser: { is: { name: { contains: search, mode: 'insensitive' } } } },
          { linkedUser: { is: { employee: { is: { phone: { contains: search } } } } } },
          { linkedUser: { is: { company: { is: { name: { contains: search, mode: 'insensitive' } } } } } },
        ],
      } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.wechatIdentity.count({ where }),
      this.prisma.wechatIdentity.findMany({
        where,
        include: {
          linkedUser: {
            select: {
              id: true, username: true, name: true, status: true,
              company: { select: { id: true, code: true, name: true, type: true } },
              employee: { select: { id: true, name: true, phone: true, status: true, department: { select: { id: true, name: true } } } },
              roleAssignments: { where: { status: 'ACTIVE' }, select: { role: { select: { id: true, code: true, name: true } } } },
            },
          },
          _count: { select: { bindingLogs: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (pageNo - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { total, pageNo, pageSize, list: rows.map((row) => this.toListItem(row)) };
  }

  async findOne(id: string) {
    const row = await this.prisma.wechatIdentity.findUnique({
      where: { id },
      include: {
        linkedUser: {
          select: {
            id: true, username: true, name: true, status: true,
            company: { select: { id: true, code: true, name: true, type: true } },
            employee: { select: { id: true, name: true, phone: true, status: true, department: { select: { id: true, name: true } } } },
            roleAssignments: { where: { status: 'ACTIVE' }, select: { role: { select: { code: true, name: true } } } },
          },
        },
        bindingLogs: {
          include: {
            user: { select: { id: true, username: true, name: true, company: { select: { code: true, name: true } } } },
            operatedBy: { select: { id: true, username: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!row) throw new NotFoundException('个人用户不存在');
    return this.toListItem(row);
  }

  async findLinkableAccounts(query: LinkableAccountQueryDto) {
    const search = query.search?.trim();
    return this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        employeeId: { not: null },
        companyId: { not: null },
        employee: { is: { status: 'ACTIVE' } },
        company: { is: { status: 'ACTIVE' } },
        OR: [
          { wechatIdentity: null },
          ...(query.currentIdentityId ? [{ wechatIdentity: { is: { id: query.currentIdentityId } } }] : []),
        ],
        ...(query.companyId ? { companyId: query.companyId } : {}),
        ...(search ? {
          AND: [{
            OR: [
              { username: { contains: search, mode: 'insensitive' } },
              { name: { contains: search, mode: 'insensitive' } },
              { employee: { is: { name: { contains: search, mode: 'insensitive' } } } },
              { employee: { is: { phone: { contains: search } } } },
              { company: { is: { name: { contains: search, mode: 'insensitive' } } } },
            ],
          }],
        } : {}),
      },
      select: {
        id: true, username: true, name: true, status: true,
        company: { select: { id: true, code: true, name: true, type: true } },
        employee: { select: { id: true, name: true, phone: true, department: { select: { id: true, name: true } } } },
        roleAssignments: { where: { status: 'ACTIVE' }, select: { role: { select: { code: true, name: true } } } },
        wechatIdentity: { select: { id: true, nickName: true } },
      },
      orderBy: [{ company: { code: 'asc' } }, { username: 'asc' }],
      take: 50,
    });
  }

  async updateStatus(id: string, status: string) {
    await this.assertIdentity(id);
    return this.prisma.wechatIdentity.update({
      where: { id },
      data: { status },
      select: { id: true, status: true, updatedAt: true },
    });
  }

  async bind(id: string, userId: string, operatedById: string, note?: string) {
    const [identity, user] = await Promise.all([
      this.prisma.wechatIdentity.findUnique({ where: { id } }),
      this.prisma.user.findUnique({ where: { id: userId }, include: { company: true, employee: true, wechatIdentity: true } }),
    ]);
    if (!identity) throw new NotFoundException('个人用户不存在');
    if (identity.status !== 'ACTIVE') throw new BadRequestException('已禁用的个人用户不能关联后台账号');
    if (!user) throw new NotFoundException('后台账号不存在');
    if (user.status !== 'ACTIVE') throw new BadRequestException('只能关联有效的后台账号');
    if (!user.companyId || !user.employeeId) throw new BadRequestException('后台账号必须关联企业和员工档案');
    if (user.company?.status !== 'ACTIVE' || user.employee?.status !== 'ACTIVE') {
      throw new BadRequestException('后台账号所属企业或员工档案已停用');
    }
    if (user.wechatIdentity && user.wechatIdentity.id !== id) {
      throw new ConflictException('该后台账号已关联其他小程序用户');
    }
    if (identity.linkedUserId === userId) return this.findOne(id);

    await this.prisma.$transaction(async (tx) => {
      const action = identity.linkedUserId ? 'REBIND' : 'BIND';
      await tx.wechatIdentity.update({ where: { id }, data: { linkedUserId: userId, linkedAt: new Date() } });
      await tx.wechatAccountBinding.create({
        data: { wechatIdentityId: id, userId, action, operatedById, note: note?.trim() || null },
      });
    });
    return this.findOne(id);
  }

  async unbind(id: string, operatedById: string, note?: string) {
    const identity = await this.assertIdentity(id);
    if (!identity.linkedUserId) throw new BadRequestException('该个人用户尚未关联后台账号');
    const previousUserId = identity.linkedUserId;
    await this.prisma.$transaction(async (tx) => {
      await tx.wechatIdentity.update({ where: { id }, data: { linkedUserId: null, linkedAt: null } });
      await tx.wechatAccountBinding.create({
        data: { wechatIdentityId: id, userId: previousUserId, action: 'UNBIND', operatedById, note: note?.trim() || null },
      });
    });
    return this.findOne(id);
  }

  private async assertIdentity(id: string) {
    const identity = await this.prisma.wechatIdentity.findUnique({ where: { id } });
    if (!identity) throw new NotFoundException('个人用户不存在');
    return identity;
  }

  private toListItem<T extends { openId: string }>(row: T) {
    const { openId, ...rest } = row;
    return { ...rest, openIdMasked: this.maskOpenId(openId) };
  }

  private maskOpenId(openId: string) {
    if (openId.length <= 10) return `${openId.slice(0, 3)}***`;
    return `${openId.slice(0, 6)}***${openId.slice(-4)}`;
  }
}
