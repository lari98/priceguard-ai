import { Controller, Get, HttpCode, HttpStatus, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { sql } from 'drizzle-orm';
import { DRIZZLE, DrizzleDb } from './db/db.provider';

@Controller()
export class HealthController {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  /** Liveness: the process is running and handling HTTP. No dependency checks — an
   *  orchestrator restarting a container on liveness failure should only do so when the
   *  process itself is wedged, not when a downstream dependency is briefly unavailable.
   *  Wired into infra/docker/docker-compose.yml's healthcheck since Phase 2. */
  @Get('healthz')
  @ApiExcludeEndpoint()
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  /**
   * Readiness (Phase 8/Scale — see docs/adr/0010-scale-phase8-scope.md): the process AND
   * its real dependencies (Postgres) are usable. A load balancer / orchestrator should
   * stop routing new traffic to a replica failing this check, distinguishing "process is
   * up" from "process is up but broken" during a rolling deploy or a DB outage.
   */
  @Get('healthz/ready')
  @ApiExcludeEndpoint()
  @HttpCode(HttpStatus.OK)
  async readiness() {
    try {
      await this.db.execute(sql`SELECT 1`);
    } catch {
      throw new ServiceUnavailableException({ status: 'unavailable', reason: 'database unreachable' });
    }
    return { status: 'ready' };
  }
}
