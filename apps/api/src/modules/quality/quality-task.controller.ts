import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import { FinalizeQualityTaskDto } from './dto/finalize-quality-task.dto';
import { QualityInspectionService } from './quality-inspection.service';

@ApiTags('到货质检任务')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('quality-tasks')
export class QualityTaskController {
  constructor(private readonly service: QualityInspectionService) {}

  @Get()
  @ApiOperation({ summary: '到货质检任务分页检索' })
  findAll(
    @CurrentUser('id') userId: string,
    @Query('page') page?: string, @Query('pageSize') pageSize?: string,
    @Query('search') search?: string, @Query('status') status?: string,
    @Query('conclusion') conclusion?: string, @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.service.findTasks({
      page: page ? Number(page) : undefined, pageSize: pageSize ? Number(pageSize) : undefined,
      search, status, conclusion, dateFrom, dateTo,
    }, userId);
  }

  @Get(':id')
  @ApiOperation({ summary: '到货质检任务详情及机构检测报告' })
  findOne(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.findTask(id, userId);
  }

  @Patch(':id/finalize')
  @ApiOperation({ summary: '根据有效检测报告形成最终质检结论' })
  finalize(
    @Param('id') id: string, @Body() dto: FinalizeQualityTaskDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.finalizeTask(id, dto, userId);
  }
}
