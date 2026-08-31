import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNotNull } from 'drizzle-orm';
import { DRIZZLE, DrizzleDb } from '../db/db.provider';
import * as schema from '../db/schema';
import { UnionFind } from './union-find';

export interface FraudCluster {
  endAccountIds: string[];
  clusterSize: number;
  sharedDeviceHashes: string[];
  sharedPaymentTokens: string[];
}

const DEFAULT_MIN_CLUSTER_SIZE = 3;

/**
 * Phase 5 fraud graph: detects clusters of end-accounts that share a device or a payment
 * method — Scenario 8 from docs/PHASE_0_DISCOVERY.md §E ("large group of accounts share
 * devices and payment methods; graph engine detects suspicious cluster"). Implemented as a
 * connected-components algorithm (union-find) over edges derived from real
 * `devices`/`payment_signals` rows — a real graph algorithm, just running directly against
 * Postgres rather than a dedicated graph database (see docs/adr/0007-fraud-graph-on-postgres.md
 * for why, and what a real Neo4j-backed version would add at scale).
 */
@Injectable()
export class FraudGraphService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async detectClusters(tenantId: string, minClusterSize = DEFAULT_MIN_CLUSTER_SIZE): Promise<FraudCluster[]> {
    const [deviceRows, paymentRows] = await Promise.all([
      this.db
        .select({ deviceHash: schema.devices.deviceHash, endAccountId: schema.deviceAccountLinks.endAccountId })
        .from(schema.deviceAccountLinks)
        .innerJoin(schema.devices, eq(schema.devices.id, schema.deviceAccountLinks.deviceId))
        .where(eq(schema.deviceAccountLinks.tenantId, tenantId)),
      this.db
        .select({ providerToken: schema.paymentSignals.providerToken, endAccountId: schema.paymentSignals.endAccountId })
        .from(schema.paymentSignals)
        .where(and(eq(schema.paymentSignals.tenantId, tenantId), isNotNull(schema.paymentSignals.providerToken))),
    ]);

    // Group accounts by shared signal, keeping only signals actually shared by >1 account
    // (a device/payment token used by exactly one account is not a graph edge).
    const accountsByDevice = groupBy(deviceRows, (r) => r.deviceHash, (r) => r.endAccountId);
    const accountsByPayment = groupBy(
      paymentRows.filter(isNotNullToken),
      (r) => r.providerToken,
      (r) => r.endAccountId,
    );

    const uf = new UnionFind();
    const sharedDevicesByAccount = new Map<string, Set<string>>();
    const sharedPaymentsByAccount = new Map<string, Set<string>>();

    for (const [deviceHash, accountIds] of accountsByDevice) {
      const unique = [...new Set(accountIds)];
      if (unique.length < 2) continue;
      for (const id of unique) uf.add(id);
      for (let i = 1; i < unique.length; i++) uf.union(unique[0], unique[i]);
      for (const id of unique) {
        if (!sharedDevicesByAccount.has(id)) sharedDevicesByAccount.set(id, new Set());
        sharedDevicesByAccount.get(id)!.add(deviceHash);
      }
    }

    for (const [token, accountIds] of accountsByPayment) {
      const unique = [...new Set(accountIds)];
      if (unique.length < 2) continue;
      for (const id of unique) uf.add(id);
      for (let i = 1; i < unique.length; i++) uf.union(unique[0], unique[i]);
      for (const id of unique) {
        if (!sharedPaymentsByAccount.has(id)) sharedPaymentsByAccount.set(id, new Set());
        sharedPaymentsByAccount.get(id)!.add(token as string);
      }
    }

    const components = uf.getComponents().filter((c) => c.length >= minClusterSize);

    return components.map((accountIds) => {
      const sharedDeviceHashes = new Set<string>();
      const sharedPaymentTokens = new Set<string>();
      for (const id of accountIds) {
        for (const h of sharedDevicesByAccount.get(id) ?? []) sharedDeviceHashes.add(h);
        for (const t of sharedPaymentsByAccount.get(id) ?? []) sharedPaymentTokens.add(t);
      }
      return {
        endAccountIds: accountIds.sort(),
        clusterSize: accountIds.length,
        sharedDeviceHashes: [...sharedDeviceHashes],
        sharedPaymentTokens: [...sharedPaymentTokens],
      };
    });
  }

  async detectAndPersistClusters(tenantId: string, minClusterSize = DEFAULT_MIN_CLUSTER_SIZE): Promise<FraudCluster[]> {
    const clusters = await this.detectClusters(tenantId, minClusterSize);

    await this.db.delete(schema.fraudClusters).where(eq(schema.fraudClusters.tenantId, tenantId));
    if (clusters.length > 0) {
      await this.db.insert(schema.fraudClusters).values(
        clusters.map((c) => ({
          tenantId,
          endAccountIds: c.endAccountIds,
          sharedSignals: { deviceHashes: c.sharedDeviceHashes, paymentTokens: c.sharedPaymentTokens },
          clusterSize: c.clusterSize,
        })),
      );
    }
    return clusters;
  }
}

function groupBy<T, K, V>(rows: T[], keyFn: (row: T) => K, valueFn: (row: T) => V): Map<K, V[]> {
  const map = new Map<K, V[]>();
  for (const row of rows) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(valueFn(row));
  }
  return map;
}

function isNotNullToken<T extends { providerToken: string | null }>(row: T): row is T & { providerToken: string } {
  return row.providerToken !== null;
}
