import { Controller, Post, Get, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { UsersService } from './users.service';

@ApiTags('用户管理')
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: '创建用户（开通账号）' })
  create(@Body() dto: {
    username: string; password: string; name: string; role?: string;
    employeeId?: string; companyId?: string; businessGroupId?: string;
  }) {
    return this.usersService.create(dto);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '用户列表' })
  findAll() {
    return this.usersService.findAll();
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新用户（角色/状态）' })
  update(
    @Param('id') id: string,
    @Body() dto: { role?: string; status?: string; name?: string; phone?: string; email?: string },
  ) {
    return this.usersService.update(id, dto);
  }
}
