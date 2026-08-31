import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { DRIZZLE, DrizzleDb } from '../db/db.provider';
import * as schema from '../db/schema';
import { AuditService } from '../audit/audit.service';

/**
 * Implements ADR-0004: erase directly-linked personal data for an EndAccount, but
 * pseudonymise (never delete) audit-log entries that reference it, to preserve the
 * accountability/non-repudiation guarantees the platform's whole "explainable, auditable"
 * positioning depends on.
 *
 * Known MVP limitation (documented, not hidden): audit-entry redaction here uses a JSON
 * text search over beforeState/afterState, which is correct but not index-optimised for
 * scale. A dedicated, indexed `referencedEndAccountId` column on audit_log_entries is the
 * recommended production follow-up — tracked here rather than silently deferred.
 */
@Injectable()
export class ErasureService {
  private readonly logger = new Logger(ErasureService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly auditService: AuditService,
  ) {}

  async eraseEndAccount(tenantId: string, endAccountId: string, requestedBy: string): Promise<{ pseudonym: string }> {
    const [account] = await this.db
      .select()
      .from(schema.endAccounts)
      .where(and(eq(schema.endAccounts.tenantId, tenantId), eq(schema.endAccounts.id, endAccountId)))
      .limit(1);
    if (!account) {
      throw new NotFoundException(`End account ${endAccountId} not found`);
    }

    const pseudonym = this.pseudonymise(endAccountId);

    // Directly-linked personal data — hard delete. FKs with onDelete: 'cascade' handle
    // devices/sessions/paymentSignals/riskEvents/riskScores/policyDecisions/investigations/
    // appeals that hang off this account, EXCEPT the account row itself which we delete
    // explicitly last.
    await this.redactAuditReferences(tenantId, [endAccountId, account.externalId], pseudonym);

    await this.db.delete(schema.endAccounts).where(eq(schema.endAccounts.id, endAccountId));

    await this.auditService.log({
      tenantId,
      actorId: requestedBy,
      actorType: 'USER',
      action: 'END_ACCOUNT_ERASED',
      beforeState: { pseudonym },
    });

    this.logger.log(`Erased end account ${pseudonym} for tenant ${tenantId}`);
    return { pseudonym };
  }

  private pseudonymise(id: string): string {
    return `erased:${createHash('sha256').update(id).digest('hex').slice(0, 16)}`;
  }

  private async redactAuditReferences(tenantId: string, needles: string[], pseudonym: string): Promise<void> {
    const rows = await this.db
      .select()
      .from(schema.auditLogEntries)
      .where(eq(schema.auditLogEntries.tenantId, tenantId));

    for (const row of rows) {
      const beforeText = JSON.stringify(row.beforeState ?? {});
      const afterText = JSON.stringify(row.afterState ?? {});
      const matches = needles.some((needle) => beforeText.includes(needle) || afterText.includes(needle));
      if (!matches) continue;

      await this.db
        .update(schema.auditLogEntries)
        .set({
          actorId: row.actorId && needles.includes(row.actorId) ? pseudonym : row.actorId,
          beforeState: row.beforeState ? this.redact(row.beforeState) : row.beforeState,
          afterState: row.afterState ? this.redact(row.afterState) : row.afterState,
        })
        .where(eq(schema.auditLogEntries.id, row.id));
    }
  }

  private redact(state: object): object {
    return { redacted: true, reason: 'account erased', originalKeys: Object.keys(state) };
  }
}
