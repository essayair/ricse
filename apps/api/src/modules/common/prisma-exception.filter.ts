import { ArgumentsHost, BadRequestException, Catch, ConflictException, HttpException, NotFoundException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '@prisma/client';

/**
 * 业务服务未自行处理的 Prisma 已知请求错误统一转为业务语义的 4xx：
 * 记录不存在（P2025）→ 404，唯一约束冲突（P2002）→ 409，外键约束（P2003）→ 400。
 * 其余 Prisma 错误仍交给默认处理返回 500，避免掩盖程序缺陷。
 */
export function mapPrismaKnownError(error: Prisma.PrismaClientKnownRequestError): HttpException | null {
  switch (error.code) {
    case 'P2025':
      return new NotFoundException('记录不存在或已删除');
    case 'P2002':
      return new ConflictException('数据已存在，请检查编码、名称等唯一信息是否重复');
    case 'P2003':
      return new BadRequestException('关联数据不存在，或该数据仍被其他单据引用');
    default:
      return null;
  }
}

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter extends BaseExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    super.catch(mapPrismaKnownError(exception) ?? exception, host);
  }
}
