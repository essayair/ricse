import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  controllers: [UsersController, AuthController],
  providers: [UsersService, AuthService],
  exports: [UsersService, AuthService],
})
export class CommonModule {}
