export interface IpIntelligenceResult {
  country: string;
  asn?: string;
  vpnLikelihood: number;
}

export interface IpIntelligenceProvider {
  lookup(ipAddress: string): Promise<IpIntelligenceResult>;
}

export const IP_INTELLIGENCE_PROVIDER = Symbol('IP_INTELLIGENCE_PROVIDER');
