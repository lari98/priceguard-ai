import { Injectable, Logger } from '@nestjs/common';
import { IpIntelligenceProvider, IpIntelligenceResult } from './ip-intelligence.interface';

/**
 * ⚠️ NOT REAL IP GEOLOCATION / VPN DETECTION. ⚠️
 *
 * Per docs/PHASE_0_DISCOVERY.md §M and ADR-0002, the MVP deliberately does not build
 * proprietary IP reputation/geolocation — Module A/B (IP Intelligence, VPN/Proxy
 * Detection) is meant to be a pluggable third-party provider integration, not something
 * built from scratch here. This class exists only so the ingestion pipeline's *shape*
 * (call a provider -> get country/ASN/VPN-likelihood -> feed into scoring) is real,
 * wired, and testable end-to-end without pretending unimplemented functionality exists.
 *
 * It recognises a small set of synthetic, documented test IPs (used by the e2e test
 * suite and the seed data) and otherwise returns a deliberately unhelpful "UNKNOWN, no
 * VPN signal" result — it must NEVER be mistaken for a production IP-intelligence
 * integration. Replacing this with a real provider (e.g. one of the vendors compared in
 * docs/PHASE_0_DISCOVERY.md §Q) is an explicit, tracked follow-up before this platform is
 * used against real traffic.
 */
@Injectable()
export class StaticTestIpIntelligenceProvider implements IpIntelligenceProvider {
  private readonly logger = new Logger(StaticTestIpIntelligenceProvider.name);
  private warnedOnce = false;

  private readonly syntheticTable: Record<string, IpIntelligenceResult> = {
    '198.51.100.10': { country: 'DE', asn: 'AS3320-DEMO', vpnLikelihood: 0.02 },
    '198.51.100.20': { country: 'PK', asn: 'AS45595-DEMO', vpnLikelihood: 0.05 },
    '203.0.113.50': { country: 'PK', asn: 'AS-VPNDEMO', vpnLikelihood: 0.93 },
  };

  async lookup(ipAddress: string): Promise<IpIntelligenceResult> {
    if (!this.warnedOnce) {
      this.logger.warn(
        'StaticTestIpIntelligenceProvider is in use — this is a documented stand-in for a real IP-intelligence provider, NOT production-grade geolocation/VPN detection. See ADR-0002.',
      );
      this.warnedOnce = true;
    }
    return this.syntheticTable[ipAddress] ?? { country: 'UNKNOWN', vpnLikelihood: 0 };
  }
}
