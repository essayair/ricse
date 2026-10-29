import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApprovalFlowService } from './approval-flow.service';
import { AdminGuard } from '../common/admin.guard';
import { UpdateApprovalFlowDto, UpdateApprovalNodeDto } from './dto/approval-flow.dto';

@ApiTags('审批流程配置')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), AdminGuard)
@Controller('approval-flows')
export class ApprovalFlowController {
  constructor(private readonly service: ApprovalFlowService) {}

  @Get()
  @ApiOperation({ summary: '审批流程配置列表' })
  findAll() {
    return this.service.findAll();
  }

  @Patch(':id')
  @ApiOperation({ summary: '修改审批流程参数' })
  updateFlow(@Param('id') id: string, @Body() data: UpdateApprovalFlowDto) {
    return this.service.updateFlow(id, data);
  }

  @Patch('nodes/:id')
  @ApiOperation({ summary: '修改审批节点' })
  updateNode(@Param('id') id: string, @Body() data: UpdateApprovalNodeDto) {
    return this.service.updateNode(id, data);
  }
}
