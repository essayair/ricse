import { IsString, MinLength, IsOptional, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'newuser' })
  @IsString()
  @MinLength(2)
  username: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: '张三' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({ example: 'USER', required: false })
  @IsOptional()
  @IsIn(['USER', 'ADMIN', 'APPROVER'])
  role?: string;
}
