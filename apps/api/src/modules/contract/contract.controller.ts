import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, HttpCode, UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiConsumes } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ContractService } from './contract.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractStatusDto } from './dto/update-status.dto';
import { CurrentUser } from '../common/current-user.decorator';
import { FileService } from '../common/file.service';
import { normalizeUploadFilename } from '../common/filename-encoding';

@ApiTags('合同管理')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('contracts')
export class ContractController {
  constructor(
    private readonly contractService: ContractService,
    private readonly fileService: FileService,
  ) {}

  @Post()
  @ApiOperation({ summary: '创建合同' })
  create(@Body() dto: CreateContractDto, @CurrentUser('id') userId: string) {
    return this.contractService.create(dto, userId);
  }

  @Get()
  @ApiOperation({ summary: '合同列表（分页+多维筛选）' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'type', required: false, enum: ['PURCHASE', 'SALES', 'BILATERAL'] })
  @ApiQuery({ name: 'search', required: false, description: '合同号/标题/合作伙伴名称' })
  @ApiQuery({ name: 'sellerId', required: false, description: '合作伙伴 ID（买卖双方均匹配）' })
  @ApiQuery({ name: 'dateFrom', required: false, description: '签订日期起（ISO）' })
  @ApiQuery({ name: 'dateTo', required: false, description: '签订日期止（ISO）' })
  findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('search') search?: string,
    @Query('sellerId') sellerId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @CurrentUser('id') userId?: string,
  ) {
    return this.contractService.findAll({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      status,
      type,
      search,
      sellerId,
      dateFrom,
      dateTo,
    }, userId);
  }

  @Get(':id')
  @ApiOperation({ summary: '合同详情' })
  findOne(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.contractService.findOne(id, userId);
  }

  @Get(':id/approval-readiness')
  @ApiOperation({ summary: '提交前检查合同审批流程是否可用' })
  getApprovalReadiness(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.contractService.getApprovalReadiness(id, userId);
  }

  @Post(':id/attachments')
  @ApiOperation({ summary: '上传合同附件' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  async uploadAttachment(
    @Param('id') contractId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('category') category?: string,
    @Body('originalName') requestedName?: string,
    @CurrentUser('id') userId?: string,
  ) {
    if (!file) throw new BadRequestException('请选择文件');
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.mimetype)) throw new BadRequestException('仅支持 JPG/PNG/WEBP/PDF 格式');
    await this.contractService.findOne(contractId, userId, 'contract.edit');
    const originalName = (requestedName?.trim() || normalizeUploadFilename(file.originalname)).slice(0, 255);
    const result = await this.fileService.upload(file.buffer, originalName, file.mimetype);
    try {
      return await this.contractService.createAttachment({
        contractId,
        fileName: result.fileName,
        originalName,
        mimeType: file.mimetype,
        size: result.size,
        category: category || 'OTHER',
      });
    } catch (error) {
      try { await this.fileService.delete(result.fileName); } catch {}
      throw error;
    }
  }

  @Get('attachments/:id/view-url')
  @ApiOperation({ summary: '获取合同附件临时查看地址' })
  async getAttachmentViewUrl(@Param('id') id: string, @CurrentUser('id') userId: string) {
    const attachment = await this.contractService.findAttachmentById(id, userId);
    if (!attachment) throw new BadRequestException('附件不存在');
    return { url: await this.fileService.getUrl(attachment.fileName) };
  }

  @Delete('attachments/:id')
  @HttpCode(204)
  @ApiOperation({ summary: '删除合同附件' })
  async deleteAttachment(@Param('id') id: string, @CurrentUser('id') userId: string) {
    const attachment = await this.contractService.findAttachmentById(id, userId, 'contract.edit');
    if (!attachment) return;
    try {
      await this.fileService.delete(attachment.fileName);
    } catch {
      // 存储对象已丢失时仍清理数据库记录，保证删除操作可恢复。
    }
    await this.contractService.deleteAttachment(id);
  }

  @Patch('attachments/:id/name')
  @ApiOperation({ summary: '修改合同附件名称' })
  async renameAttachment(
    @Param('id') id: string,
    @Body('originalName') originalName?: string,
    @CurrentUser('id') userId?: string,
  ) {
    const name = originalName?.trim();
    if (!name) throw new BadRequestException('附件名称不能为空');
    if (name.length > 255) throw new BadRequestException('附件名称不能超过 255 个字符');
    const attachment = await this.contractService.findAttachmentById(id, userId, 'contract.edit');
    if (!attachment) throw new BadRequestException('附件不存在');
    return this.contractService.renameAttachment(id, name);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: '状态流转（提交审批/审批通过/驳回等）' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateContractStatusDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.contractService.updateStatus(id, dto, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: '编辑合同（仅草稿/已驳回状态）' })
  update(
    @Param('id') id: string,
    @Body() dto: {
      title?: string; type?: string; totalAmount?: number; sellerId?: string; buyerId?: string;
      signingPartnerId?: string; companyId?: string; departmentId?: string; externalNo?: string;
      contactPerson?: string; contactPhone?: string;
      pricingType?: string; overfillPct?: number; shortfallPct?: number;
      deliveryMethod?: string; deliveryLocation?: string;
      signedAt?: string; effectiveAt?: string; expireAt?: string;
      settlementMethod?: string; settlementBasis?: string;
      prepayPct?: number; paymentDays?: number; paymentMethod?: string;
      moistureRule?: string; impurityRule?: string; remarks?: string;
      lineItems?: Array<{
        materialId: string; materialName?: string;
        quantity: number; unit?: string;
        unitPrice: number; deliveryDate?: string; remarks?: string;
      }>;
    },
    @CurrentUser('id') userId?: string,
  ) {
    return this.contractService.update(id, dto, userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除合同（仅系统管理员可删除已作废合同）' })
  remove(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.contractService.remove(id, user);
  }
}
