import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateCargoSpecDto {
  @IsIn(['FRAGMENT', 'RUN_OF_MINE', null]) cargoSpec: 'FRAGMENT' | 'RUN_OF_MINE' | null;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
