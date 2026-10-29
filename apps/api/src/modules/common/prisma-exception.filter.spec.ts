import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { mapPrismaKnownError } from './prisma-exception.filter';

const prismaError = (code: string) => new Prisma.PrismaClientKnownRequestError('mock', { code, clientVersion: 'test' });

describe('mapPrismaKnownError', () => {
  it('记录不存在转为 404', () => {
    expect(mapPrismaKnownError(prismaError('P2025'))).toBeInstanceOf(NotFoundException);
  });

  it('唯一约束冲突转为 409', () => {
    expect(mapPrismaKnownError(prismaError('P2002'))).toBeInstanceOf(ConflictException);
  });

  it('外键约束失败转为 400', () => {
    expect(mapPrismaKnownError(prismaError('P2003'))).toBeInstanceOf(BadRequestException);
  });

  it('其他错误码不转换，仍按服务器错误处理', () => {
    expect(mapPrismaKnownError(prismaError('P2034'))).toBeNull();
  });
});
