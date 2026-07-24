import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, HttpCode,
  UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { PartnerService } from './partner.service';
import { FileService } from '../common/file.service';
import { CurrentUser } from '../common/current-user.decorator';
import { normalizeUploadFilename } from '../common/filename-encoding';

@ApiTags('合作伙伴')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('partners')
export class PartnerController {
  constructor(
    private partnerService: PartnerService,
    private fileService: FileService,
  ) {}


  @Get('next-code')
  @ApiOperation({ summary: '获取下一个外部编码' })
  getNextCode() {
    return this.partnerService.generateNextExternalCode();
  }

  @Post()
  @ApiOperation({ summary: '创建合作伙伴' })
  create(@Body() dto: {
    code?: string; name: string; shortName?: string; shortCode?: string;
    taxId?: string; orgType?: string; category?: string;
    legalPerson?: string; legalPersonType?: string; legalIdCard?: string;
    controller?: string; controllerTitle?: string; controllerPhone?: string;
    contactPerson?: string; contactPhone?: string;
    isInternal?: boolean;
    country?: string; province?: string; city?: string; address?: string; bizAddress?: string;
    sourceRegion?: string; estDate?: string; regCapital?: number;
    regCurrency?: string; revenueScale?: string; groupName?: string; isParent?: boolean;
    taxType?: string; taxRating?: string; invoiceType?: string; relatedPartyType?: string;
    industry?: string; corpType?: string;
    licenseType?: string; licenseExpiry?: string;
    bizScope?: string; mainBiz?: string; tradingGoods?: string; equityStructure?: string; intro?: string;
    creditLimit?: number; roles: string[]; remark?: string;
  }, @CurrentUser('id') userId: string) {
    return this.partnerService.create(dto, userId);
  }

  @Get()
  @ApiOperation({ summary: '合作伙伴列表（分页）' })
  findAll(
    @Query('page') page?: string, @Query('pageSize') pageSize?: string,
    @Query('search') search?: string, @Query('role') role?: string,
    @Query('status') status?: string,
  ) {
    return this.partnerService.findAll({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      search, role, status,
    });
  }

  // 静态单段路由必须放在 :id 之前，避免 vehicles 被当作合作伙伴 ID。
  @Get('vehicles')
  @ApiOperation({ summary: '车辆列表（分页）' })
  findAllVehicles(
    @Query('page') page?: string, @Query('pageSize') pageSize?: string,
    @Query('status') status?: string, @Query('ownerId') ownerId?: string,
  ) {
    return this.partnerService.findAllVehicles({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      status, ownerId,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: '合作伙伴详情（含银行账户/车辆/仓库）' })
  findOne(@Param('id') id: string) {
    return this.partnerService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新合作伙伴（code/taxId/isInternal 不可修改）' })
  update(@Param('id') id: string, @Body() dto: {
    name?: string; shortName?: string; shortCode?: string;
    orgType?: string; category?: string;
    legalPerson?: string; legalPersonType?: string; legalIdCard?: string;
    controller?: string; controllerTitle?: string; controllerPhone?: string;
    contactPerson?: string; contactPhone?: string;
    country?: string; province?: string; city?: string;
    address?: string; bizAddress?: string; sourceRegion?: string;
    estDate?: string; regCapital?: number; regCurrency?: string;
    revenueScale?: string; groupName?: string; isParent?: boolean;
    taxType?: string; taxRating?: string; invoiceType?: string;
    relatedPartyType?: string; industry?: string; corpType?: string;
    licenseType?: string; licenseExpiry?: string;
    bizScope?: string; mainBiz?: string; tradingGoods?: string;
    equityStructure?: string; intro?: string;
    creditLimit?: number; roles?: string[]; status?: string; remark?: string;
  }) {
    return this.partnerService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: '删除合作伙伴（软删除）' })
  remove(@Param('id') id: string) {
    return this.partnerService.remove(id);
  }

  // ========== 银行账户 ==========

  @Post(':partnerId/bank-accounts')
  @ApiOperation({ summary: '添加银行账户' })
  createBankAccount(
    @Param('partnerId') partnerId: string,
    @Body() dto: { accountName: string; accountNo: string; bankName: string; bankCode?: string; accountType?: string; isDefault?: boolean },
  ) {
    return this.partnerService.createBankAccount({ ...dto, partnerId });
  }

  @Get(':partnerId/bank-accounts')
  @ApiOperation({ summary: '银行账户列表' })
  findBankAccounts(@Param('partnerId') partnerId: string) {
    return this.partnerService.findBankAccounts(partnerId);
  }

  @Delete('bank-accounts/:id')
  @HttpCode(204)
  @ApiOperation({ summary: '删除银行账户' })
  deleteBankAccount(@Param('id') id: string) {
    return this.partnerService.deleteBankAccount(id);
  }

  // ========== 车辆 ==========

  @Post('vehicles')
  @ApiOperation({ summary: '创建车辆' })
  createVehicle(@Body() dto: {
    plateNo: string; vehicleType: string; brand?: string; loadCapacity: number;
    ownerId?: string; ownerType?: string; driverName?: string; driverPhone?: string; remark?: string;
  }) {
    return this.partnerService.createVehicle(dto);
  }

  @Delete('vehicles/:id')
  @HttpCode(204)
  @ApiOperation({ summary: '删除车辆' })
  deleteVehicle(@Param('id') id: string) {
    return this.partnerService.deleteVehicle(id);
  }

  // ========== 附件/影像 ==========

  @Post(':partnerId/attachments')
  @ApiOperation({ summary: '上传附件（营业执照等）' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAttachment(
    @Param('partnerId') partnerId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('category') category: string,
  ) {
    if (!file) throw new BadRequestException('请选择文件');
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.mimetype)) {
      throw new BadRequestException('仅支持 JPG/PNG/WEBP/PDF 格式');
    }

    const originalName = normalizeUploadFilename(file.originalname);
    const result = await this.fileService.upload(file.buffer, originalName, file.mimetype);
    return this.partnerService.createAttachment({
      partnerId,
      fileName: result.fileName,
      originalName,
      mimeType: file.mimetype,
      size: result.size,
      category: category || 'OTHER',
    });
  }

  @Get(':partnerId/attachments')
  @ApiOperation({ summary: '附件列表' })
  findAttachments(@Param('partnerId') partnerId: string) {
    return this.partnerService.findAttachments(partnerId);
  }

  @Delete('attachments/:id')
  @HttpCode(204)
  @ApiOperation({ summary: '删除附件' })
  async deleteAttachment(@Param('id') id: string) {
    const att = await this.partnerService.findAttachmentById(id);
    if (att) await this.fileService.delete(att.fileName);
    return this.partnerService.deleteAttachment(id);
  }
}
