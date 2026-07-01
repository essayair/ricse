import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { ContractService } from './contract.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractStatusDto } from './dto/update-status.dto';

@ApiTags('合同管理')
@ApiBearerAuth()
@Controller('contracts')
export class ContractController {
  constructor(
    private readonly contractService: ContractService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @ApiOperation({ summary: '创建合同' })
  async create(@Body() dto: CreateContractDto) {
    // 临时：查询 admin 用户作为创建者（JWT 完善后替换）
    const admin = await this.prisma.user.findFirst({
      where: { role: 'ADMIN' },
    });
    return this.contractService.create(dto, admin?.id || 'placeholder');
  }

  @Get()
  @ApiOperation({ summary: '合同列表（分页）' })
  findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.contractService.findAll({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      status,
      search,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: '合同详情' })
  findOne(@Param('id') id: string) {
    return this.contractService.findOne(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: '更新合同状态（审核流）' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateContractStatusDto) {
    return this.contractService.updateStatus(id, dto);
  }
}
