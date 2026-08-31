import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsNotEmptyObject, IsString, ValidateNested } from 'class-validator';
import { PolicyActionValue } from '../policy-engine.service';

const POLICY_ACTIONS: PolicyActionValue[] = [
  'NONE',
  'MONITOR',
  'WARN',
  'REQUEST_VERIFICATION',
  'RESTRICT',
  'MANUAL_REVIEW',
  'SUSPEND',
  'TERMINATE',
];

export class RuleInputDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ description: 'Nested AND/OR/NOT condition tree — see docs/architecture/RULE_ENGINE.md' })
  @IsNotEmptyObject()
  condition!: object;

  @ApiProperty({ enum: POLICY_ACTIONS })
  @IsIn(POLICY_ACTIONS)
  action!: PolicyActionValue;

  @ApiProperty()
  @IsBoolean()
  requiresHumanReview!: boolean;

  @ApiProperty()
  @IsInt()
  order!: number;
}

export class CreatePolicyDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ type: [RuleInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleInputDto)
  rules!: RuleInputDto[];
}
