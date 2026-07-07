import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ContractService } from './contract.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractStatusDto } from './dto/update-status.dto';
import { CurrentUser } from '../common/current-user.decorator';

@ApiTags('合同管理')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('contracts')
export class ContractController {
  constructor(private readonly contractService: ContractService) {}

  @Post()
  @ApiOperation({ summary: '创建合同' })
  create(@Body() dto: CreateContractDto, @CurrentUser('id') userId: string) {
    return this.contractService.create(dto, userId);
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

  @Patch(':id')
  @ApiOperation({ summary: '编辑合同（仅草稿状态可编辑）' })
  update(@Param('id') id: string, @Body() dto: {
    title?: string; totalAmount?: number; sellerId?: string; buyerId?: string;
    signedAt?: string; effectiveAt?: string; expireAt?: string;
    settlementMethod?: string; remarks?: string;
  }) {
    return this.contractService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除合同（软删除，仅草稿/已作废）' })
  remove(@Param('id') id: string) {
    return this.contractService.remove(id);
  }
}
