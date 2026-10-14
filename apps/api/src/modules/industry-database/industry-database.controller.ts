import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import { PermissionGuard } from '../common/permission.guard';
import { RequirePermission } from '../common/require-permission.decorator';
import {
  CreateCapacityProjectDto,
  CreateFluoriteProducerDto,
  CreateFluorochemicalProducerDto,
  CreateIndustryParkDto,
  CreateMineResourceDto,
  IndustryQueryDto,
  UpdateCapacityProjectDto,
  UpdateFluoriteProducerDto,
  UpdateFluorochemicalProducerDto,
  UpdateIndustryParkDto,
  UpdateMineResourceDto,
} from './dto/industry-database.dto';
import { IndustryDatabaseService } from './industry-database.service';

@ApiTags('产业数据库')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('industry-database')
export class IndustryDatabaseController {
  constructor(private readonly service: IndustryDatabaseService) {}

  @Get('summary') @RequirePermission('industry.database.view')
  summary() { return this.service.summary(); }

  @Get('fluorite-producers') @RequirePermission('industry.database.view')
  fluoriteList(@Query() query: IndustryQueryDto) { return this.service.list('fluorite', query); }
  @Get('fluorite-producers/:id') @RequirePermission('industry.database.view')
  fluorite(@Param('id') id: string) { return this.service.get('fluorite', id); }
  @Post('fluorite-producers') @RequirePermission('industry.database.manage')
  createFluorite(@Body() dto: CreateFluoriteProducerDto, @CurrentUser('id') userId: string) { return this.service.create('fluorite', dto, userId); }
  @Patch('fluorite-producers/:id') @RequirePermission('industry.database.manage')
  updateFluorite(@Param('id') id: string, @Body() dto: UpdateFluoriteProducerDto, @CurrentUser('id') userId: string) { return this.service.update('fluorite', id, dto, userId); }
  @Delete('fluorite-producers/:id') @RequirePermission('industry.database.manage')
  deleteFluorite(@Param('id') id: string) { return this.service.remove('fluorite', id); }

  @Get('fluorochemical-producers') @RequirePermission('industry.database.view')
  chemicalList(@Query() query: IndustryQueryDto) { return this.service.list('fluorochemical', query); }
  @Get('fluorochemical-producers/:id') @RequirePermission('industry.database.view')
  chemical(@Param('id') id: string) { return this.service.get('fluorochemical', id); }
  @Post('fluorochemical-producers') @RequirePermission('industry.database.manage')
  createChemical(@Body() dto: CreateFluorochemicalProducerDto, @CurrentUser('id') userId: string) { return this.service.create('fluorochemical', dto, userId); }
  @Patch('fluorochemical-producers/:id') @RequirePermission('industry.database.manage')
  updateChemical(@Param('id') id: string, @Body() dto: UpdateFluorochemicalProducerDto, @CurrentUser('id') userId: string) { return this.service.update('fluorochemical', id, dto, userId); }
  @Delete('fluorochemical-producers/:id') @RequirePermission('industry.database.manage')
  deleteChemical(@Param('id') id: string) { return this.service.remove('fluorochemical', id); }

  @Get('mine-resources') @RequirePermission('industry.database.view')
  mineList(@Query() query: IndustryQueryDto) { return this.service.list('mine', query); }
  @Get('mine-resources/:id') @RequirePermission('industry.database.view')
  mine(@Param('id') id: string) { return this.service.get('mine', id); }
  @Post('mine-resources') @RequirePermission('industry.database.manage')
  createMine(@Body() dto: CreateMineResourceDto, @CurrentUser('id') userId: string) { return this.service.create('mine', dto, userId); }
  @Patch('mine-resources/:id') @RequirePermission('industry.database.manage')
  updateMine(@Param('id') id: string, @Body() dto: UpdateMineResourceDto, @CurrentUser('id') userId: string) { return this.service.update('mine', id, dto, userId); }
  @Delete('mine-resources/:id') @RequirePermission('industry.database.manage')
  deleteMine(@Param('id') id: string) { return this.service.remove('mine', id); }

  @Get('capacity-projects') @RequirePermission('industry.database.view')
  capacityList(@Query() query: IndustryQueryDto) { return this.service.list('capacity', query); }
  @Get('capacity-projects/:id') @RequirePermission('industry.database.view')
  capacity(@Param('id') id: string) { return this.service.get('capacity', id); }
  @Post('capacity-projects') @RequirePermission('industry.database.manage')
  createCapacity(@Body() dto: CreateCapacityProjectDto, @CurrentUser('id') userId: string) { return this.service.create('capacity', dto, userId); }
  @Patch('capacity-projects/:id') @RequirePermission('industry.database.manage')
  updateCapacity(@Param('id') id: string, @Body() dto: UpdateCapacityProjectDto, @CurrentUser('id') userId: string) { return this.service.update('capacity', id, dto, userId); }
  @Delete('capacity-projects/:id') @RequirePermission('industry.database.manage')
  deleteCapacity(@Param('id') id: string) { return this.service.remove('capacity', id); }

  @Get('parks') @RequirePermission('industry.database.view')
  parkList(@Query() query: IndustryQueryDto) { return this.service.list('park', query); }
  @Get('parks/:id') @RequirePermission('industry.database.view')
  park(@Param('id') id: string) { return this.service.get('park', id); }
  @Post('parks') @RequirePermission('industry.database.manage')
  createPark(@Body() dto: CreateIndustryParkDto, @CurrentUser('id') userId: string) { return this.service.create('park', dto, userId); }
  @Patch('parks/:id') @RequirePermission('industry.database.manage')
  updatePark(@Param('id') id: string, @Body() dto: UpdateIndustryParkDto, @CurrentUser('id') userId: string) { return this.service.update('park', id, dto, userId); }
  @Delete('parks/:id') @RequirePermission('industry.database.manage')
  deletePark(@Param('id') id: string) { return this.service.remove('park', id); }
}
