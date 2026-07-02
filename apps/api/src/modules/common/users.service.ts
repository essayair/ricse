import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(data: { username: string; password: string; name: string; role?: string }) {
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
      },
      select: { id: true, username: true, name: true, role: true, createdAt: true },
    });
  }

  async findByUsername(username: string) {
    return this.prisma.user.findUnique({ where: { username } });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, username: true, name: true, role: true, status: true, createdAt: true },
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
}
