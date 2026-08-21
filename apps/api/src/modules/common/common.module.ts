import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { FileService } from './file.service';
import { AdminGuard } from './admin.guard';
import { HealthController } from './health.controller';
import { PermissionGuard } from './permission.guard';
import { WechatTokenService } from './wechat-token.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET')!,
        signOptions: {
          expiresIn: (configService.get<string>('JWT_EXPIRES_IN') || '24h') as any,
        },
      }),
    }),
  ],
  controllers: [UsersController, AuthController, HealthController],
  providers: [UsersService, AuthService, JwtStrategy, FileService, AdminGuard, PermissionGuard, WechatTokenService],
  exports: [UsersService, AuthService, FileService, AdminGuard, PermissionGuard, WechatTokenService],
})
export class CommonModule {}
