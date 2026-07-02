import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
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
}
