import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DRIZZLE, DrizzleDb } from '../db/db.provider';
import * as schema from '../db/schema';
import { ActorType } from '../common/request-context';

/**
 * Append-only by design: this service intentionally exposes no update/delete method.
 * The only code path that ever modifies an existing audit row is the DSR erasure flow
 * (apps/api/src/dsr/erasure.service.ts), which redacts rather than deletes, per ADR-0004.
 */
@Injectable()
export class AuditService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async log(entry: {
    tenantId: string;
    actorId: string | null;
    actorType: ActorType;
    action: string;
    beforeState?: unknown;
    afterState?: unknown;
  }) {
    const [created] = await this.db
      .insert(schema.auditLogEntries)
      .values({
        tenantId: entry.tenantId,
        actorId: entry.actorId,
        actorType: entry.actorType,
        action: entry.action,
        beforeState: entry.beforeState as object | undefined,
        afterState: entry.afterState as object | undefined,
      })
      .returning();
    return created;
  }

  async listForTenant(tenantId: string, limit = 100) {
    return this.db
      .select()
      .from(schema.auditLogEntries)
      .where(and(eq(schema.auditLogEntries.tenantId, tenantId)))
      .orderBy(desc(schema.auditLogEntries.createdAt))
      .limit(limit);
  }
}
