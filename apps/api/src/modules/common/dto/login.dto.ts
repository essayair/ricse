import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin', description: '登录用户名或员工手机号' })
  @IsString()
  @MinLength(2)
  username: string;

  @ApiProperty({ example: 'admin123' })
  @IsString()
  @MinLength(4)
  password: string;
}
