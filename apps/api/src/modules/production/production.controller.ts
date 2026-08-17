import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import { PermissionGuard } from '../common/permission.guard';
import { RequirePermission } from '../common/require-permission.decorator';
import {
  ConfirmProductionQualityDto,
  CreateProductionCompletionDto,
  CreateProductionRecipeDto,
  CreateProductionTaskDto,
  RecordProductionQuantitiesDto,
  ReserveProductionMaterialsDto,
  UpdateProductionRecipeDto,
} from './dto/production.dto';
import { ProductionService } from './production.service';

@ApiTags('生产管理')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('production')
export class ProductionController {
  constructor(private readonly service: ProductionService) {}

  @Post('recipes')
  @RequirePermission('production.manage')
  createRecipe(@Body() dto: CreateProductionRecipeDto, @CurrentUser('id') userId: string) {
    return this.service.createRecipe(dto, userId);
  }

  @Get('recipes')
  @RequirePermission('production.view')
  findRecipes(
    @CurrentUser('id') userId: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.service.findRecipes({ search, status }, userId);
  }

  @Get('recipes/:id')
  @RequirePermission('production.view')
  findRecipe(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.findRecipe(id, userId);
  }

  @Patch('recipes/:id')
  @RequirePermission('production.manage')
  updateRecipe(
    @Param('id') id: string,
    @Body() dto: UpdateProductionRecipeDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.updateRecipe(id, dto, userId);
  }

  @Post('tasks')
  @RequirePermission('production.manage')
  createTask(@Body() dto: CreateProductionTaskDto, @CurrentUser('id') userId: string) {
    return this.service.createTask(dto, userId);
  }

  @Get('tasks')
  @RequirePermission('production.view')
  findTasks(
    @CurrentUser('id') userId: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('mode') mode?: string,
  ) {
    return this.service.findTasks({ search, status, mode }, userId);
  }

  @Get('traceability')
  @RequirePermission('production.view')
  traceability(@CurrentUser('id') userId: string, @Query('search') search?: string) {
    return this.service.traceability(userId, search);
  }

  @Get('tasks/:id/eligible-lots')
  @RequirePermission('production.view')
  eligibleLots(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.eligibleLots(id, userId);
  }

  @Get('tasks/:id')
  @RequirePermission('production.view')
  findTask(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.findTask(id, userId);
  }

  @Patch('tasks/:id/release')
  @RequirePermission('production.manage')
  releaseTask(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.releaseTask(id, userId);
  }

  @Patch('tasks/:id/reservations')
  @RequirePermission('production.manage')
  reserveMaterials(
    @Param('id') id: string,
    @Body() dto: ReserveProductionMaterialsDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.reserveMaterials(id, dto, userId);
  }

  @Post('tasks/:id/issue')
  @RequirePermission('production.post')
  issueMaterials(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.issueMaterials(id, userId);
  }

  @Post('tasks/:id/consume')
  @RequirePermission('production.manage')
  consumeMaterials(
    @Param('id') id: string,
    @Body() dto: RecordProductionQuantitiesDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.consumeMaterials(id, dto, userId);
  }

  @Post('tasks/:id/return')
  @RequirePermission('production.post')
  returnMaterials(
    @Param('id') id: string,
    @Body() dto: RecordProductionQuantitiesDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.returnMaterials(id, dto, userId);
  }

  @Post('tasks/:id/completions')
  @RequirePermission('production.manage')
  createCompletion(
    @Param('id') id: string,
    @Body() dto: CreateProductionCompletionDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.createCompletion(id, dto, userId);
  }

  @Patch('completions/:completionId/quality')
  confirmCompletionQuality(
    @Param('completionId') completionId: string,
    @Body() dto: ConfirmProductionQualityDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.confirmCompletionQuality(completionId, dto, userId);
  }

  @Post('completions/:completionId/post')
  @RequirePermission('production.post')
  postCompletion(@Param('completionId') completionId: string, @CurrentUser('id') userId: string) {
    return this.service.postCompletion(completionId, userId);
  }

  @Patch('tasks/:id/close')
  @RequirePermission('production.manage')
  closeTask(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.closeTask(id, userId);
  }

  @Patch('tasks/:id/cancel')
  @RequirePermission('production.manage')
  cancelTask(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.cancelTask(id, userId);
  }
}
