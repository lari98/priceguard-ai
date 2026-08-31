import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/filters/http-exception.filter';

/**
 * Boots a real Nest application (real Postgres connection via DATABASE_URL, real
 * bcrypt/JWT) against the dedicated `geoguard_test` database — see README.md /
 * package.json's `test:e2e` script for how DATABASE_URL is set for this run.
 * No mocking of the database layer: these are true integration tests.
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new GlobalExceptionFilter());
  await app.init();
  return app;
}
