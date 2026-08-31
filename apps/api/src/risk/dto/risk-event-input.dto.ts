import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsISO31661Alpha2, IsIP, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

const EVENT_TYPES = ['LOGIN', 'SESSION_START', 'PAYMENT', 'SUBSCRIPTION_REGION_CHANGE'] as const;
export type RiskEventTypeValue = (typeof EVENT_TYPES)[number];

/**
 * Mirrors docs/architecture/openapi.yaml's RiskEventInput schema — keep both in sync.
 * `whitelist: true` on the global ValidationPipe (see main.ts) rejects any field not
 * listed here, so a tenant cannot smuggle unexpected data into the pipeline.
 */
export class RiskEventInputDto {
  @ApiProperty({ description: "Tenant's own opaque identifier for the end account." })
  @IsString()
  @MaxLength(256)
  accountId!: string;

  @ApiProperty({ description: "SDK's own session correlation id (opaque string)." })
  @IsString()
  @MaxLength(256)
  sdkSessionId!: string;

  @ApiProperty()
  @IsIP()
  ipAddress!: string;

  @ApiProperty({ description: 'SDK-generated device identifier — not a hardware serial.' })
  @IsString()
  @MaxLength(256)
  deviceId!: string;

  @ApiProperty()
  @IsISO8601()
  timestamp!: string;

  @ApiProperty({ description: 'ISO 3166-1 alpha-2 country code of the billed/pricing region.' })
  @IsISO31661Alpha2()
  pricingCountry!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  locale?: string;

  @ApiProperty({ required: false, description: 'Derived from a tokenized payment signal — never a raw card number.' })
  @IsOptional()
  @IsISO31661Alpha2()
  paymentCountry?: string;

  @ApiProperty({ enum: EVENT_TYPES })
  @IsIn(EVENT_TYPES)
  eventType!: RiskEventTypeValue;
}
