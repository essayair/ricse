import { BadRequestException, Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import { MobileApprovalDecisionDto } from './dto/mobile-approval.dto';
import { MobileUserGuard } from './mobile-user.guard';
import { MOBILE_BUSINESS_MODULES, MobileBusinessModule, MobileWorkspaceService } from './mobile-workspace.service';

@ApiTags('小程序企业工作台')
@ApiBearerAuth()
@UseGuards(MobileUserGuard)
@Controller('mobile')
export class MobileWorkspaceController {
  constructor(private readonly service: MobileWorkspaceService) {}

  @Get('workspace')
  @ApiOperation({ summary: '企业工作台概览' })
  overview(@CurrentUser('id') userId: string) { return this.service.overview(userId); }

  @Get('business-modules')
  @ApiOperation({ summary: '查询当前用户可使用的移动业务模块' })
  businessModules(@CurrentUser('id') userId: string) { return this.service.businessModules(userId); }

  @Get('business/:module')
  @ApiOperation({ summary: '移动业务只读列表' })
  businessList(
    @CurrentUser('id') userId: string,
    @Param('module') rawModule: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const module = this.parseBusinessModule(rawModule);
    return this.service.businessList(userId, module, {
      search, status,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('business/:module/:id')
  @ApiOperation({ summary: '移动业务只读详情' })
  businessDetail(
    @CurrentUser('id') userId: string,
    @Param('module') rawModule: string,
    @Param('id') id: string,
  ) {
    return this.service.businessDetail(userId, this.parseBusinessModule(rawModule), id);
  }

  @Get('approvals')
  @ApiOperation({ summary: '我的待办或已办审批' })
  approvals(@CurrentUser('id') userId: string, @Query('status') status?: string) {
    return this.service.approvalList(userId, status === 'DONE' ? 'DONE' : 'PENDING');
  }

  @Get('approvals/:contractId')
  @ApiOperation({ summary: '移动端合同审批详情' })
  approvalDetail(@CurrentUser('id') userId: string, @Param('contractId') contractId: string) {
    return this.service.approvalDetail(userId, contractId);
  }

  @Patch('approvals/:contractId')
  @ApiOperation({ summary: '移动端同意或驳回合同' })
  decide(
    @CurrentUser() user: { id: string; role: string },
    @Param('contractId') contractId: string,
    @Body() dto: MobileApprovalDecisionDto,
  ) {
    return this.service.decide(user.id, user.role, contractId, dto.decision, dto.comment);
  }

  private parseBusinessModule(value: string): MobileBusinessModule {
    if (!MOBILE_BUSINESS_MODULES.includes(value as MobileBusinessModule)) {
      throw new BadRequestException('不支持的移动业务模块');
    }
    return value as MobileBusinessModule;
  }
}
