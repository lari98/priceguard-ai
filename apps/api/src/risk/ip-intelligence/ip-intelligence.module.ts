import { Module } from '@nestjs/common';
import { IP_INTELLIGENCE_PROVIDER } from './ip-intelligence.interface';
import { StaticTestIpIntelligenceProvider } from './static-test-ip-intelligence.provider';

@Module({
  providers: [{ provide: IP_INTELLIGENCE_PROVIDER, useClass: StaticTestIpIntelligenceProvider }],
  exports: [IP_INTELLIGENCE_PROVIDER],
})
export class IpIntelligenceModule {}
