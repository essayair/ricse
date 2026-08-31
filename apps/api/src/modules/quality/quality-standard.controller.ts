import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import {
  SaveQualityMethodPreferenceDto,
  UpsertQualityIndicatorDefinitionDto,
  UpsertQualityMethodDto,
  UpsertQualityTemplateDto,
} from './dto/quality-standard.dto';
import { QualityStandardService } from './quality-standard.service';

@ApiTags('质检标准管理')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('quality-standards')
export class QualityStandardController {
  constructor(private readonly service: QualityStandardService) {}

  @Get('indicators')
  @ApiOperation({ summary: '检测指标列表' })
  indicators(@CurrentUser('id') userId: string, @Query('search') search?: string, @Query('status') status?: string) {
    return this.service.findIndicators(userId, search, status);
  }

  @Post('indicators')
  createIndicator(@Body() dto: UpsertQualityIndicatorDefinitionDto, @CurrentUser('id') userId: string) {
    return this.service.createIndicator(dto, userId);
  }

  @Patch('indicators/:id')
  updateIndicator(@Param('id') id: string, @Body() dto: UpsertQualityIndicatorDefinitionDto, @CurrentUser('id') userId: string) {
    return this.service.updateIndicator(id, dto, userId);
  }

  @Get('methods')
  @ApiOperation({ summary: '检测方法列表' })
  methods(@CurrentUser('id') userId: string, @Query('search') search?: string, @Query('status') status?: string) {
    return this.service.findMethods(userId, search, status);
  }

  @Post('methods')
  createMethod(@Body() dto: UpsertQualityMethodDto, @CurrentUser('id') userId: string) {
    return this.service.createMethod(dto, userId);
  }

  @Patch('methods/:id')
  updateMethod(@Param('id') id: string, @Body() dto: UpsertQualityMethodDto, @CurrentUser('id') userId: string) {
    return this.service.updateMethod(id, dto, userId);
  }

  @Get('templates')
  @ApiOperation({ summary: '质检模板列表' })
  templates(
    @CurrentUser('id') userId: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('scene') scene?: string,
  ) {
    return this.service.findTemplates(userId, search, status, scene);
  }

  @Get('templates/:id')
  template(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.findTemplate(id, userId);
  }

  @Post('templates')
  createTemplate(@Body() dto: UpsertQualityTemplateDto, @CurrentUser('id') userId: string) {
    return this.service.createTemplate(dto, userId);
  }

  @Patch('templates/:id')
  updateTemplate(@Param('id') id: string, @Body() dto: UpsertQualityTemplateDto, @CurrentUser('id') userId: string) {
    return this.service.updateTemplate(id, dto, userId);
  }

  @Get('resolve')
  @ApiOperation({ summary: '按物料和业务场景解析默认质检模板及用户最近检测方法' })
  resolve(
    @Query('materialId') materialId: string,
    @Query('scene') scene: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.resolveForMaterial(materialId, scene || 'GENERAL', userId);
  }

  @Put('preferences')
  savePreference(@Body() dto: SaveQualityMethodPreferenceDto, @CurrentUser('id') userId: string) {
    return this.service.savePreference(dto, userId);
  }
}
