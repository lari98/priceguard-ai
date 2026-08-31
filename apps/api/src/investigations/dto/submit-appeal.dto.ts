import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class SubmitAppealDto {
  @ApiProperty()
  @IsString()
  investigationId!: string;

  @ApiProperty()
  @IsString()
  submittedByExternalId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message!: string;
}
