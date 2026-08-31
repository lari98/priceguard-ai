import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class DecideAppealDto {
  @ApiProperty({ enum: ['UPHELD', 'OVERTURNED'] })
  @IsIn(['UPHELD', 'OVERTURNED'])
  outcome!: 'UPHELD' | 'OVERTURNED';

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}
