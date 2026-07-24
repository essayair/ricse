import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    username: string; password: string; name: string;
    role?: string; employeeId?: string; companyId?: string; businessGroupId?: string;
  }) {
    const existing = await this.prisma.user.findUnique({
      where: { username: data.username },
    });
    if (existing) throw new ConflictException('用户名已存在');

    const hashed = await bcrypt.hash(data.password, 10);
    return this.prisma.user.create({
      data: {
        username: data.username,
        password: hashed,
        name: data.name,
        role: data.role || 'USER',
        employeeId: data.employeeId,
        companyId: data.companyId,
        businessGroupId: data.businessGroupId,
      },
      select: { id: true, username: true, name: true, role: true, employeeId: true, companyId: true, businessGroupId: true, createdAt: true },
    });
  }

  async findByUsername(username: string) {
    return this.prisma.user.findUnique({ where: { username } });
  }

  async findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true, username: true, name: true, role: true, status: true,
        employeeId: true, companyId: true, businessGroupId: true, createdAt: true,
        employee: { select: { id: true, name: true, department: { select: { name: true } } } },
        company: { select: { id: true, code: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true, username: true, name: true, role: true, status: true,
        employeeId: true, companyId: true, businessGroupId: true, createdAt: true,
        employee: { select: { id: true, name: true, department: { select: { name: true } } } },
      },
    });
    if (!user) throw new NotFoundException('用户不存在');
    return user;
  }

  async findByRefreshToken(refreshToken: string) {
    const users = await this.prisma.user.findMany({
      where: { refreshToken: { not: null } },
      select: { id: true, username: true, name: true, role: true, refreshToken: true },
    });

    for (const user of users) {
      if (user.refreshToken && (await bcrypt.compare(refreshToken, user.refreshToken))) {
        return user;
      }
    }
    return null;
  }

  async setRefreshToken(userId: string, hash: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: hash },
    });
  }

  async clearRefreshToken(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });
  }

  async update(id: string, data: { role?: string; status?: string; name?: string; username?: string; phone?: string; email?: string }) {
    return this.prisma.user.update({
      where: { id },
      data,
      select: { id: true, username: true, name: true, role: true, status: true, phone: true, email: true, updatedAt: true },
    });
  }

  async resetPassword(id: string, newPassword: string) {
    const hashed = await bcrypt.hash(newPassword, 10);
    return this.prisma.user.update({
      where: { id },
      data: { password: hashed, refreshToken: null },
      select: { id: true, username: true, name: true },
    });
  }
}
