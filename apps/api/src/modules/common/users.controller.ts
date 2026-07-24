import { Controller, Post, Get, Patch, Body, Param, UseGuards, BadRequestException } from '@nestjs/common';
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
    if (!dto.username || !/^[a-zA-Z0-9]{3,}$/.test(dto.username)) {
      throw new BadRequestException('用户名只能包含字母和数字，至少3位');
    }
    if (!dto.password || dto.password.length < 6) {
      throw new BadRequestException('密码至少6位');
    }
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
  @ApiOperation({ summary: '更新用户（状态/名称/用户名）' })
  update(
    @Param('id') id: string,
    @Body() dto: { status?: string; name?: string; username?: string; phone?: string; email?: string },
  ) {
    if (dto.username !== undefined) {
      if (!dto.username || !/^[a-zA-Z0-9]{3,}$/.test(dto.username)) {
        throw new BadRequestException('用户名只能包含字母和数字，至少3位');
      }
    }
    return this.usersService.update(id, dto);
  }

  @Patch(':id/password')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员重置用户密码' })
  async resetPassword(
    @Param('id') id: string,
    @Body() dto: { password: string },
  ) {
    if (!dto.password || dto.password.length < 6) {
      throw new BadRequestException('密码至少6位');
    }
    return this.usersService.resetPassword(id, dto.password);
  }
}
